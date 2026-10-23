# Self-updating Hermes web client: serves the client and the same-origin proxy
# to a gateway (../Caddyfile), and rebuilds the client in place whenever its
# source branch or upstream Hermes moves (update.sh). See ../compose.yaml.
#
# Build context: apps/web-client/deploy.

FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY autobuild/update.sh autobuild/entrypoint.sh autobuild/building.html /opt/hermes-web/
RUN chmod +x /opt/hermes-web/*.sh

ENV HERMES_WEB_ADDRESS=:8080 \
    HERMES_WEB_ROOT=/site/current \
    SOURCE_REPO=https://github.com/NeonGrayX/hermes-agent.git \
    SOURCE_BRANCH=feat/web-mobile-client \
    UPSTREAM_REPO=https://github.com/NousResearch/hermes-agent.git \
    UPSTREAM_BRANCH=main \
    UPDATE_INTERVAL=6h \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    LEFTHOOK=0
VOLUME /work /site
EXPOSE 8080
ENTRYPOINT ["/opt/hermes-web/entrypoint.sh"]
