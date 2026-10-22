# Hermes Web Client

The Hermes Desktop interface in a browser, for phones, tablets and any computer
on your network. It connects to a Hermes gateway (`hermes serve`) that is
already running; it does not run the agent itself.

It is the desktop renderer (`apps/desktop/src`), unchanged, built with a web
bridge in place of Electron. Everything the desktop app does over its remote
connection works here: chat with streaming tool output, sessions, projects,
profiles, settings, skills, cron jobs, messaging, and the file and git views of
the gateway host. Agent tools, terminal commands and file operations run on the
gateway host.

## How it connects

- **Same origin as the gateway.** The gateway's CORS policy only admits
  loopback origins and its WebSocket Origin check rejects other hosts, so the
  bundle must be served from the gateway's own address (a reverse proxy, below).
- **Sign-in is the gateway's own.** Without a session the client sends you to
  the gateway's `/login` page (username/password or OAuth, whichever the
  gateway has configured). The session is a cookie.
- **The chat socket** (`/api/ws`) is opened with a single-use ticket from
  `POST /api/auth/ws-ticket`, minted before every dial.
- **One gateway, many profiles.** The chosen profile is remembered in this
  browser; requests carry `?profile=`, as Desktop does for a shared remote.

`src/bridge/` implements `window.hermesDesktop` for the browser. Native-only
capabilities reject with a "not available in the Hermes web client" error.

## Run the gateway

Binding to a network address requires an auth provider. For a trusted LAN or a
VPN such as Tailscale, username/password is enough:

```bash
cat >> ~/.hermes/.env <<'EOF'
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=choose-a-strong-password
HERMES_DASHBOARD_BASIC_AUTH_SECRET=<output of: openssl rand -base64 32>
EOF
hermes serve --host 127.0.0.1 --port 9119
```

With the reverse proxy below on the same machine, the gateway can stay on
loopback; set `dashboard.public_url` in `config.yaml` to the address you open
in the browser (for example `https://hermes.lan`) so the gateway trusts that
Host and engages its sign-in gate. Without a proxy, bind `--host 0.0.0.0`.

Do not expose a username/password gateway to the public internet; use OAuth
(see the web dashboard docs) or keep it behind a VPN.

## Develop

From the repository root, `npm install` once. Then:

```bash
cd apps/web-client
HERMES_GATEWAY_URL=http://127.0.0.1:9119 npm run dev   # http://127.0.0.1:5175
HERMES_WEB_HOST=0.0.0.0 npm run dev                     # reachable from a phone on the LAN
npm run typecheck
```

The dev server proxies `/api` (including the WebSocket), `/auth` and `/login`
to the gateway, so it is same-origin like production.

## Deploy

```bash
npm run build        # → apps/web-client/dist
```

Serve `dist/` and the gateway from one origin. `deploy/Caddyfile` does that;
with Docker on the gateway host:

```bash
docker run -d --name hermes-web --network host \
  -e HERMES_WEB_ADDRESS=https://hermes.lan \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/dist:/srv/hermes-web:ro" \
  -v hermes-web-caddy:/data \
  caddy:2
```

Use HTTPS. Phones only allow the microphone (voice), clipboard access,
notifications and "Add to Home Screen" install on secure origins. Caddy's
`https://<name>` with its local CA works once you trust the CA on the phone;
`tailscale serve` gives a certificate browsers already trust.

## Not available in the browser

These need the Electron main process: the in-app browser pane and its
annotation mode, local terminals, the floating HUD, pet overlay and Quick
Entry, the macOS screenshot shortcut, separate session windows, native file
pickers and drag-and-drop paths, OS keychain storage, managing other gateways
(SSH, Hermes Cloud, the gateway registry), local installs, updates and
uninstall, and the VS Code theme marketplace.
