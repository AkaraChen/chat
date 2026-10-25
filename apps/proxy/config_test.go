package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sdkconfig "github.com/router-for-me/CLIProxyAPI/v8/sdk/config"
)

func testOptions(t *testing.T) Options {
	t.Helper()
	return Options{Host: "127.0.0.1", Port: 8317, AccessKey: "internal", AuthDir: t.TempDir()}
}

const signIn = `{"type":"openai","method":"oauth","email":"me@example.com","account_id":"acct-9",
	"access_token":"at","refresh_token":"rt-1","id_token":"it","expires_at":"2026-10-26T00:00:00Z","plan_type":"plus"}`

func writeCred(t *testing.T, dir, id, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, id+".json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func fixtureDir(t *testing.T) string {
	dir := t.TempDir()
	writeCred(t, dir, "openai-bbbb2222", `{"type":"openai","method":"api_key","api_key":"sk-oa",
		"models":[{"name":"gpt-5.5","alias":"gpt-5.5","display_name":"GPT-5.5"}]}`)
	writeCred(t, dir, "gemini-cccc3333", `{"type":"gemini","method":"api_key","api_key":"g-key",
		"models":[{"name":"gemini-3.5-flash","alias":"gemini-3.5-flash","display_name":"Gemini 3.5 Flash"},
		{"name":"gemini-3.5-pro","alias":"gemini-3.5-pro","display_name":"Gemini 3.5 Pro"}]}`)
	writeCred(t, dir, "openai-ffff0006", signIn)
	writeCred(t, dir, "openrouter-dddd4444", `{"type":"openrouter","method":"api_key","api_key":"sk-or","base_url":"https://ignored.example",
		"models":[{"name":"moonshotai/kimi-k2","alias":"kimi","display_name":"Kimi K2"}]}`)
	writeCred(t, dir, "custom-eeee5555", `{"type":"custom","method":"api_key","provider":"deepseek","api_key":"sk-ds","base_url":"https://api.deepseek.com",
		"models":[{"name":"deepseek-chat","alias":"deepseek-chat","display_name":"DeepSeek Chat"}]}`)
	// Skipped: a sign-in that is not OpenAI, one with no refresh token, an
	// empty key, not json, bad json.
	writeCred(t, dir, "gemini-oauth", `{"type":"gemini","method":"oauth","refresh_token":"r"}`)
	writeCred(t, dir, "openai-notoken", `{"type":"openai","method":"oauth","refresh_token":""}`)
	writeCred(t, dir, "gemini-empty", `{"type":"gemini","method":"api_key","api_key":" "}`)
	writeCred(t, dir, "broken", `{`)
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestGenerateConfigAllTypes(t *testing.T) {
	creds, err := LoadCredentials(fixtureDir(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(creds) != 5 {
		t.Fatalf("want 5 usable credentials (4 keys, 1 sign-in), got %d", len(creds))
	}
	data, err := GenerateConfig(creds, testOptions(t))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := sdkconfig.ParseConfigBytes(data)
	if err != nil {
		t.Fatalf("CLIProxyAPI rejected the config: %v\n%s", err, data)
	}

	if len(cfg.ClaudeKey) != 0 {
		t.Errorf("claude: %+v", cfg.ClaudeKey)
	}
	// The sign-in is an auth file, not a group: only the key is here.
	if len(cfg.CodexKey) != 1 || cfg.CodexKey[0].Prefix != "openai-bbbb2222" || cfg.CodexKey[0].APIKey != "sk-oa" || cfg.CodexKey[0].BaseURL != "https://api.openai.com/v1" ||
		len(cfg.CodexKey[0].Models) != 1 || cfg.CodexKey[0].Models[0].Name != "gpt-5.5" {
		t.Errorf("codex: %+v", cfg.CodexKey)
	}
	if len(cfg.GeminiKey) != 1 || cfg.GeminiKey[0].Prefix != "gemini-cccc3333" || len(cfg.GeminiKey[0].Models) != 2 ||
		cfg.GeminiKey[0].Models[1].Name != "gemini-3.5-pro" {
		t.Errorf("gemini models come from the credential: %+v", cfg.GeminiKey)
	}
	if bytes.Contains(data, []byte("rt-1")) {
		t.Error("a sign-in's tokens must not be in the config")
	}
	if len(cfg.OpenAICompatibility) != 2 {
		t.Fatalf("compat: %+v", cfg.OpenAICompatibility)
	}
	byPrefix := map[string]sdkconfig.OpenAICompatibility{}
	for _, c := range cfg.OpenAICompatibility {
		byPrefix[c.Prefix] = c
	}
	or, custom := byPrefix["openrouter-dddd4444"], byPrefix["custom-eeee5555"]
	if or.Prefix != "openrouter-dddd4444" || or.BaseURL != "https://openrouter.ai/api/v1" ||
		len(or.Models) != 1 || or.Models[0].Name != "moonshotai/kimi-k2" || or.Models[0].Alias != "kimi" || or.Models[0].DisplayName != "Kimi K2" {
		t.Errorf("openrouter: %+v", or)
	}
	if custom.Prefix != "custom-eeee5555" || custom.BaseURL != "https://api.deepseek.com" ||
		len(custom.Models) != 1 || custom.Models[0].Name != "deepseek-chat" || custom.Models[0].DisplayName != "DeepSeek Chat" {
		t.Errorf("custom: %+v", custom)
	}
	if len(cfg.APIKeys) != 1 || cfg.APIKeys[0] != "internal" {
		t.Errorf("access keys: %v", cfg.APIKeys)
	}
	if cfg.Port != 8317 || cfg.Host != "127.0.0.1" || !cfg.ForceModelPrefix {
		t.Errorf("server: host=%q port=%d force=%v", cfg.Host, cfg.Port, cfg.ForceModelPrefix)
	}
}

func TestSyncRegeneratesOnChange(t *testing.T) {
	dir := fixtureDir(t)
	s := &Syncer{CredentialsDir: dir, ConfigPath: filepath.Join(t.TempDir(), "proxy", "config.yaml"), Options: testOptions(t)}

	if changed, err := s.Sync(); err != nil || !changed {
		t.Fatalf("first sync: changed=%v err=%v", changed, err)
	}
	if changed, _ := s.Sync(); changed {
		t.Error("unchanged credentials must not rewrite the config")
	}
	info, err := os.Stat(s.ConfigPath)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Errorf("config mode: %v %v", info, err)
	}

	count := func() int {
		data, _ := os.ReadFile(s.ConfigPath)
		cfg, err := sdkconfig.ParseConfigBytes(data)
		if err != nil {
			t.Fatal(err)
		}
		return len(cfg.CodexKey) + len(cfg.GeminiKey) + len(cfg.OpenAICompatibility)
	}
	if count() != 4 {
		t.Fatalf("want 4 groups, got %d", count())
	}
	writeCred(t, dir, "gemini-ffff6666", `{"type":"gemini","method":"api_key","api_key":"sk-new"}`)
	s.Sync()
	if count() != 5 {
		t.Errorf("after add: %d", count())
	}
	os.Remove(filepath.Join(dir, "openai-bbbb2222.json"))
	os.Remove(filepath.Join(dir, "custom-eeee5555.json"))
	s.Sync()
	if count() != 3 {
		t.Errorf("after delete: %d", count())
	}
	writeCred(t, dir, "gemini-ffff6666", `{"type":"gemini","method":"api_key","api_key":"sk-rotated"}`)
	s.Sync()
	data, _ := os.ReadFile(s.ConfigPath)
	if !bytes.Contains(data, []byte("sk-rotated")) || bytes.Contains(data, []byte("sk-new")) {
		t.Error("changed key not reflected")
	}
}

func readAuth(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestSignInBecomesCodexAuthFile(t *testing.T) {
	dir, authDir := t.TempDir(), t.TempDir()
	writeCred(t, dir, "openai-ffff0006", signIn)
	// A file CLIProxyAPI or someone else put there is never touched.
	if err := os.WriteFile(filepath.Join(authDir, "codex-other.json"), []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	creds, _ := LoadCredentials(dir)
	now := time.Date(2026, 10, 25, 0, 0, 0, 0, time.UTC)
	if changed, err := SyncAuths(authDir, creds, now); err != nil || !changed {
		t.Fatalf("first: changed=%v err=%v", changed, err)
	}
	path := filepath.Join(authDir, "chat-openai-ffff0006.json")
	got := readAuth(t, path)
	for k, want := range map[string]string{
		"type": "codex", "prefix": "openai-ffff0006", "email": "me@example.com", "account_id": "acct-9",
		"refresh_token": "rt-1", "id_token": "it", "expired": "2026-10-26T00:00:00Z", "plan_type": "plus",
	} {
		if got[k] != want {
			t.Errorf("%s = %v, want %q", k, got[k], want)
		}
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Errorf("mode %v", info.Mode())
	}

	// CLIProxyAPI refreshes the tokens in place; the next sync leaves them.
	got["refresh_token"], got["access_token"] = "rt-rotated", "at-2"
	if err := writeAtomic(path, got); err != nil {
		t.Fatal(err)
	}
	if changed, _ := SyncAuths(authDir, creds, now); changed {
		t.Error("a refreshed file must not be overwritten by the old seed")
	}
	if readAuth(t, path)["refresh_token"] != "rt-rotated" {
		t.Error("refreshed token lost")
	}

	// Signing in again replaces it.
	writeCred(t, dir, "openai-ffff0006", strings.Replace(signIn, `"rt-1"`, `"rt-2"`, 1))
	creds, _ = LoadCredentials(dir)
	if changed, _ := SyncAuths(authDir, creds, now); !changed || readAuth(t, path)["refresh_token"] != "rt-2" {
		t.Error("a new sign-in must replace the file")
	}

	// Signing out removes it, and only it.
	os.Remove(filepath.Join(dir, "openai-ffff0006.json"))
	creds, _ = LoadCredentials(dir)
	if changed, _ := SyncAuths(authDir, creds, now); !changed {
		t.Error("removal not reported")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("auth file not removed")
	}
	if _, err := os.Stat(filepath.Join(authDir, "codex-other.json")); err != nil {
		t.Error("someone else's auth file was removed")
	}
}
