#!/usr/bin/env bash
# Fill the workspace volume on first start (04.08.2026).
#
# WHY: the repository used to live on a 9p bind mount of the Windows disk, where 300 small
# files cost 1447 ms to write against 8 ms on the container's own disk — a factor of 180 to
# 1000 that every git command, every test run and every search paid. It now lives on a named
# VOLUME mounted at the same path, so nothing else in the project has to know: the path stays
# /workspace/hoa, and with it the memory slug, every script and every document reference.
#
# The Windows folder stays mounted READ-ONLY at /backup/hoa. That is where this script fills
# from, so the fill needs no network and no credentials, and it keeps the full history and
# every branch rather than a shallow slice.
#
# Idempotent: a volume that already carries the repository is left untouched.
set -euo pipefail

WORK=/workspace/hoa
BACKUP=/backup/hoa

if [ -d "$WORK/.git" ]; then
  echo "fill-workspace: $WORK already carries the repository — nothing to do."
  exit 0
fi

if [ ! -d "$BACKUP/.git" ]; then
  echo "fill-workspace: NO SOURCE — $BACKUP holds no repository." >&2
  echo "  The volume stays empty rather than half-filled. Check the bind mount in" >&2
  echo "  devcontainer.json before starting again." >&2
  exit 1
fi

# git clone REFUSES any non-empty destination, and the volume is rarely pristine: a start that
# died after the clone still ran `npm install`, so an empty node_modules/ sits there and turns
# the fill into a hard failure (seen 04.08.2026). So clone into a temporary directory INSIDE
# the volume and move the result into place — same filesystem, so the move is a rename, and
# whatever was already there is kept rather than deleted.
# The backup is a Windows bind: its files belong to no uid the container knows, so git rejects
# it as "dubious ownership" before it reads a single object. The exception belongs HERE and not
# in devcontainer.json — it is this script's own precondition, and a clone is worthless without it.
for dir in "$BACKUP" "$BACKUP/.git"; do
  git config --global --get-all safe.directory | grep -qxF "$dir" \
    || git config --global --add safe.directory "$dir"
done

echo "fill-workspace: cloning from the read-only backup (full history, all branches)…"
TMP="$WORK/.fill-tmp"
rm -rf "$TMP"
mkdir -p "$WORK"
git clone "$BACKUP" "$TMP"
shopt -s dotglob
mv "$TMP"/* "$WORK"/
shopt -u dotglob
rmdir "$TMP"

git -C "$WORK" remote set-url origin "$(git -C "$BACKUP" remote get-url origin)"
git -C "$WORK" fetch origin --prune || echo "fill-workspace: fetch failed — the clone stands, only the refs may lag."

# What git does NOT carry, and what none of it can be rebuilt from (measured 04.08.2026):
# the token the CI guard reads, the notification topic and chat secret, the board file and
# its archive, the batch's own state files, the user's voice reference and the music sources.
# Everything else that is ignored — node_modules, dist, .cache, scratchpad logs, the tile
# cache — is reproducible and deliberately left behind.
echo "fill-workspace: carrying over what git does not…"
for item in \
  ".secrets" \
  ".batch-dashboard.html" \
  ".batch-dashboard-archive.html" \
  "music" \
  "Referenzstimme Patrick.wav" \
  "local"
do
  if [ -e "$BACKUP/$item" ]; then
    cp -r "$BACKUP/$item" "$WORK/" && echo "  · $item"
  fi
done

# The batch state, file by file, so a stray log or a worktree directory does not ride along.
mkdir -p "$WORK/.claude"
find "$BACKUP/.claude" -maxdepth 1 -type f \
  \( -name '*.json' -o -name '*.jsonl' -o -name 'chat-secret' -o -name 'ntfy-topic' \) \
  -exec cp {} "$WORK/.claude/" \; 2>/dev/null || true
echo "  · .claude state files"

echo "fill-workspace: done. The Windows copy at $BACKUP stays as the backup it now is."
