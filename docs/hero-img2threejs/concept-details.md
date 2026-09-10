# Teal adventurer: reference measurements and detail inventory

Source: [approved concept](../concepts/math-dungeon-rpg/07-teal-hero.png), 1536×1024. Analysis uses this image and the img2threejs structure, head, hair, and detail-inventory references only. Existing models, textures, and Blender sources were not inspected or reused.

The figure is a young adult adventurer, approximately **7.5 anatomical head units**, rather than a child-proportioned or chibi character. Its strongest features are the open teal hood, angular face, fitted silver breastplate, restrained gold edging, split tabard, layered leather equipment, and substantial folded cape.

## Measurements

These are approximate manual image readings, generally within ±5–10 pixels. Both views are perspective illustrations; depth is not directly measurable. Normalize scaffold dimensions to hood-apex-to-floor height H≈959px. The head unit is hair crown to chin, about 124px; anatomical crown-to-floor height is approximately 930px.

| Measurement, front figure | Pixels | Fraction of H |
| --- | ---: | ---: |
| Hood apex to lowest boot sole | 959 | 1.000 |
| Hair crown to chin | 124 | .129 |
| Face width, excluding ears | 82–88 | .086–.092 |
| Hood outer width | 165–175 | .172–.182 |
| Armored shoulder span | 340–350 | .355–.365 |
| Chest plate width | 200–215 | .209–.224 |
| Waist plate width | 165–180 | .172–.188 |
| Belt thickness | 42–48 | .044–.050 |
| Shoulder line to belt center | 220–235 | .229–.245 |
| Hip joint to knee center, inferred beneath cloth | 205–225 | .214–.235 |
| Knee center to boot sole | 255–275 | .266–.287 |
| Front tabard, belt to pointed hem | 245–265 | .255–.276 |
| Main knee plate height | 88–103 | .092–.107 |
| Sword, pommel to tip | 570–580 | .594–.605 |
| Sword blade, guard to tip | 430–450 | .448–.469 |

Front landmarks: hood apex≈(538,30); hair crown≈(539,57); eye line y≈109; nose base y≈135; mouth y≈150; chin y≈181; shoulders y≈205; belt center y≈435; knee centers y≈718; boot soles y≈980.

Eye centers≈(520,109),(558,110), giving interocular distance≈.30 head heights. The eye line sits .42–.44 head heights below the hair crown; nose base≈.63; mouth≈.75. Mouth width≈.27–.30 head heights. The jaw narrows from pronounced cheekbones toward a broad chin. These human measurements must replace the unrelated creature-specific proportions in the head-construction example.

## Evidence zones

Scan method: `component-zones`. Rectangles are `[x0,y0,x1,y1]`, normalized to the complete source image. F means front three-quarter figure; R means rear three-quarter figure.

| Zone | Rectangle |
| --- | --- |
| F.head | [.291,.027,.402,.211] |
| F.shoulders | [.219,.180,.452,.323] |
| F.torso | [.270,.190,.421,.414] |
| F.arms | [.177,.294,.496,.574] |
| F.belt | [.253,.385,.443,.543] |
| F.tabard | [.241,.438,.445,.693] |
| F.legs | [.216,.623,.486,.973] |
| F.cape | [.026,.202,.381,.778] |
| F.sword | [.009,.471,.242,.940] |
| R.hood | [.693,.063,.804,.226] |
| R.cape | [.494,.183,.805,.761] |
| R.belt | [.718,.409,.831,.562] |
| R.legs | [.633,.622,.869,.953] |

## Visible details

The feature keys below are proposed destinations for the sculpt spec's `component.localFeatures` or `material.localOverrides`. They are not a claim that those spec entries already exist. Root authoring must resolve each key to an actual emitted feature before the detail-inventory gate can pass.

Confidence is observational, not a generated-model score. High=0.9; medium=0.7. Exact hidden shapes, counts behind occlusion, and surface microstructure remain inferred.

| ID | Scale | Evidence | Feature and intended destination | Confidence |
| --- | --- | --- | --- | --- |
| 01 | macro | F.head | Soft pointed hood crown, broad opening and flared cheek sides: hood.openingContour | high |
| 02 | macro | F.head | Elongated angular face with defined cheekbones and jaw: head.cheekJawProfile | high |
| 03 | macro | F.shoulders | Compact rounded pauldrons without oversized spikes: pauldrons.domeProfile | high |
| 04 | macro | F.torso | Breastplate follows tapered ribs and waist: cuirass.crossSections | high |
| 05 | macro | F.arms | Tapered arms, cloth bulk near bent elbows: sleeves.sectionProfile | high |
| 06 | macro | F.tabard | Pointed center skirt panel and two shorter side panels: tabard.panelContours | high |
| 07 | macro | F.legs | Separated knees, outward-facing boots and planted stance: scaffold.legLandmarks | high |
| 08 | macro | F.cape/R.cape | Broad continuous cape with large diagonal folds and rear depth: cape.foldSurface | high |
| 09 | macro | F.sword | Straight long blade, pronounced bevels and tapered point: blade.crossSections | high |
| 10 | meso | F.head | Thin continuous gold border around hood opening: hood.rimBinding | high |
| 11 | meso | R.hood | Rounded rear hood pouch with inward neck fold: hood.rearFold | high |
| 12 | meso | F.head | Swept curved brown hair locks with central part: hair.partAndLocks | high |
| 13 | meso | F.head | Roots disappear beneath hood, no detached spikes: hair.rootOverlap | high |
| 14 | meso | F.head | Strong dark eyebrows with tapered outer ends: brows.contour | high |
| 15 | meso | F.head | Narrow nose bridge, defined tip, recessed nostrils: head.nasalPlanes | high |
| 16 | meso | F.head | Closed mouth, restrained asymmetric smile: head.lipCrease | high |
| 17 | meso | F.torso | Layered teal cowl folds across collarbones: cowl.foldBands | high |
| 18 | meso | F.torso | Standing teal inner collar with gold edge: collar.openProfile | high |
| 19 | meso | F.torso | Gold diamond clasp with teal center: clasp.diamondBezel | high |
| 20 | meso | F.shoulders | Overlapping lower pauldron lames with gaps and gold lips: pauldrons.lameLayers | high |
| 21 | meso | F.shoulders | Angular ornamental gold trim follows curved steel: pauldrons.trimPaths | high |
| 22 | meso | F.torso | Central breastplate ridge with sloping upper facets: cuirass.centerRidge | high |
| 23 | meso | F.torso | Gold waist/side borders and central downward point: cuirass.borderPaths | high |
| 24 | meso | F.torso | Diagonal brown shoulder strap across chest: harness.diagonalPath | high |
| 25 | meso | F.torso | Small framed strap buckle and folded overlap: harness.buckleAssembly | high |
| 26 | meso | F.belt | Broad brown belt and angular gold buckle: belt.buckleContour | high |
| 27 | meso | F.belt | Large dimensional pouch, flap and rounded lower corners: pouch.largeBody | high |
| 28 | meso | F.belt/R.belt | Uneven smaller pouches and hanging straps: pouches.layout | high |
| 29 | meso | F.arms | Leather bracers with pointed upper metal guards and cuffs: bracers.layerContours | high |
| 30 | meso | F.arms | Fingerless gloves exposing separate fingers and thumbs: gloves.openFingers | high |
| 31 | meso | F.tabard | Long gold central border and pointed terminal ornament: tabard.centerBinding | high |
| 32 | meso | F.tabard | Side panels flare away from trousers: tabard.sideClearance | high |
| 33 | meso | F.legs | Shield-shaped knees with central facet and gold frames: knees.shieldContour | high |
| 34 | meso | F.legs/R.legs | Dark straps around and beneath knee armor: knees.strapPaths | high |
| 35 | meso | F.legs | Fitted tall brown boots, ankle articulation, rounded armored toes: boots.shaftFootSurface | high |
| 36 | meso | F.legs | Gold ankle bands with shaped front tips: boots.ankleGuards | high |
| 37 | meso | F.sword | Angular gold quillons and central orange jewel: guard.quillonsAndBezel | high |
| 38 | meso | F.sword | Dark teal wrapped grip with gold pommel: grip.wrapProfile | high |
| 39 | micro | F.head | Warm lock highlights and dark roots: hair.material.lockHighlights | high |
| 40 | micro | F.head | Subtle chin/jaw stubble, no prominent scar: skin.material.stubbleMask | medium |
| 41 | micro | F.torso | Fine steel scratches/mottling beneath broad highlights: steel.material.handlingMarks | medium |
| 42 | micro | F.shoulders/F.arms | Small round gold fasteners: fasteners.instances | high |
| 43 | micro | F.belt/R.belt | Pouch border stitches, flap seams and closures: pouches.seamPaths | medium |
| 44 | micro | F.tabard/R.cape | Small gold leaf/diamond hem motifs: cloth.material.hemMotifs | high |
| 45 | micro | R.cape | Bright narrow bevel on gold binding: cape.bindingBevel | high |
| 46 | micro | F.cape/R.cape | Irregular missing wedges/notches at cape hem: cape.hemCuts | high |
| 47 | micro | F.arms/F.tabard | Fine cloth surface, fold shadows, restrained wear: cloth.material.weaveAndWear | medium |
| 48 | micro | F.legs/R.legs | Boot panel seams, leather creasing and separate dark soles: boots.seamsAndSole | high |
| 49 | micro | F.sword | Bright bevel bands beside darker central blade plane: blade.edgeBevels | high |
| 50 | micro | F.sword | Orange jewel has distinct triangular facets: guard.gemFacets | high |

## Continuous-surface construction

- Core: coherent smooth-union anatomical fields, meshed continuously; no visible sphere/cylinder intersections at shoulders, wrists, elbows, knees or ankles. Hidden anatomy can be simple but must constrain garments.
- Face: integrated cranium, cheek, jaw and nose surface with actual orbital recesses. Buried eyeballs, fitted lids, about four concentric eye loops and three mouth loops where facial deformation is required. Nose and lips grow from the face rather than appearing as glued-on primitives.
- Hood/cowl: shaped shells with opening thickness and an inner surface; rear hood folds into cowl. Neither a cone nor a flat front ring.
- Cape/tabard: continuous subdivided fabric surfaces with designed low-frequency folds. Real hem cuts; binding deforms with its host. No disconnected strip approximation.
- Armor: curved closed shells, real edge bevels, separate overlapping rigid lames. Single-bone weights for rigid plates rather than stretching metal across joints.
- Hands/boots: connected palm, separate articulated fingers and opposed thumb. Boots need heel, instep, toe box and sole with continuous ankle-to-foot transition.
- Hair: compact scalp surface with fitted raised lock ridges; if separate locks are used, approximately 5–8 visible tapered volumetric locks are enough for this hood opening. Roots stay embedded and tips curve. The large blonde crown from the unrelated hair example is not a target. The installed skill's current shell-first hair contract remains authoritative.
- Materials: geometry carries bevels, gaps, pouch thickness and cloth openings. Localized appearance carries weave, fine scratches, stubble and hem motifs. Heavy procedural noise must not replace the clean, vivid reference surfaces.

Highest-risk shortcuts: oversized round head, blank hood opening, oversized shoulder armor, flat cape, cylindrical torso, mitten hands, and gold edging rendered as broad yellow paint. Depth and unseen anatomy remain estimates and need orbit verification.
