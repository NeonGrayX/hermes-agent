#!/bin/sh
# Caddy serves /site/current; update.sh replaces it in the background. Until
# the first build lands, /site/current is a "building" page.
set -eu

if [ ! -e /site/current ]; then
  mkdir -p /site/placeholder
  cp /opt/hermes-web/building.html /site/placeholder/index.html
  ln -s /site/placeholder /site/current
fi

/opt/hermes-web/update.sh &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
