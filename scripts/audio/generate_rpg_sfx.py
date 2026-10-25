"""Generates the RPG sound effects with ElevenLabs, then trims and levels them.

Usage: python3 scripts/audio/generate_rpg_sfx.py [id ...]
Needs ELEVENLABS_API_KEY (from .env) and ffmpeg. Raw downloads are kept in
assets/rpg-sfx-raw (not committed) and reused, so a rerun costs nothing; delete
a raw file to buy a new take. Output: web/public/assets/rpg/audio/sfx/*.mp3 and
manifest.json beside it.
"""
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from rpg_sfx_spec import SPEC  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "assets" / "rpg-sfx-raw"
OUT = ROOT / "web" / "public" / "assets" / "rpg" / "audio" / "sfx"


def api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key and (ROOT / ".env").exists():
        for line in (ROOT / ".env").read_text().splitlines():
            if line.strip().startswith("ELEVENLABS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is missing")
    return key


def generate(prompt: str, seconds: float, influence: float, loop: bool, path: Path) -> None:
    body = {"text": prompt, "duration_seconds": seconds, "prompt_influence": influence, "model_id": "eleven_text_to_sound_v2"}
    if loop:
        body["loop"] = True
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": api_key(), "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    path.write_bytes(data)


def levels(path: Path, filters: str) -> tuple[float, float]:
    """Peak and RMS level in dBFS after the filters."""
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"{filters},astats=metadata=0", "-f", "null", "-"],
                            capture_output=True, text=True, check=True)
    overall = result.stderr.split("Overall")[-1]
    read = lambda label: float(next(l for l in overall.splitlines() if label in l).split(":")[-1])
    return read("Peak level dB"), read("RMS level dB")


def process(raw: Path, out: Path, kind: str) -> dict:
    if kind == "loop":
        # A loop keeps its exact length so the seam stays clean.
        shape, target, args = "anull", -21.0, ["-ac", "2", "-b:a", "128k"]
    else:
        # Cut leading and trailing silence; short fades stop clicks at the cuts.
        trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01"
        shape = f"{trim},areverse,{trim},afade=t=in:d=0.04,areverse,afade=t=in:d=0.003"
        target, args = (-18.0 if kind == "ui" else -13.0), ["-ac", "1", "-b:a", "96k"]
    # Level by loudness, so clips in one group sound equally strong; the
    # limiter takes at most 8 dB off the sharpest transients.
    peak, rms = levels(raw, shape)
    gain = min(target - rms, -1 - peak + 8)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", f"{shape},volume={gain:.2f}dB,alimiter=limit=0.89:attack=1:release=40:level=disabled",
                    "-ar", "44100", *args, str(out)], check=True)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                   capture_output=True, text=True, check=True).stdout)
    return {"seconds": round(seconds, 2), "bytes": out.stat().st_size}


def main() -> None:
    only = set(sys.argv[1:])
    RAW.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"clips": {}}
    for clip_id, (prompt, seconds, variants, influence, kind) in SPEC.items():
        if only and clip_id not in only:
            continue
        files = []
        for n in range(1, variants + 1):
            name = clip_id if variants == 1 else f"{clip_id}-{n}"
            raw = RAW / f"{name}.mp3"
            if not raw.exists():
                print(f"generate {name}", flush=True)
                generate(prompt, seconds, influence, kind == "loop", raw)
            info = process(raw, OUT / f"{name}.mp3", kind)
            files.append({"file": f"{name}.mp3", **info})
        manifest["clips"][clip_id] = {"kind": kind, "prompt": prompt, "files": files}
    manifest.update({"source": "scripts/audio/generate_rpg_sfx.py (ElevenLabs sound generation, eleven_text_to_sound_v2)",
                     "format": "mp3 44.1 kHz; effects mono 96k, ambience stereo 128k"})
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
