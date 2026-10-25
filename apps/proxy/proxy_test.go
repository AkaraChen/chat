package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

type hit struct{ Path, Auth, APIKey, Model string }

// fakeUpstream records requests and answers with a minimal chat completion.
type fakeUpstream struct {
	*httptest.Server
	mu   sync.Mutex
	hits []hit
}

func newFakeUpstream() *fakeUpstream {
	f := &fakeUpstream{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct{ Model string }
		json.Unmarshal(body, &req)
		f.mu.Lock()
		f.hits = append(f.hits, hit{r.URL.Path, r.Header.Get("Authorization"), r.Header.Get("x-api-key"), req.Model})
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"c","object":"chat.completion","created":1,"model":%q,"choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`, req.Model)
	}))
	return f
}

func (f *fakeUpstream) snapshot() []hit {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.hits)
}

func freePort(t *testing.T) int {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

type client struct{ base, key string }

func (c client) do(t *testing.T, method, path, key, body string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, c.base+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func (c client) models(t *testing.T) []string {
	code, body := c.do(t, "GET", "/v1/models", c.key, "")
	if code != 200 {
		return nil
	}
	var out struct{ Data []struct{ ID string } }
	json.Unmarshal([]byte(body), &out)
	var ids []string
	for _, m := range out.Data {
		ids = append(ids, m.ID)
	}
	return ids
}

func (c client) waitModel(t *testing.T, id string, want bool) []string {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for {
		ids := c.models(t)
		if slices.Contains(ids, id) == want {
			return ids
		}
		if time.Now().After(deadline) {
			t.Fatalf("model %q present=%v never became true; have %v", id, want, ids)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func (c client) chat(t *testing.T, model string) (int, string) {
	return c.do(t, "POST", "/v1/chat/completions", c.key,
		fmt.Sprintf(`{"model":%q,"messages":[{"role":"user","content":"hi"}]}`, model))
}

// One service for the whole test: CLIProxyAPI keeps process-wide registries.
func TestProxyEndToEnd(t *testing.T) {
	upA, upB := newFakeUpstream(), newFakeUpstream()
	defer upA.Close()
	defer upB.Close()

	credDir := t.TempDir()
	cred := func(id, typ, key, baseURL, models string) {
		writeCred(t, credDir, id, fmt.Sprintf(`{"type":%q,"method":"api_key","api_key":%q,"base_url":%q,"models":%s}`, typ, key, baseURL, models))
	}
	// Two connections expose the same model name on different upstreams.
	cred("custom-aaaa0001", "custom", "key-A", upA.URL, `[{"name":"shared-model","alias":"shared-model","display_name":"Shared"}]`)
	cred("custom-bbbb0002", "custom", "key-B", upB.URL, `[{"name":"shared-model","alias":"shared-model","display_name":"Shared"}]`)
	// Models synced from models.dev, as packages/api writes them.
	cred("gemini-cccc0003", "gemini", "key-C", "", `[{"name":"gemini-3.5-flash","alias":"gemini-3.5-flash","display_name":"Gemini 3.5 Flash"}]`)
	cred("openai-eeee0005", "openai", "key-E", "", `[{"name":"gpt-5.5","alias":"gpt-5.5","display_name":"GPT-5.5"}]`)
	// A ChatGPT sign-in: its models come from CLIProxyAPI's catalog for the plan.
	writeCred(t, credDir, "openai-ffff0006", signIn)

	s := Settings{
		CredentialsDir: credDir,
		DataDir:        t.TempDir(),
		Host:           "127.0.0.1",
		Port:           freePort(t),
		AccessKey:      "internal-key",
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Run(ctx, s) }()
	defer func() {
		cancel()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
		}
	}()

	c := client{base: fmt.Sprintf("http://127.0.0.1:%d", s.Port), key: s.AccessKey}
	c.waitModel(t, "custom-bbbb0002/shared-model", true)
	ids := c.waitModel(t, "openai-ffff0006/gpt-6-sol", true)
	t.Logf("GET /v1/models -> %v", ids)

	t.Run("models listing carries the prefix", func(t *testing.T) {
		for _, want := range []string{"custom-aaaa0001/shared-model", "custom-bbbb0002/shared-model", "gemini-cccc0003/gemini-3.5-flash", "openai-eeee0005/gpt-5.5", "openai-ffff0006/gpt-6-sol"} {
			if !slices.Contains(ids, want) {
				t.Errorf("missing %q in %v", want, ids)
			}
		}
		// force-model-prefix is on, so bare ids are not listed.
		if slices.Contains(ids, "shared-model") || slices.Contains(ids, "gpt-5.5") {
			t.Errorf("unprefixed id listed: %v", ids)
		}
		// A key lists only its synced models, not the whole catalog.
		for _, id := range ids {
			if strings.HasPrefix(id, "openai-eeee0005/") && id != "openai-eeee0005/gpt-5.5" {
				t.Errorf("key lists %q beyond its models", id)
			}
		}
	})

	t.Run("routes to the named connection", func(t *testing.T) {
		if code, body := c.chat(t, "custom-aaaa0001/shared-model"); code != 200 {
			t.Fatalf("A: %d %s", code, body)
		}
		if code, body := c.chat(t, "custom-bbbb0002/shared-model"); code != 200 {
			t.Fatalf("B: %d %s", code, body)
		}
		a, b := upA.snapshot(), upB.snapshot()
		if len(a) != 1 || a[0].Auth != "Bearer key-A" || a[0].Path != "/chat/completions" || a[0].Model != "shared-model" {
			t.Errorf("upstream A: %+v", a)
		}
		if len(b) != 1 || b[0].Auth != "Bearer key-B" {
			t.Errorf("upstream B: %+v", b)
		}
	})

	t.Run("signing out removes the account's models", func(t *testing.T) {
		if err := os.Remove(filepath.Join(credDir, "openai-ffff0006.json")); err != nil {
			t.Fatal(err)
		}
		c.waitModel(t, "openai-ffff0006/gpt-6-sol", false)
	})

	t.Run("rejects missing or wrong key", func(t *testing.T) {
		before := len(upA.snapshot())
		for _, key := range []string{"", "wrong"} {
			code, _ := c.do(t, "POST", "/v1/chat/completions", key, `{"model":"custom-aaaa0001/shared-model","messages":[{"role":"user","content":"hi"}]}`)
			if code != 401 {
				t.Errorf("key %q: status %d", key, code)
			}
		}
		if code, _ := c.do(t, "GET", "/v1/models", "", ""); code != 401 {
			t.Errorf("models without key: %d", code)
		}
		if len(upA.snapshot()) != before {
			t.Error("unauthenticated request reached upstream")
		}
	})

	t.Run("unprefixed model does not route", func(t *testing.T) {
		code, _ := c.chat(t, "shared-model")
		if code == 200 {
			t.Error("bare model name must not reach a prefixed connection")
		}
	})

	t.Run("hot reload on add and delete", func(t *testing.T) {
		upD := newFakeUpstream()
		defer upD.Close()
		cred("custom-dddd0004", "custom", "key-D", upD.URL, `[{"name":"late","alias":"late","display_name":"Late"}]`)
		c.waitModel(t, "custom-dddd0004/late", true)
		if code, body := c.chat(t, "custom-dddd0004/late"); code != 200 {
			t.Fatalf("%d %s", code, body)
		}
		if h := upD.snapshot(); len(h) != 1 || h[0].Auth != "Bearer key-D" {
			t.Errorf("upstream D: %+v", h)
		}
		if err := os.Remove(filepath.Join(credDir, "custom-dddd0004.json")); err != nil {
			t.Fatal(err)
		}
		c.waitModel(t, "custom-dddd0004/late", false)
	})
}
