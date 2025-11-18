#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $(basename "$0") DESTINATION_DIRECTORY" >&2
  exit 64
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEST_PATH="$1"

if [[ ! "$DEST_PATH" = /* ]]; then
  DEST_PATH="$SCRIPT_DIR/$DEST_PATH"
fi

DEST_PATH="$(realpath -m -- "$DEST_PATH")"

if [[ "$DEST_PATH" == "$SCRIPT_DIR" ]]; then
  echo "Destination directory must differ from the project root." >&2
  exit 65
fi

mkdir -p -- "$DEST_PATH"

echo "Copying project from $SCRIPT_DIR to $DEST_PATH (excluding node_modules)..."

rsync -av --exclude='node_modules/' "$SCRIPT_DIR"/ "$DEST_PATH"/

echo "Copy finished. Original directory still exists so you can verify before deleting it manually."
