# Credentials

How provider credentials are stored. Single tenant, one deployment, one user.
Decided 2026-10-23.

## Decision

Store credentials as one plaintext JSON file per connection in a directory on
the server. Do not put them in the database. Do not encrypt them.

This follows [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
(`internal/auth/claude/token.go`, `sdk/cliproxy/auth/store.go`). That project
is a self-hosted, single-tenant proxy and treats the machine as the trust
boundary: credentials sit in an `auths/` directory as JSON, directory mode
`0700`, with no encryption. Postgres and S3 are alternative backends behind
the same interface, and they store the same JSON unchanged. Token refresh
overwrites the file in place.

The earlier idea of encrypting secrets under a master key, and of keeping a
`Provider` table in SQLite, was dropped. Both add machinery this deployment
does not need. The file is the only source of truth.

## Layout

```
.data/
  local.db          SQLite, for app data
  auths/            credentials, mode 0700
    claude-<identity>.json
    openai-<identity>.json
```

`.data/` is already gitignored (`.data/.gitignore` ignores everything except
itself) and already mounted into the container at `/data` by
`docker-compose.yml`. `auths/` needs no new ignore rule. It must not be baked
into the image.

`<identity>` distinguishes two connections to the same provider. Prefer a
short hash of the account id (CLIProxyAPI uses the first 8 hex chars of the
SHA-256 of the organization or account UUID) and fall back to the account
email. The provider name is always part of the filename so a directory
listing tells you what is connected without opening files.

## File contents

One shape for every provider. API-key connections fill `api_key` and leave
the token fields empty. Browser sign-in fills the token fields and leaves
`api_key` empty.

```json
{
  "type": "claude",
  "method": "oauth",
  "email": "user@example.com",
  "account_id": "...",
  "api_key": "",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2026-10-23T00:00:00Z"
}
```

`type` is the provider slug (`claude`, `openai`, `gemini`, `openrouter`,
`custom`). `method` is `oauth` or `api_key`. Anything the client renders
(provider name, method, account label, connected or not) is derived from
these files. No second copy in SQLite.

Two types carry extra fields.

- `openrouter` adds `models`.
- `custom` adds `models`, `base_url` and `provider`, the
  [models.dev](https://models.dev) provider id.

Each entry in `models` has three fields: `name` is the model id sent upstream,
`alias` is the name callers use (it defaults to `name`), and `display_name` is
what the picker shows.

```json
{
  "type": "custom",
  "method": "api_key",
  "provider": "deepseek",
  "email": "",
  "account_id": "",
  "api_key": "sk-...",
  "base_url": "https://api.deepseek.com",
  "models": [
    { "name": "deepseek-flash", "alias": "deepseek-flash", "display_name": "DeepSeek Flash" }
  ],
  "access_token": "",
  "refresh_token": "",
  "expires_at": ""
}
```

`claude`, `openai` and `gemini` files have the base fields only. A `custom`
file's `<identity>` is derived from `base_url` as well as the key, so the same
key against two endpoints is two files.

## Access

One module owns the directory and exposes `list`, `save`, `delete`, `get` and
`setModels`. Callers never read or write the files themselves. `list` returns
summaries with no secrets. `get` returns the whole file and is for server code
only; `setModels` rewrites the same file with a new `models` list. `save` creates the
directory at mode `0700`, writes the file, and replaces the whole file on
update, including after a token refresh.

The web server is the only process that writes the directory. The phone app
sends a credential once, over the oRPC API, and keeps nothing. When the
server calls a model it reads the file, decrypts nothing, and attaches the
credential itself. The client only ever learns that a provider is connected.

## The proxy

The Go proxy (`apps/proxy`) only reads this directory. It never writes a
credential. At start, and whenever `auths/` changes, it renders its own
configuration from these files into `.data/proxy/config.yaml` and reloads. That
file is generated output; edit the credential files, not the config. The
connection id (the file name without `.json`) is the prefix the proxy gives
each connection's models, so a model is addressed as `<connectionId>/<model>`.

## Explicitly not doing

- No encryption. The threat model is the same as CLIProxyAPI: whoever has the
  server has the credentials. Encryption only starts to matter if backups of
  this directory leave the machine.
- No `Provider` table. A second record of the same fact will drift from the
  files.
- No per-user namespacing. There is one user.
