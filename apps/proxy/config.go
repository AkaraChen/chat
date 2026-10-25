package main

import (
	"cmp"

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
}

// The types below mirror only the v8 config fields we emit. There is no
// model catalog: API-key groups list their models (synced from models.dev by
// packages/api), and a ChatGPT sign-in gets CLIProxyAPI's built-in catalog
// for its plan.
type configFile struct {
	Version int     `yaml:"config-version"`
	Server  server  `yaml:"server"`
	Access  access  `yaml:"access"`
	OAuth   oauth   `yaml:"oauth"`
	Routing routing `yaml:"routing"`
	APIKeys apiKeys `yaml:"api-keys"`
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
// Every API-key credential becomes its own group with prefix == connectionId
// and force-model-prefix on, so a request can only reach the connection it
// names. A ChatGPT sign-in is not a group; it is an auth file (see auths.go).
func GenerateConfig(creds []Credential, opt Options) ([]byte, error) {
	cfg := configFile{
		Version: 8,
		Server:  server{Host: opt.Host, Port: opt.Port},
		Access:  access{APIKeys: []string{opt.AccessKey}},
		OAuth:   oauth{AuthDir: opt.AuthDir},
		Routing: routing{ForceModelPrefix: true},
	}
	for _, c := range creds {
		if !c.isAPIKey() {
			continue
		}
		g := group{Name: c.ID, Prefix: c.ID, Keys: []key{{APIKey: c.APIKey}}, Models: refs(c.Models)}
		switch c.Type {
		case "openai":
			g.BaseURL = cmp.Or(c.BaseURL, openAIBaseURL)
			cfg.APIKeys.Codex = append(cfg.APIKeys.Codex, g)
		case "gemini":
			g.BaseURL = c.BaseURL
			cfg.APIKeys.Gemini = append(cfg.APIKeys.Gemini, g)
		case "openrouter":
			g.BaseURL = openRouterBaseURL
			cfg.APIKeys.Compat = append(cfg.APIKeys.Compat, g)
		case "custom":
			if c.BaseURL == "" {
				continue
			}
			g.BaseURL = c.BaseURL
			cfg.APIKeys.Compat = append(cfg.APIKeys.Compat, g)
		}
	}
	return yaml.Marshal(cfg)
}
