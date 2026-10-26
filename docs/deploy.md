# Deploy

Kamal puts the whole app on any Linux server you can reach over SSH. Config is
`config/deploy.yml`.

## What runs

- `chat-web`: one container from the root `Dockerfile`. `deploy/start.sh`
  runs the web server, the model proxy (CLIProxyAPI through cpajs) (on 127.0.0.1 inside the container)
  and the thread-title worker. It brings the SQLite schema up to date first.
- `chat-redis`: Redis for the title queue, as a Kamal accessory.
- kamal-proxy in front, on ports 80 and 443.

Everything the app keeps sits in `/var/lib/chat` on the server: `local.db`,
`credentials/`, `github.json`, `proxy/`. Back up that directory.

## Before the first deploy

On your machine: Docker, and Kamal (`gem install kamal`, or
`alias kamal='docker run -it --rm -v "$PWD:/workdir" -v "$SSH_AUTH_SOCK:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/basecamp/kamal:latest'`).

On the server: SSH access as root (or set `KAMAL_SSH_USER` to a user in the
`docker` group). Kamal installs Docker if it is missing. To use a domain,
point its DNS at the server first.

Generate the two secrets once and keep them. Changing `BETTER_AUTH_SECRET`
signs everyone out.

```sh
export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
export PROXY_API_KEY=$(openssl rand -hex 32)
```

Sign-in needs a GitHub App. Create one with the callback URL
`<your URL>/api/auth/callback/github`, the account permission "Email
addresses: read-only" and the webhook turned off. Export its client ID and a
client secret too:

```sh
export GITHUB_CLIENT_ID=Iv...
export GITHUB_CLIENT_SECRET=...
```

## Deploy

Kamal builds from the last commit, so commit first.

```sh
export KAMAL_HOST=203.0.113.10        # the server
export KAMAL_DOMAIN=chat.example.com  # optional; enables HTTPS
kamal setup                           # first time: Docker, proxy, Redis, app
kamal deploy                          # every time after
```

There is no registry account to set up. Kamal runs a registry on your machine
and pushes to the server through the SSH connection. Set `KAMAL_ARCH=arm64`
for an ARM server.

The first account to sign up becomes the admin. Connect a provider in
Settings → Providers.

## Deploying to the machine you are on

Kamal's registry tunnel needs the server to be a different machine. To deploy
to the same one, run the registry yourself and let the server pull from it:

```sh
docker run -d --name kamal-docker-registry --restart unless-stopped -p 127.0.0.1:5555:5000 registry:3
export KAMAL_REGISTRY=127.0.0.1:5555
```

If ports 80/443 are taken, or the app should only be reachable on a private
address, set `KAMAL_HTTP_PORT` and `KAMAL_BIND_IP` too.

## Day to day

```sh
kamal app logs -f            # web, proxy and worker logs together
kamal accessory logs redis
kamal app exec -i bash       # a shell in the app container
```
