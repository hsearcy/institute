#!/usr/bin/env bash
# Rebuild the shipping Dragonheart gem from its raw Tripo output.
#
# Provenance
#   Concept:  assets/concepts/dragonheart/hero-concept.png — the approved
#             "Emerald Hoard Guardian" hero art (style authority). The four-angle
#             turnaround alongside it was structural reference only.
#   Tool:     Tripo image-to-3D, model v3.1-20260211, texture+geometry quality
#             "detailed", texture_alignment=original_image, orientation=align_image.
#   Task ID:  c222b262-97c5-428c-bea3-eb57bf58dda6   (60 credits)
#
# The raw mesh is 1.88M triangles / 55 MB, and that is almost entirely geometry —
# the three textures together are only 2.5 MB. So this pipeline decimates hard and
# leaves the maps large. 226k triangles was chosen by A/B render: at 4x gameplay
# zoom it is indistinguishable from the full mesh, while 113k visibly softens the
# horn tips and scale ridges.
#
# `assets/` is the untracked raw working dir (see .gitignore), so a fresh clone
# must re-download the Tripo task before running this. With TRIPO_API_KEY set in
# .env, the fetch below does that automatically.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$root/assets/models/dragonheart"
src="$work/genA/model.glb"
dst="$root/web/public/assets/models/gems/dragonheart/model.glb"
task="c222b262-97c5-428c-bea3-eb57bf58dda6"

if [ ! -f "$src" ]; then
  echo "raw mesh missing — re-fetching Tripo task $task"
  # shellcheck disable=SC1091
  set -a; . "$root/.env"; set +a
  mkdir -p "$work/genA"
  url=$(curl -sS -H "Authorization: Bearer $TRIPO_API_KEY" \
    "https://api.tripo3d.ai/v2/openapi/task/$task" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['result']['pbr_model']['url'])")
  # A plain urllib/wget UA gets a 403 from Tripo's CDN; curl with a browser UA works.
  curl -sSL -A "Mozilla/5.0" -o "$src" "$url"
fi

# gltf-transform pulls in sharp for the texture steps. Installing the CLI the
# obvious way fails here: sharp's postinstall check runs before npm has placed the
# @img prebuild, so it tries to compile from source, dies, and leaves a
# half-installed CLI that exits 1 with NO output on every command. Landing the
# prebuild first and then installing with --ignore-scripts avoids all of that.
tools="${GLTF_TOOLS_DIR:-$work/.tools}"
if [ ! -f "$tools/node_modules/@gltf-transform/cli/bin/cli.js" ]; then
  mkdir -p "$tools"
  ( cd "$tools" \
    && npm i @img/sharp-linux-x64@0.34.5 >/dev/null \
    && npm i --ignore-scripts @gltf-transform/cli@4.4.2 >/dev/null )
fi
gt() { node "$tools/node_modules/@gltf-transform/cli/bin/cli.js" "$@"; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gt weld     "$src"       "$tmp/1.glb"
gt simplify "$tmp/1.glb" "$tmp/2.glb" --ratio 0.12 --error 0.0005
gt resize   "$tmp/2.glb" "$tmp/3.glb" --width 2048 --height 2048
# Anchor the glob: a loose "*ORM*" also matches "NormalGL" and silently drops the
# normal map — the one texture carrying the facet shading — to 1024.
gt resize   "$tmp/3.glb" "$tmp/4.glb" --width 1024 --height 1024 --pattern "ORM_*"
gt webp     "$tmp/4.glb" "$tmp/5.glb" --quality 92
gt prune    "$tmp/5.glb" "$tmp/6.glb"
# meshopt needs GLTFLoader.setMeshoptDecoder() on the client — see Game.ts.
gt meshopt  "$tmp/6.glb" "$dst"       --level medium

echo "built $dst ($(du -h "$dst" | cut -f1))"

# The shop shelf shows a render of this exact GLB rather than a CSS approximation.
# Needs the vite dev server up; skipped when it isn't.
if curl -sf -o /dev/null http://127.0.0.1:5188/; then
  ( cd "$root/web" && node scripts/render-gem-thumbnail.mjs \
      /assets/models/gems/dragonheart/model.glb "$tmp/thumb.png" -1.5707963 )
  ffmpeg -v error -y -i "$tmp/thumb.png" -vf "crop=440:440:36:36,scale=256:256" \
    -c:v libwebp -pix_fmt yuva420p -quality 90 \
    "$root/web/public/assets/models/gems/dragonheart/preview.webp"
  echo "built preview.webp"
else
  echo "vite not running on :5188 — skipped the shop thumbnail"
fi
