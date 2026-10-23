#!/bin/sh
# Keep /site/current built from SOURCE_BRANCH with UPSTREAM_BRANCH merged in.
#
# Every UPDATE_INTERVAL: fetch both, and when either moved, merge, build and
# swap the new bundle in atomically. A failed merge or build leaves the last
# good bundle serving and is retried next round. UPSTREAM_REPO="" builds the
# source branch as-is.
set -u

SRC=/work/src
STAMP=/work/built-from

log() { echo "[hermes-web update] $*"; }

git_() { git -C "$SRC" -c user.name=hermes-web -c user.email=hermes-web@localhost "$@"; }

fetch() {
  if [ ! -d "$SRC/.git" ]; then
    git clone --quiet --filter=blob:none --branch "$SOURCE_BRANCH" "$SOURCE_REPO" "$SRC" || return 1
  fi

  git_ remote set-url origin "$SOURCE_REPO"
  git_ fetch --quiet origin "$SOURCE_BRANCH" || return 1

  if [ -n "$UPSTREAM_REPO" ]; then
    git_ remote get-url upstream >/dev/null 2>&1 || git_ remote add upstream "$UPSTREAM_REPO"
    git_ remote set-url upstream "$UPSTREAM_REPO"
    git_ fetch --quiet upstream "$UPSTREAM_BRANCH" || return 1
  fi
}

# Identity of what a build would contain: both tips (a merge commit's own hash
# changes with its timestamp, so it can't serve).
wanted() {
  echo "$(git_ rev-parse origin/"$SOURCE_BRANCH") ${UPSTREAM_REPO:+$(git_ rev-parse upstream/"$UPSTREAM_BRANCH")}"
}

prepare() {
  git_ checkout --quiet --force -B build origin/"$SOURCE_BRANCH" || return 1
  git_ clean --quiet -fdx -e node_modules

  if [ -n "$UPSTREAM_REPO" ] && ! git_ merge --quiet --no-edit upstream/"$UPSTREAM_BRANCH"; then
    git_ merge --abort
    log "upstream $UPSTREAM_BRANCH does not merge cleanly into $SOURCE_BRANCH; keeping the current build"

    return 1
  fi
}

build() {
  (
    cd "$SRC" &&
      npm ci --ignore-scripts --no-audit --no-fund \
        --workspace apps/shared --workspace apps/desktop --workspace apps/web-client &&
      npm run build --workspace apps/web-client
  )
}

publish() {
  release="/site/release-$(date +%Y%m%d%H%M%S)"
  cp -a "$SRC/apps/web-client/dist" "$release" || return 1
  ln -sfn "$release" /site/current.next && mv -T /site/current.next /site/current

  # Keep the live release and the one before it (a tab mid-load may still want
  # its hashed assets).
  ls -1d /site/release-* | sort | head -n -2 | xargs -r rm -rf
  rm -rf /site/placeholder
}

while :; do
  if fetch; then
    want=$(wanted)

    if [ "$want" != "$(cat "$STAMP" 2>/dev/null)" ]; then
      log "building $want"

      if prepare && build && publish; then
        echo "$want" >"$STAMP"
        log "now serving $want"
      else
        log "build failed; still serving the previous bundle"
      fi
    fi
  else
    log "fetch failed; retrying next round"
  fi

  sleep "$UPDATE_INTERVAL"
done
