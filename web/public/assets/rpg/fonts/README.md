# Locally bundled RPG fonts

The game loads **Cinzel** and **DM Sans**, normal style, weights **400–700**, from
the two local Latin-subset variable WOFF2 files in this directory. These are the
same font families and weights previously requested by `web/src/rpg/rpg.css` from
Google Fonts. The font binaries are unmodified upstream downloads.

Retrieved 2026-09-05 from the official Google Fonts CSS API:

<https://fonts.googleapis.com/css2?family=Cinzel:wght@400..700&family=DM+Sans:wght@400..700&display=swap>

`upstream.css` preserves the API response. Only its two `/* latin */` blocks are
used by the game. `manifest.json` records exact font download URLs, byte lengths,
and SHA-256 hashes. The stylesheet preserves Google's normal style, variable
weight range, `font-display: swap`, and Latin Unicode ranges, with local URLs.

Both fonts are distributed under the **SIL Open Font License 1.1**. Full upstream
copyright notices and license terms are included unchanged:

- [Cinzel-OFL.txt](Cinzel-OFL.txt), retrieved from
  <https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt>
- [DM-Sans-OFL.txt](DM-Sans-OFL.txt), retrieved from
  <https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt>

Validation checked that both files are nonempty WOFF2 binaries and that their
WOFF2 header lengths match their on-disk lengths. Combined font transfer size is
62,836 bytes. No Google Fonts requests are needed at runtime.
