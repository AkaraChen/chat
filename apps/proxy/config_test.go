package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	sdkconfig "github.com/router-for-me/CLIProxyAPI/v8/sdk/config"
)

func testOptions(t *testing.T) Options {
	t.Helper()
	cm, err := parseCatalogModels(modelsJSON)
	if err != nil {
		t.Fatal(err)
	}
	return Options{Host: "127.0.0.1", Port: 8317, AccessKey: "internal", AuthDir: "/tmp/auths", Catalog: "/tmp/models.json", CatalogModels: cm}
}

func writeCred(t *testing.T, dir, id, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, id+".json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func fixtureDir(t *testing.T) string {
	dir := t.TempDir()
	writeCred(t, dir, "claude-aaaa1111", `{"type":"claude","method":"api_key","api_key":"sk-ant"}`)
	writeCred(t, dir, "openai-bbbb2222", `{"type":"openai","method":"api_key","api_key":"sk-oa"}`)
	writeCred(t, dir, "gemini-cccc3333", `{"type":"gemini","method":"api_key","api_key":"g-key"}`)
	writeCred(t, dir, "openrouter-dddd4444", `{"type":"openrouter","method":"api_key","api_key":"sk-or","base_url":"https://ignored.example",
		"models":[{"name":"moonshotai/kimi-k2","alias":"kimi","display_name":"Kimi K2"}]}`)
	writeCred(t, dir, "custom-eeee5555", `{"type":"custom","method":"api_key","provider":"deepseek","api_key":"sk-ds","base_url":"https://api.deepseek.com",
		"models":[{"name":"deepseek-chat","alias":"deepseek-chat","display_name":"DeepSeek Chat"}]}`)
	// Skipped: oauth, empty key, not json, bad json.
	writeCred(t, dir, "claude-oauth", `{"type":"claude","method":"oauth","api_key":"","access_token":"t"}`)
	writeCred(t, dir, "claude-empty", `{"type":"claude","method":"api_key","api_key":" "}`)
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
		t.Fatalf("want 5 usable credentials, got %d", len(creds))
	}
	data, err := GenerateConfig(creds, testOptions(t))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := sdkconfig.ParseConfigBytes(data)
	if err != nil {
		t.Fatalf("CLIProxyAPI rejected the config: %v\n%s", err, data)
	}

	if len(cfg.ClaudeKey) != 1 || cfg.ClaudeKey[0].Prefix != "claude-aaaa1111" || cfg.ClaudeKey[0].APIKey != "sk-ant" {
		t.Errorf("claude: %+v", cfg.ClaudeKey)
	}
	if len(cfg.ClaudeKey[0].Models) != 10 {
		t.Errorf("claude models come from models.json, got %d", len(cfg.ClaudeKey[0].Models))
	}
	if len(cfg.CodexKey) != 1 || cfg.CodexKey[0].Prefix != "openai-bbbb2222" || cfg.CodexKey[0].APIKey != "sk-oa" || cfg.CodexKey[0].BaseURL != "https://api.openai.com/v1" {
		t.Errorf("codex: %+v", cfg.CodexKey)
	}
	if len(cfg.GeminiKey) != 1 || cfg.GeminiKey[0].Prefix != "gemini-cccc3333" || len(cfg.GeminiKey[0].Models) != 11 {
		t.Errorf("gemini: %+v", cfg.GeminiKey)
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
		return len(cfg.ClaudeKey) + len(cfg.CodexKey) + len(cfg.GeminiKey) + len(cfg.OpenAICompatibility)
	}
	if count() != 5 {
		t.Fatalf("want 5 groups, got %d", count())
	}
	writeCred(t, dir, "claude-ffff6666", `{"type":"claude","method":"api_key","api_key":"sk-new"}`)
	s.Sync()
	if count() != 6 {
		t.Errorf("after add: %d", count())
	}
	os.Remove(filepath.Join(dir, "openai-bbbb2222.json"))
	os.Remove(filepath.Join(dir, "custom-eeee5555.json"))
	s.Sync()
	if count() != 4 {
		t.Errorf("after delete: %d", count())
	}
	writeCred(t, dir, "claude-ffff6666", `{"type":"claude","method":"api_key","api_key":"sk-rotated"}`)
	s.Sync()
	data, _ := os.ReadFile(s.ConfigPath)
	if !bytes.Contains(data, []byte("sk-rotated")) || bytes.Contains(data, []byte("sk-new")) {
		t.Error("changed key not reflected")
	}
}
