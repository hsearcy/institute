#!/usr/bin/env bash
# Build worn armour sets cut from dressed Tripo heroes with Windows Blender from WSL (or a native blender on PATH).
# Usage: scripts/blender/items/build_worn_sets.sh [--sets cloth,iron,mage] [--install]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${BLENDER:-/mnt/c/Program Files/Blender Foundation/Blender 4.3/blender.exe}"
SCRIPT="$HERE/build_worn_sets.py"
if [[ "$BLENDER" == *.exe ]]; then SCRIPT="$(wslpath -w "$SCRIPT")"; fi
exec "$BLENDER" -b --factory-startup --python "$SCRIPT" -- "$@"
