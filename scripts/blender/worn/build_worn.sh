#!/usr/bin/env bash
# Build worn (skinned, body-fitted) gear GLBs with Windows Blender from WSL (or a native blender on PATH).
# Usage: scripts/blender/items/build_worn.sh [--ids a,b] [--install]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BLENDER="${BLENDER:-/mnt/c/Program Files/Blender Foundation/Blender 4.3/blender.exe}"
SCRIPT="$HERE/build_worn.py"
if [[ "$BLENDER" == *.exe ]]; then SCRIPT="$(wslpath -w "$SCRIPT")"; fi
exec "$BLENDER" -b --factory-startup --python "$SCRIPT" -- "$@"
