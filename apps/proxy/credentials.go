package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Model is one entry of a credential's "models" list. Name is what the
// upstream expects; Alias is what clients call it (defaults to Name).
type Model struct {
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	DisplayName string `json:"display_name"`
}

// Credential is the subset of a file under CREDENTIALS_DIR that the proxy
// needs. The file shape is owned by packages/api; see docs/credentials.md.
type Credential struct {
	// ID is the connectionId: the file name without ".json".
	ID      string  `json:"-"`
	Type    string  `json:"type"`
	Method  string  `json:"method"`
	APIKey  string  `json:"api_key"`
	BaseURL string  `json:"base_url"`
	Models  []Model `json:"models"`
}

// usable reports whether the proxy can route to this credential. OAuth
// files are not handled here; the web app does not use them for the proxy.
func (c Credential) usable() bool {
	return c.Method == "api_key" && strings.TrimSpace(c.APIKey) != ""
}

// LoadCredentials reads every *.json file in dir. Unreadable or invalid
// files are logged and skipped so one bad file never takes the proxy down.
func LoadCredentials(dir string) ([]Credential, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []Credential
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || filepath.Ext(name) != ".json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			log.Printf("credentials: skip %s: %v", name, err)
			continue
		}
		var c Credential
		if err := json.Unmarshal(raw, &c); err != nil {
			log.Printf("credentials: skip %s: %v", name, err)
			continue
		}
		c.ID = strings.TrimSuffix(name, ".json")
		if c.usable() {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}
