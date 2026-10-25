package main

import (
	"bytes"
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Syncer regenerates the CLIProxyAPI config from the credentials directory.
type Syncer struct {
	CredentialsDir string
	ConfigPath     string
	Options        Options
}

// Sync writes the config and the sign-in auth files if they changed, and
// reports whether anything did. Skipping identical writes avoids pointless
// hot reloads.
func (s *Syncer) Sync() (bool, error) {
	creds, err := LoadCredentials(s.CredentialsDir)
	if err != nil {
		return false, err
	}
	authsChanged, err := SyncAuths(s.Options.AuthDir, creds, time.Now())
	if err != nil {
		return false, err
	}
	data, err := GenerateConfig(creds, s.Options)
	if err != nil {
		return false, err
	}
	if old, err := os.ReadFile(s.ConfigPath); err == nil && bytes.Equal(old, data) {
		return authsChanged, nil
	}
	if err := os.MkdirAll(filepath.Dir(s.ConfigPath), 0o700); err != nil {
		return false, err
	}
	// Write in place, not via rename: CLIProxyAPI watches the config file's
	// inode, so replacing it would silently end hot reload. Its watcher
	// debounces and ignores the momentarily empty file.
	if err := os.WriteFile(s.ConfigPath, data, 0o600); err != nil {
		return false, err
	}
	log.Printf("config: wrote %d connection(s)", len(creds))
	return true, nil
}

// Watch re-syncs whenever the credentials directory changes, until ctx ends.
// Events are debounced because writers truncate then write.
func (s *Syncer) Watch(ctx context.Context) error {
	if err := os.MkdirAll(s.CredentialsDir, 0o700); err != nil {
		return err
	}
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer w.Close()
	if err := w.Add(s.CredentialsDir); err != nil {
		return err
	}
	timer := time.NewTimer(time.Hour)
	timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-w.Events:
			timer.Reset(200 * time.Millisecond)
		case err := <-w.Errors:
			log.Printf("credentials watcher: %v", err)
		case <-timer.C:
			if _, err := s.Sync(); err != nil {
				log.Printf("config sync: %v", err)
			}
		}
	}
}
