# Early source topology check

Item preparation now evaluates original mesh modifiers and the same root-space
transform used for baking, then reports each connected surface separately
before making source copies, UV charts or projection targets. Closed components
with nonpositive signed volume or inconsistent edge winding are rejected. Open
and nonmanifold surfaces are explicitly listed for inspection. The checker
does not flip or otherwise repair geometry.

Six pure Python fixtures cover outward/inward shells, open surfaces, a small
inward component hidden inside a larger positive total, a reversed individual
face, and translation-invariant volume. Read-only live Blender verification
rejects all 12 bad Phoenix v7 feather parts and accepts corrected Phoenix v8 plus
Starfall v1. Scene/object/mesh counts remain unchanged; caller Scene is restored.
Total verification took 2.18 seconds. This is an early construction check and
provides no visual acceptance.

The actual `bake_items.prepare` entry point also rejected those 12 invalid
parts in 0.98 seconds, before creating any bake scene or atlas. Persistent
scene/object/mesh counts stayed 28/961/1425, and the source coordinate, face
index and material fingerprint remained identical. The original Scene was
restored. See `prepare-rejection.json` for the complete failure and counters.
