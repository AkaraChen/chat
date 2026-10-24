package main

import (
	"cmp"
	"encoding/json"
	"fmt"

	"gopkg.in/yaml.v3"
)

const (
	openRouterBaseURL = "https://openrouter.ai/api/v1"
	// CLIProxyAPI drops codex groups that have no base-url.
	openAIBaseURL = "https://api.openai.com/v1"
)

// Options are the process-level inputs to the generated config.
type Options struct {
	Host      string
	Port      int
	AccessKey string
	AuthDir   string
	// Catalog is the absolute path of the models.json CLIProxyAPI loads.
	Catalog string
	// CatalogModels lists the models to expose per claude/gemini group,
	// because CLIProxyAPI does not enumerate a catalog for API-key groups.
	CatalogModels map[string][]Model
}

// The types below mirror only the v8 config fields we emit.
type configFile struct {
	Version int     `yaml:"config-version"`
	Models  catalog `yaml:"models"`
	Server  server  `yaml:"server"`
	Access  access  `yaml:"access"`
	OAuth   oauth   `yaml:"oauth"`
	Routing routing `yaml:"routing"`
	APIKeys apiKeys `yaml:"api-keys"`
}

type catalog struct {
	Catalog string `yaml:"catalog"`
}
type server struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}
type access struct {
	APIKeys []string `yaml:"api-keys"`
}
type oauth struct {
	AuthDir string `yaml:"auth-dir"`
}
type routing struct {
	ForceModelPrefix bool `yaml:"force-model-prefix"`
}

type apiKeys struct {
	Claude []group `yaml:"claude,omitempty"`
	Codex  []group `yaml:"codex,omitempty"`
	Gemini []group `yaml:"gemini,omitempty"`
	Compat []group `yaml:"openai-compatibility,omitempty"`
}

type group struct {
	Name    string     `yaml:"name"`
	Prefix  string     `yaml:"prefix"`
	BaseURL string     `yaml:"base-url,omitempty"`
	Models  []modelRef `yaml:"models,omitempty"`
	Keys    []key      `yaml:"keys"`
}

type key struct {
	APIKey string `yaml:"api-key"`
}

type modelRef struct {
	Name        string `yaml:"name"`
	Alias       string `yaml:"alias"`
	DisplayName string `yaml:"display-name,omitempty"`
}

func refs(models []Model) []modelRef {
	out := make([]modelRef, 0, len(models))
	for _, m := range models {
		if m.Name == "" {
			continue
		}
		alias := m.Alias
		if alias == "" {
			alias = m.Name
		}
		out = append(out, modelRef{Name: m.Name, Alias: alias, DisplayName: m.DisplayName})
	}
	return out
}

// GenerateConfig turns credentials into CLIProxyAPI config YAML. It is pure:
// the same input always yields the same bytes, so callers can skip rewrites.
//
// Every credential becomes its own group with prefix == connectionId and
// force-model-prefix on, so a request can only reach the connection it names.
func GenerateConfig(creds []Credential, opt Options) ([]byte, error) {
	cfg := configFile{
		Version: 8,
		Models:  catalog{Catalog: opt.Catalog},
		Server:  server{Host: opt.Host, Port: opt.Port},
		Access:  access{APIKeys: []string{opt.AccessKey}},
		OAuth:   oauth{AuthDir: opt.AuthDir},
		Routing: routing{ForceModelPrefix: true},
	}
	for _, c := range creds {
		if !c.usable() {
			continue
		}
		g := group{Name: c.ID, Prefix: c.ID, Keys: []key{{APIKey: c.APIKey}}}
		switch c.Type {
		case "claude":
			g.BaseURL = c.BaseURL
			g.Models = refs(opt.CatalogModels["claude"])
			cfg.APIKeys.Claude = append(cfg.APIKeys.Claude, g)
		case "openai":
			// No models: CLIProxyAPI then serves the catalog's codex-pro list.
			g.BaseURL = cmp.Or(c.BaseURL, openAIBaseURL)
			cfg.APIKeys.Codex = append(cfg.APIKeys.Codex, g)
		case "gemini":
			g.BaseURL = c.BaseURL
			g.Models = refs(opt.CatalogModels["gemini"])
			cfg.APIKeys.Gemini = append(cfg.APIKeys.Gemini, g)
		case "openrouter":
			g.BaseURL = openRouterBaseURL
			g.Models = refs(c.Models)
			cfg.APIKeys.Compat = append(cfg.APIKeys.Compat, g)
		case "custom":
			if c.BaseURL == "" {
				continue
			}
			g.BaseURL = c.BaseURL
			g.Models = refs(c.Models)
			cfg.APIKeys.Compat = append(cfg.APIKeys.Compat, g)
		}
	}
	return yaml.Marshal(cfg)
}

// parseCatalogModels extracts the claude and gemini model ids from models.json.
func parseCatalogModels(data []byte) (map[string][]Model, error) {
	var raw map[string][]struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("models.json: %w", err)
	}
	out := map[string][]Model{}
	for _, section := range []string{"claude", "gemini"} {
		for _, m := range raw[section] {
			out[section] = append(out[section], Model{Name: m.ID, Alias: m.ID, DisplayName: m.DisplayName})
		}
	}
	return out, nil
}
