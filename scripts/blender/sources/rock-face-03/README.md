# Rock Face 03 — masonry study source

The [Poly Haven asset](https://polyhaven.com/a/rock_face_03) is CC0 under
[Poly Haven's asset license](https://polyhaven.com/license). Photography by Dario
Barresi; processing by Rico Cilliers. Source coverage is approximately 2.7 metres.

`manifest.json` pins the public 1K JPEG diffuse, roughness, displacement and OpenGL
normal maps by URL, byte count and SHA-256. Run `python fetch.py` to restore the
ignored cache. No account or credentials are needed. The current study uses the
diffuse, roughness and displacement maps with restrained saturation and a separate
worked-stone response; the normal map is retained for further bake comparisons.

`../../detailed/masonry_pier.py` constructs an isolated high-detail pier from
these maps. The full-height variant is registered in the production asset build
through `../../detailed/rebuild_masonry_pier.py`. Its source, optimized export and
reviewed native-camera placements passed 8/10 independently. The separate
three-course short variant now also passes source/export and bridge integration
review and is registered in the same build. Its bake widens subpixel UV charts
before packing, preserving texture coverage on thin molded edges.
