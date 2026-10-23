# The Hermes web client as a standalone container: the built bundle plus the
# same-origin proxy to an existing gateway (deploy/Caddyfile).
#
#   docker build -f apps/web-client/Dockerfile -t hermes-web-client .
#   docker run -p 8080:8080 -e HERMES_GATEWAY=https://hermes.example.com hermes-web-client
#
# Build context is the repository root: the client is the desktop renderer.

FROM node:24-bookworm-slim AS build
WORKDIR /src
# Only the renderer is built: no Electron binary, browsers or git hooks.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    LEFTHOOK=0
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund \
      --workspace apps/shared --workspace apps/desktop --workspace apps/web-client
RUN npm run build --workspace apps/web-client

FROM caddy:2-alpine
COPY apps/web-client/deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/apps/web-client/dist /srv/hermes-web
ENV HERMES_WEB_ADDRESS=:8080
EXPOSE 8080
