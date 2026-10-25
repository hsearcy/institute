#!/usr/bin/env bash
# Build gear GLBs + icons with Windows Blender from WSL (or a native blender on PATH).
# Usage: scripts/blender/items/build_gear.sh [--ids a,b] [--install]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${BLENDER:-/mnt/c/Program Files/Blender Foundation/Blender 4.3/blender.exe}"
SCRIPT="$HERE/build_gear.py"
if [[ "$BLENDER" == *.exe ]]; then SCRIPT="$(wslpath -w "$SCRIPT")"; fi
exec "$BLENDER" -b --factory-startup --python "$SCRIPT" -- "$@"
