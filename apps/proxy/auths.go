package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// A ChatGPT sign-in reaches CLIProxyAPI as a Codex auth file in its auth
// directory, not as a config group. CLIProxyAPI refreshes the tokens and
// rewrites that file itself, keeping fields it does not know, so the file is
// written once from the credential and then left to it. The credential's
// tokens are only the seed: `chat_seed` records which sign-in a file came
// from, and a new sign-in (another refresh token) replaces the file.
const (
	authFilePrefix = "chat-"
	seedKey        = "chat_seed"
)

func authFileName(connectionID string) string {
	return authFilePrefix + connectionID + ".json"
}

func seedOf(c Credential) string {
	sum := sha256.Sum256([]byte(c.RefreshToken))
	return hex.EncodeToString(sum[:8])
}

// codexAuth is the file CLIProxyAPI reads for a Codex OAuth account
// (internal/auth/codex/token.go), plus `prefix`, which it reads from any
// auth file, so the account's models are addressed `<connectionId>/<model>`.
func codexAuth(c Credential, now time.Time) map[string]any {
	plan := c.PlanType
	if plan == "" {
		plan = "free"
	}
	return map[string]any{
		"type":          "codex",
		"email":         c.Email,
		"account_id":    c.AccountID,
		"access_token":  c.AccessToken,
		"refresh_token": c.RefreshToken,
		"id_token":      c.IDToken,
		"expired":       c.ExpiresAt,
		"last_refresh":  now.UTC().Format(time.RFC3339),
		"plan_type":     plan,
		"prefix":        c.ID,
		seedKey:         seedOf(c),
	}
}

// SyncAuths writes an auth file for each sign-in that has none, or whose file
// came from an earlier sign-in, and removes the files of sign-ins that are
// gone. It reports whether it changed anything. Files it did not write (no
// `chat-` prefix) are never touched.
func SyncAuths(authDir string, creds []Credential, now time.Time) (bool, error) {
	if err := os.MkdirAll(authDir, 0o700); err != nil {
		return false, err
	}
	changed := false
	want := map[string]bool{}
	for _, c := range creds {
		if !c.isSignIn() {
			continue
		}
		name := authFileName(c.ID)
		want[name] = true
		path := filepath.Join(authDir, name)
		if existing, err := os.ReadFile(path); err == nil {
			var disk map[string]any
			if json.Unmarshal(existing, &disk) == nil && disk[seedKey] == seedOf(c) {
				continue
			}
		}
		if err := writeAtomic(path, codexAuth(c, now)); err != nil {
			return changed, fmt.Errorf("auth file %s: %w", name, err)
		}
		changed = true
	}
	entries, err := os.ReadDir(authDir)
	if err != nil {
		return changed, err
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, authFilePrefix) || filepath.Ext(name) != ".json" || want[name] {
			continue
		}
		if err := os.Remove(filepath.Join(authDir, name)); err != nil && !os.IsNotExist(err) {
			return changed, err
		}
		changed = true
	}
	return changed, nil
}

// writeAtomic writes through a temp file and a rename, as CLIProxyAPI does
// for these files, so its watcher never reads half a file.
func writeAtomic(path string, data map[string]any) error {
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp.*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
