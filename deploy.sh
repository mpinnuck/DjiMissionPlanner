#!/bin/bash
set -euo pipefail

SSH_KEY="/Users/markpinnuck/OCI/Key/mpoci.key"
REMOTE="ubuntu@168.138.106.96"
DEST="/var/www/djimissionplanner/"
CACHE_BUST="$(date -u +%Y%m%d%H%M%S)"

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "DRY RUN — no files will be transferred."
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Local rsync is missing. Install it first (macOS: brew install rsync)."
  exit 127
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY"
  exit 1
fi

if ! ssh -i "$SSH_KEY" -o BatchMode=yes "$REMOTE" "command -v rsync >/dev/null 2>&1"; then
  echo "Remote rsync is missing on $REMOTE."
  echo "Install it with: sudo apt update && sudo apt install -y rsync"
  exit 127
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/html"
cp -R css source "$TMP_DIR/"
cp -R html "$TMP_DIR/"

python3 - "$TMP_DIR/html/dji_mission_planner.html" "$CACHE_BUST" <<'PY'
import re, sys
from pathlib import Path
path = Path(sys.argv[1])
cache_bust = sys.argv[2]
text = path.read_text()
text = text.replace('__APP_CACHE_BUST__', cache_bust)
path.write_text(text)
PY

rsync -avz $DRY_RUN \
  --chmod=D755,F644 \
  --exclude='*.zip' \
  --exclude='README.MD' \
  --exclude='.gitignore' \
  --exclude='.DS_Store' \
  --exclude='Makefile' \
  --exclude='deploy.sh' \
  --exclude='test/' \
  -e "ssh -i $SSH_KEY" \
  "$TMP_DIR"/css "$TMP_DIR"/html "$TMP_DIR"/source \
  "$REMOTE:$DEST"

echo "Deploy complete. Cache-bust token: $CACHE_BUST"
