#!/usr/bin/env python3
"""Procedurally synthesize the game's UI/juice SFX as small WAV files.

Cross-platform, dependency-free (stdlib only), and reproducible. Used because the
provided ElevenLabs key lacks the `sound_generation` scope. Swap in richer
generated audio later by replacing the .wav files of the same name.

Run:  python3 scripts/synth_sfx.py
Out:  assets/audio/*.wav
"""
import math
import os
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

A4 = 440.0
def note(semis_from_a4: float) -> float:
    return A4 * (2 ** (semis_from_a4 / 12.0))

# Pleasant pitches (semitones relative to A4)
C5, E5, G5, C6, E6, G6 = -9, -5, -2, 3, 7, 10
A4S = 0


def _write(name: str, samples: list[float]) -> None:
    os.makedirs(OUT, exist_ok=True)
    # soft-clip + normalize
    peak = max(1e-6, max(abs(s) for s in samples))
    norm = 0.92 / peak
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s * norm))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))
    print(f"  wrote {name}  ({len(samples)/SR:.2f}s)")


def tone(freq: float, dur: float, *, decay: float = 6.0, harm: float = 0.35,
         vib: float = 0.0, start: float = 0.0, swell: float = 0.0) -> list[float]:
    """A decaying sine with a touch of 2nd/3rd harmonic for warmth."""
    n = int(dur * SR)
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        env = math.exp(-decay * t)
        if swell > 0:  # attack swell instead of instant onset
            env *= min(1.0, t / swell)
        f = freq * (1 + vib * math.sin(2 * math.pi * 5 * t))
        ph = 2 * math.pi * f * t
        s = math.sin(ph) + harm * math.sin(2 * ph) + harm * 0.4 * math.sin(3 * ph)
        out[i] = s * env
    return out


def mix(*layers: list[float]) -> list[float]:
    n = max(len(l) for l in layers)
    out = [0.0] * n
    for l in layers:
        for i, s in enumerate(l):
            out[i] += s
    return out


def at(offset_s: float, layer: list[float], total_s: float) -> list[float]:
    n = int(total_s * SR)
    out = [0.0] * n
    off = int(offset_s * SR)
    for i, s in enumerate(layer):
        j = off + i
        if 0 <= j < n:
            out[j] += s
    return out


def slide(f0: float, f1: float, dur: float, *, decay: float = 5.0, square: bool = False) -> list[float]:
    n = int(dur * SR)
    out = [0.0] * n
    ph = 0.0
    for i in range(n):
        t = i / SR
        f = f0 * (f1 / f0) ** (t / dur)
        ph += 2 * math.pi * f / SR
        env = math.exp(-decay * t)
        base = math.sin(ph)
        if square:
            base = 0.6 * base + 0.4 * (1 if math.sin(ph) > 0 else -1)
        out[i] = base * env
    return out


def noise_swell(dur: float, *, lp: float = 0.2) -> list[float]:
    """Filtered noise that swells then fades — a soft whoosh."""
    import random
    rng = random.Random(7)
    n = int(dur * SR)
    out = [0.0] * n
    prev = 0.0
    for i in range(n):
        t = i / SR
        white = rng.uniform(-1, 1)
        prev = prev + lp * (white - prev)  # one-pole lowpass
        env = math.sin(math.pi * (t / dur)) ** 1.5  # swell in/out
        out[i] = prev * env
    return out


def main() -> None:
    print("synthesizing SFX ->", os.path.normpath(OUT))

    # correct: bright rising major triad arpeggio
    _write("correct.wav", mix(
        at(0.00, tone(note(C5), 0.5, decay=7), 0.6),
        at(0.06, tone(note(E5), 0.5, decay=7), 0.6),
        at(0.12, tone(note(G5), 0.55, decay=6), 0.6),
        at(0.12, tone(note(C6), 0.55, decay=6, harm=0.2), 0.6),
    ))

    # wrong: gentle soft two-tone descending "bonk" (not harsh)
    _write("wrong.wav", mix(
        at(0.00, tone(note(-12), 0.18, decay=10, harm=0.5), 0.42),
        at(0.10, tone(note(-17), 0.30, decay=9, harm=0.5), 0.42),
    ))

    # collect: quick bright coin blip up
    _write("collect.wav", mix(
        at(0.00, tone(note(G5), 0.10, decay=14), 0.32),
        at(0.05, tone(note(C6), 0.26, decay=11), 0.32),
        at(0.05, tone(note(E6), 0.22, decay=11, harm=0.2), 0.32),
    ))

    # cast: sparkly upward chirp + tiny pop
    _write("cast.wav", mix(
        at(0.00, slide(note(C5), note(G6), 0.32, decay=5), 0.5),
        at(0.20, tone(note(C6), 0.28, decay=9, harm=0.25, swell=0.01), 0.5),
        at(0.22, tone(note(G6), 0.24, decay=10, harm=0.2), 0.5),
    ))

    # whoosh: soft filtered-noise swell with a shimmer
    _write("whoosh.wav", mix(
        at(0.00, noise_swell(0.6, lp=0.12), 0.62),
        at(0.18, [s * 0.25 for s in tone(note(G5), 0.4, decay=4, swell=0.06)], 0.62),
    ))

    # win: cheerful 4-note rising fanfare + sparkle tail
    total = 1.6
    layers = []
    seq = [(0.00, C5), (0.12, E5), (0.24, G5), (0.36, C6)]
    for off, p in seq:
        layers.append(at(off, tone(note(p), 0.7, decay=4.5), total))
        layers.append(at(off, tone(note(p + 12), 0.7, decay=5, harm=0.15), total))
    # sparkle tail
    for k, off in enumerate([0.52, 0.62, 0.72, 0.82, 0.92]):
        layers.append(at(off, [s * 0.5 for s in tone(note(G6 + k), 0.3, decay=9)], total))
    _write("win.wav", mix(*layers))

    print("done.")


if __name__ == "__main__":
    main()
