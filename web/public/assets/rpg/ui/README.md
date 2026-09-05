# Illustrated RPG interface assets

Original art generated with the built-in image generation tool on September 5,
2026 for this game. These assets are used by real controls in `ui-v2.css` and
`icons.ts`; they are not screenshots standing in for gameplay.

- `spells-v2.png`: a precisely aligned 5-column × 3-row spell atlas. Rows are
  Flame, Frost, Storm. Columns follow `spellAtlas` in `icons.ts`. CSS selects an
  individual cell with background positioning; the original image is retained.
- `relics-v2.png`: 6 × 4 inventory atlas. The first 23 cells follow `relicAtlas`;
  the final ruby ring is reserved artwork.
- `hud-v2.png`: illustrated ruby/sapphire orbs and an iron/bronze HUD cradle.
  Generation returned an RGB image with a drawn checkerboard despite requesting
  transparency. The game uses only circular crops fully inside the illustrated
  bezels; it does not display the false transparent background. The orbs show
  actual character level and learned-spell count, not invented health or mana.
- `slate-v2.png`: dark worn slate interface material, tiled behind text with a
  dark overlay to preserve readability.

## Generation prompt set

All assets requested premium gothic action-RPG artwork, painterly realistic
materials, fine surface detail, crisp small-scale readability, no lettering,
no logos, and no watermarks.

**Spell atlas:** exact five equal columns, three equal rows, no gaps or outside
margins, near-black textured cells. Flame subjects in order: erupting ring of
fire, sword sweeping a gold crescent, falling molten meteor, diving phoenix,
inferno vortex. Frost subjects: exploding ice spikes, flying ice spear, curling
wave of frozen shards, whirling snowstorm, armored ice golem. Storm subjects:
branching lightning, focused electric beam, fist striking a thunder shockwave,
electric sphere with orbiting arcs, multiple bolts from swirling storm clouds.
Orange/gold, ice/cyan, violet/electric-blue row palettes respectively.

**Relic atlas:** exact six equal columns and four equal rows, no gaps or outside
margins; each item isolated on near-black with a safe margin and complete
silhouette. Antique gold, blackened steel, gemstones, fine wear and magical
glows. Row 1: novice runeblade, charred wand, icy fang dagger, thunder rod,
moonstone crescent staff, phoenix scepter. Row 2: crystalline antler staff,
lightning staff, ember cleaver, molten meteor sword, phoenix talon blade,
fiery crown. Row 3: sun runeblade, ice spear, sea-glass sword, hail wand,
cyan crystal heart pendant, silver frosted branch. Row 4: electric dagger,
golden thunder bell, violet orbiting orb, jagged lightning sword, silver
storm runeblade, ornate ruby ring.

**HUD:** wide 3:1 front-on ornamental backing plate, large ruby orb in a
sculpted raven-wing dark iron cradle on the left, matching sapphire orb on the
right, connected by a low charcoal slate panel with tarnished bronze/gold
engraved edges. Realistic reflective faceted glass, inner clouds, worn steel
and fine gothic details. Empty central space, no text or buttons; requested
transparent space outside the silhouette. A background-extraction retry also
returned RGB, so only the safe original interior crops are used.

**Slate:** square seamless top-down material of dark charcoal weathered slate,
fine hairline cracks, mineral flecks, scuffs, bronze dust in fissures. Low
contrast, uniform ambient light; no vignette, perspective, borders, symbols,
objects, or text. Intended behind pale-gold interface text.

`regions/*.png` are real renderer captures of the three implemented regions,
used as expedition-selection thumbnails. They are not generated mockups.
