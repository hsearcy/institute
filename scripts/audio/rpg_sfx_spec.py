"""Prompts for the RPG sound effects generated with ElevenLabs.

Each entry: id -> (prompt, seconds, variants, prompt influence, kind).
kind is "sfx" (trimmed, mono), "loop" (seamless ambience, stereo) or "ui".
Variants become <id>-1.mp3, <id>-2.mp3, ...; a single variant is <id>.mp3.
"""

FX = ", fantasy action RPG sound effect, no music, no voice"

SPEC = {
    # Spell casts start with the cast clip; the release is about 0.45 s in.
    "cast-ember": ("fire nova spell: a short crackling gather of flame in a hand, then a powerful outward whoosh of a ring of fire bursting in every direction, roaring flame tail" + FX, 2.0, 1, .6, "sfx"),
    "cast-cleave": ("heavy two-handed sword swing: leather creak, then a deep powerful blade whoosh through the air with a metallic ring, no impact" + FX, 1.0, 1, .65, "sfx"),
    "cast-meteor": ("summon meteor spell: a rising magical fire roar, then a burning boulder screaming down from the sky with a descending whistle and flame rush, ending just before it lands" + FX, 2.0, 1, .6, "sfx"),
    "cast-phoenix": ("phoenix dive spell: a fiery bird screech blended into a roaring rush of flaming wings swooping fast past the listener" + FX, 2.2, 1, .55, "sfx"),
    "cast-firestorm": ("firestorm spell: a rumbling sky of fire, then several fireballs whooshing down in a rapid barrage, crackling roaring flames" + FX, 3.0, 1, .55, "sfx"),
    "cast-frost": ("frostfall spell: a crystalline shimmer of ice forming in the air, then several icicles whistling down from above, cold wind" + FX, 2.0, 1, .6, "sfx"),
    "cast-ice-lance": ("ice lance spell: a sharp crystalline crackle of ice forming, then a fast piercing whoosh of a spear of ice flying forward, glassy tail" + FX, 1.3, 1, .65, "sfx"),
    "cast-glacial-surge": ("glacial surge spell: deep grinding of ice, then a wave of jagged ice erupting along a stone floor in a rushing line, cracking and crunching" + FX, 2.0, 1, .6, "sfx"),
    "cast-blizzard": ("blizzard spell: howling icy wind rising into a swirling snowstorm, crackling frost and tinkling ice shards" + FX, 3.0, 1, .55, "sfx"),
    "cast-frost-guardian": ("summon ice golem spell: a deep magical frost hum, massive blocks of ice grinding and stacking, a heavy crystalline thud" + FX, 2.5, 1, .55, "sfx"),
    "cast-storm": ("chain lightning spell: a quick electric charge crackle in a hand, then a sharp bolt of lightning zapping and snapping between several targets, buzzing arcs" + FX, 1.8, 1, .6, "sfx"),
    "cast-arc-lance": ("arc lance spell: a rising electric whine, then a fast piercing beam of lightning zapping forward, crackling sizzle tail" + FX, 1.3, 1, .65, "sfx"),
    "cast-thunderclap": ("thunderclap spell: electric crackles building up fast with a rising hum, then a bright lightning strike from the sky" + FX, 1.6, 1, .6, "sfx"),
    "cast-ball-lightning": ("ball lightning spell: a humming crackling sphere of electricity launched forward, warbling buzzing plasma orb flying with sizzling zaps" + FX, 2.0, 1, .55, "sfx"),
    "cast-tempest": ("tempest spell: storm wind rising into a whirling cyclone, crackles of lightning inside the gusts, rolling thunder" + FX, 3.0, 1, .55, "sfx"),

    # One contact per struck enemy, by element.
    "hit-fire": ("a fireball hitting a skeleton warrior: a punchy fiery burst with a bone crack and a short flame crackle tail" + FX, .8, 3, .65, "sfx"),
    "hit-frost": ("an ice shard hitting an armored skeleton: crisp shattering ice impact with a bone crack and a glassy tinkle tail" + FX, .8, 3, .65, "sfx"),
    "hit-storm": ("a lightning bolt striking a skeleton: a sharp electric zap and snap, sizzle, bones rattling" + FX, .8, 3, .65, "sfx"),
    "hit-blade": ("a heavy sword slicing into a skeleton warrior: meaty blade impact, bones cracking, armor clang" + FX, .7, 3, .65, "sfx"),
    "hit-heavy": ("a massive killing blow on a stone golem: deep punchy impact, cracking stone and rock debris, low thump" + FX, 1.0, 2, .6, "sfx"),
    # Area spells land with one big blast.
    "blast-fire": ("a meteor slamming into the ground: huge fiery explosion, deep boom, rocks and embers scattering" + FX, 1.8, 1, .6, "sfx"),
    "blast-frost": ("a giant block of ice smashing onto a stone floor: huge crystalline shatter, deep thud, ice shards scattering" + FX, 1.6, 1, .6, "sfx"),
    "blast-storm": ("a lightning bolt striking the ground right next to the listener: huge close thunder crack with a rolling boom" + FX, 1.8, 1, .6, "sfx"),

    # The horde.
    "swing": ("a skeleton warrior swinging a rusty sword: a quick whoosh with a bony rattle" + FX, .6, 3, .65, "sfx"),
    "ward": ("a magic shield blocking a sword strike: a bright glassy energy clang with a shimmering hum ripple" + FX, .8, 3, .6, "sfx"),
    "collapse": ("a skeleton collapsing onto a stone floor: bones clattering and scattering, pieces of armor falling" + FX, 1.0, 3, .6, "sfx"),
    "alert": ("a horde of skeleton warriors noticing an intruder: a sudden bony rattle, swords scraping, one deep low war drum hit" + FX, 1.5, 1, .55, "sfx"),

    # The hero.
    "step": ("a single footstep of a leather boot on a gritty stone floor, close and dry, one step only" + FX, .5, 4, .7, "sfx"),
    "charge-ember": ("magical fire gathering in a hand: a crackling flame swelling quickly with a rising whoosh" + FX, 1.0, 1, .6, "sfx"),
    "charge-frost": ("magical frost gathering in a hand: crystals forming with a rising shimmering chime and icy hiss" + FX, 1.0, 1, .6, "sfx"),
    "charge-storm": ("electric energy gathering in a hand: rising buzzing hum with small crackling sparks" + FX, 1.0, 1, .6, "sfx"),

    # Loot and rewards.
    "soul": ("a small glowing soul orb absorbed into a hero: a soft ethereal whoosh with a gentle sparkling chime" + FX, .6, 3, .6, "sfx"),
    "relic-drop": ("a legendary item drops in an action RPG: a heavy gem thud on a stone floor, then a bright magical shimmering beam" + FX, 1.6, 1, .6, "sfx"),
    "relic-pickup": ("picking up a magical relic: a bright sparkling chime swell with a warm magical shimmer" + FX, 1.2, 1, .6, "sfx"),
    "reward": ("a reward: gold coins and gems jingling into a leather pouch with a soft sparkle" + FX, 1.0, 1, .6, "sfx"),
    "room-clear": ("a room of monsters is cleared: a short triumphant magical whoosh rising into a bright bell shimmer" + FX, 1.8, 1, .55, "sfx"),
    "level-up": ("level up: a rising magical swell into a radiant bright shimmer with ringing bell chimes" + FX, 2.5, 1, .55, "sfx"),
    "boss-defeat": ("a giant stone guardian crumbles: a massive rock collapse and deep rumble, then a bright triumphant magical shimmer" + FX, 3.0, 1, .55, "sfx"),

    # Interface.
    "ui-click": ("a small soft click of a stone and brass game menu button, subtle and short" + FX, .5, 1, .7, "ui"),
    "ui-select": ("selecting a spell in a game menu: a soft magical tick with a short sparkle" + FX, .5, 1, .7, "ui"),
    "ui-open": ("opening a leather bound book menu: a soft page flap with a gentle whoosh" + FX, .6, 1, .7, "ui"),
    "answer-correct": ("a correct answer in a children's fantasy game: two bright rising magical bell tones with sparkle" + FX, .8, 1, .65, "ui"),
    "answer-wrong": ("a gentle soft low wooden tock with a tiny airy whoosh, friendly and calm, not harsh, not a buzzer" + FX, .6, 1, .65, "ui"),

    # Seamless ambience per environment.
    "amb-vault": ("seamless underground dungeon ambience: deep cavern room tone, distant water drips, faint wind through stone corridors, occasional far torch crackle, no music, no voice", 22, 1, .45, "loop"),
    "amb-forest": ("seamless ancient forest ruins ambience: gentle wind in leaves, distant birds, insects, soft creaks of old trees, no music, no voice", 22, 1, .45, "loop"),
    "amb-coast": ("seamless rocky coast ambience: waves breaking on rocks, distant gulls, sea wind, no music, no voice", 22, 1, .45, "loop"),
    "amb-quarry": ("seamless desert canyon quarry ambience: dry wind across rocks, faint sand hiss, distant pebbles falling, no music, no voice", 22, 1, .45, "loop"),
    "amb-garden": ("seamless overgrown royal garden ambience: soft breeze, songbirds, a small fountain trickling, bees, no music, no voice", 22, 1, .45, "loop"),
}
