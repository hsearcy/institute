# Floor material comparison, same idle frame

Four lossless1440×900 screenshots from one frozen actual gameplay frame;
camera, characters, lighting, exposure, textures and UI are identical.
No production data was used or changed. These are runtime-only studies.

- baseline: bump.13, roughness.94, no roughness map.
- relief: bump.24, otherwise baseline.
- roughness: bump.13, existing spatial roughness map at.98 multiplier.
- combined: bump.24 with the mapped roughness.

The source paving texture is already detailed. The initial lossless baseline
review scores6.5 due flat surface response. Independent review: baseline/relief6.5, roughness/combined7. The mapped
variants improve stone response but distribute similarly sized blue damp catches
through too much of the arena. Extra bump provides no convincing benefit.
The localized candidate uses three irregular world-space patches at the margins
and larger dry expanses; its screenshot is a fresh idle frame at the same camera
and lighting, so character poses/problem differ. This candidate uses the uninstalled
gatePavingMaterial helper; review pending. No variant is accepted yet.
Do not judge fine floor detail from compressed spell-video frames.
