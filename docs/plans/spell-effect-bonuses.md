# Spell effect bonuses

Status: Implemented locally on 2026-09-13. All 15 boss-item bonuses are in the shared catalogue and the game renderer. See artifacts/final-evidence.md for checks.

## Aim and limits

Make boss-item spell bonuses entertaining for a six-year-old. Match the visual quality of the current character models while keeping implementation work and token use small. No fixed token budget was set.

Reuse the current spell code, materials, geometry, and animation tools. Do not add creatures, character models, or rigs. Frost Guardian uses the existing guardian. Give each bonus one clear visual change. Improve timing, light, trails, and impact shapes before adding particle count.

## Approved effects

| Spell | Bonus name | Visual effect | Combat bonus |
|---|---|---|---|
| Fire Nova | Aftershock | The first ring leaves glowing cracks. A second, tighter ring erupts from them. | +30% damage |
| Heavy Cleave | Rift Slash | A sharp crescent follows the sword, cuts through the horde, then breaks into fading embers. | +2 targets |
| Meteor | Molten Core | The meteor breaks apart before impact. Its glowing core strikes first, followed by a ring of burning fragments. | +30% damage |
| Phoenix Dive | Blazing Wake | The charge leaves a bright trail on the floor. Fire races back along it after the hero lands. | +30% damage |
| Firestorm | Volcanic Ground | Glowing cracks spread beneath enemies, then erupt in short bursts of flame and dark rock. | +2 targets |
| Frostfall | Crystal Bloom | Each impact grows a small cluster of clear ice crystals. The clusters flash and shatter together. | +30% damage |
| Ice Lance | Diamond Drill | Three narrow ice shards rotate around the spear. They burst outward at impact. | +30% damage |
| Glacial Surge | Frozen Fault | Two rows of ice rise in sequence, forming a widening path toward the horde. | +2 targets |
| Blizzard | Whiteout | A low spiral of snow gathers around enemies. Large ice shards strike through it, with brief flashes at each hit. | +30% damage |
| Frost Guardian | Glacial Hammer | Keep the existing guardian. Its slam sends a line of large ice spikes across the floor. | +2 targets |
| Chain Lightning | Thunder Web | Each struck enemy briefly connects to the next with thin branching arcs. The whole web flashes once before fading. | +2 targets |
| Arc Lance | Overcharge | Two thin beams spiral around a bright central beam. A sharp flash and expanding ring mark each impact. | +30% damage |
| Thunderclap | Resonance | Three ground rings spread at different speeds. Dust lifts behind each ring; the final ring has a bright, broken edge. | +30% damage |
| Ball Lightning | Twin Orbit | Keep the extra orb. Give the pair opposite paths, a thin lightning link, and short discharge flashes. | +30% damage |
| Tempest | Storm Pillars | Thick bolts strike in sequence. Each leaves a brief column of sparks and a glowing mark on the floor. | +2 targets |

## Suggested implementation order

Start with Aftershock, Crystal Bloom, Thunder Web, Resonance, and Twin Orbit. These can reuse much of the current effect code. Then assess the remaining effects in small groups.

Keep spell silhouettes clear at the normal game camera distance. Use controlled light, clear materials, and visible contact with enemies and the floor. Check base and bonus versions on desktop and phone. Keep the server's damage and target limits authoritative; extra visual contacts must not apply damage twice.

## Existing implementation

See [Boss treasure](../features/boss-treasure.md) for the current reward rules. The old twin-orb, meteor-shower, and split-lance save IDs now select Twin Orbit, Molten Core, and Diamond Drill. Existing item copies and saved cast receipts remain valid. Damage and target bonuses come from the server; visual fragments do not add damage. The ten-target limit remains.
