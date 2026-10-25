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
  credentials/      credentials, mode 0700
    gemini-<identity>.json
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

One shape for every provider. `type` is the provider slug (`openai`,
`gemini`, `openrouter`, `custom`). `method` is `api_key` or `oauth`. Every
provider takes an API key; only `openai` also signs in (a ChatGPT account,
through Codex), and a file with `oauth` for any other type is ignored.
Anything the client renders (provider name, method, account label, connected
or not) is derived from these files. No second copy in SQLite.

An API-key connection fills `api_key` and `models`, and leaves the token
fields empty. `custom` also has `base_url` and `provider`, the
[models.dev](https://models.dev) provider id.

Each entry in `models` has `name`, the model id sent upstream; `alias`, the
name callers use (it defaults to `name`); `display_name`, what the picker
shows; and `manual: true` on a model added by hand. The rest come from
models.dev: each connection gets every model its provider lists there that
calls tools and writes text (models.dev's `openai`, `google` and `openrouter`
entries, or the `custom` connection's `provider`). A sync replaces those and
keeps the manual ones. It runs when a key is saved, from the settings' refresh
button, and every 12 hours in the worker (`packages/api/src/jobs/models-sync.ts`).

A ChatGPT sign-in fills the token fields, `id_token` and `plan_type`, and has
no `models`: the proxy serves what CLIProxyAPI's catalog has for the plan.

```json
{
  "type": "openai",
  "method": "oauth",
  "email": "user@example.com",
  "account_id": "<chatgpt account id>",
  "api_key": "",
  "access_token": "...",
  "refresh_token": "...",
  "id_token": "...",
  "plan_type": "plus",
  "expires_at": "2026-10-23T00:00:00Z"
}
```

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

A `custom` file's `<identity>` is derived from `base_url` as well as the key,
so the same key against two endpoints is two files.

## Access

One module owns the directory and exposes `list`, `save`, `delete`, `get` and
`setModels`. Callers never read or write the files themselves. `list` returns
summaries with no secrets. `get` returns the whole file and is for server code
only; `setModels` rewrites the same file with a new `models` list. `save` creates the
directory at mode `0700`, writes the file, and replaces the whole file on
update, including after a token refresh.

The web server writes the directory, and the worker rewrites `models` in the
twice-daily sync, through the same module. The phone app
sends a credential once, over the oRPC API, and keeps nothing. When the
server calls a model it reads the file, decrypts nothing, and attaches the
credential itself. The client only ever learns that a provider is connected.

## The proxy

The Go proxy (`apps/proxy`) only reads this directory. It never writes a
credential. At start, and whenever the directory changes, it renders its own
configuration from these files into `.data/proxy/config.yaml` and reloads. That
file is generated output; edit the credential files, not the config. The
connection id (the file name without `.json`) is the prefix the proxy gives
each connection's models, so a model is addressed as `<connectionId>/<model>`.

A ChatGPT sign-in is not part of that config. The proxy writes it once as a
Codex auth file, `.data/proxy/auths/chat-<connectionId>.json`, with the
connection id as its `prefix`. From then on CLIProxyAPI refreshes the tokens
and rewrites that file itself, so the credential's tokens are only the seed
and go stale; the auth file holds the live ones. A new sign-in (another
refresh token) replaces the file, and removing the connection removes it.

## Explicitly not doing

- No encryption. The threat model is the same as CLIProxyAPI: whoever has the
  server has the credentials. Encryption only starts to matter if backups of
  this directory leave the machine.
- No `Provider` table. A second record of the same fact will drift from the
  files.
- No per-user namespacing. There is one user.
