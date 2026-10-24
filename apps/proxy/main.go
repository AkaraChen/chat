// Command proxy runs CLIProxyAPI embedded, configured from the credential
// files that packages/api writes. See docs/credentials.md.
package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy"
	sdkconfig "github.com/router-for-me/CLIProxyAPI/v8/sdk/config"
)

//go:embed models.json
var modelsJSON []byte

// Settings are the process inputs, read from the environment.
type Settings struct {
	CredentialsDir string
	DataDir        string
	Host           string
	Port           int
	AccessKey      string
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func settingsFromEnv() (Settings, error) {
	// Real environment variables win over .env.
	_ = godotenv.Load()
	port, err := strconv.Atoi(envOr("PROXY_PORT", "8317"))
	if err != nil {
		return Settings{}, fmt.Errorf("PROXY_PORT: %w", err)
	}
	s := Settings{
		CredentialsDir: envOr("CREDENTIALS_DIR", "../../.data/credentials"),
		DataDir:        envOr("PROXY_DATA_DIR", ".data/proxy"),
		Host:           envOr("PROXY_HOST", "127.0.0.1"),
		Port:           port,
		AccessKey:      os.Getenv("PROXY_API_KEY"),
	}
	if s.AccessKey == "" {
		return s, errors.New("PROXY_API_KEY is required")
	}
	return s, nil
}

// Run keeps <DataDir>/config.yaml in sync with the credentials directory and
// serves CLIProxyAPI until ctx is cancelled.
func Run(ctx context.Context, s Settings) error {
	if s.AccessKey == "" {
		return errors.New("access key is required")
	}
	dataDir, err := filepath.Abs(s.DataDir)
	if err != nil {
		return err
	}
	credDir, err := filepath.Abs(s.CredentialsDir)
	if err != nil {
		return err
	}
	authDir := filepath.Join(dataDir, "auths")
	if err := os.MkdirAll(authDir, 0o700); err != nil {
		return err
	}
	// The catalog must be an absolute file path. Writing the embedded copy
	// keeps the binary self-contained (the Docker image has no source tree).
	catalogPath := filepath.Join(dataDir, "models.json")
	if err := os.WriteFile(catalogPath, modelsJSON, 0o600); err != nil {
		return err
	}
	catalogModels, err := parseCatalogModels(modelsJSON)
	if err != nil {
		return err
	}
	configPath := filepath.Join(dataDir, "config.yaml")
	syncer := &Syncer{
		CredentialsDir: credDir,
		ConfigPath:     configPath,
		Options: Options{
			Host: s.Host, Port: s.Port, AccessKey: s.AccessKey,
			AuthDir: authDir, Catalog: catalogPath, CatalogModels: catalogModels,
		},
	}
	if _, err := syncer.Sync(); err != nil {
		return err
	}
	cfg, err := sdkconfig.LoadConfig(configPath)
	if err != nil {
		return err
	}
	svc, err := cliproxy.NewBuilder().WithConfig(cfg).WithConfigPath(configPath).Build()
	if err != nil {
		return err
	}
	go func() {
		if err := syncer.Watch(ctx); err != nil && ctx.Err() == nil {
			log.Printf("credentials watcher stopped: %v", err)
		}
	}()
	return svc.Run(ctx)
}

func main() {
	s, err := settingsFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := Run(ctx, s); err != nil && !errors.Is(err, context.Canceled) {
		log.Fatal(err)
	}
}
