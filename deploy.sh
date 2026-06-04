#!/bin/bash
set -euo pipefail

SSH_KEY="/Users/markpinnuck/OCI/Key/mpoci.key"
REMOTE="ubuntu@168.138.106.96"
DEST="/var/www/djimissionplanner/"

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

rsync -avz $DRY_RUN \
  --exclude='*.zip' \
  --exclude='README.MD' \
  --exclude='.gitignore' \
  --exclude='.DS_Store' \
  --exclude='Makefile' \
  --exclude='deploy.sh' \
  --exclude='test/' \
  -e "ssh -i $SSH_KEY" \
  css html source \
  "$REMOTE:$DEST"

echo "Deploy complete."
