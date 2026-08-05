# edulus.github.io

Personal GitHub Pages launch portal for Edward Kasimir. A static, no-build single page that links to separate creative web projects hosted on the same GitHub account.

## Architecture

No build step, no bundler, no dependencies. Pure HTML/CSS/JS served directly by GitHub Pages.

Scripts are loaded as plain `<script>` tags from [index.html](index.html) (not ES modules) and wire themselves together in an inline `DOMContentLoaded` handler. Two broad groupings:

**Launch portal (the visible button ring)**
- `Layout` ([layout.js](layout.js)) — assigns emoji icons to buttons and scales the container responsively
- `Animation` ([animation.js](animation.js)) — intercepts plain left-clicks, plays a scale-up/fade-out emoji animation, then navigates (modified clicks — ctrl/cmd/shift — pass through to the browser)

**Ambient musical mesh / tuner system** (built on top of the portal — the page background is interactive)
- [mesh-audio.js](mesh-audio.js) — `MusicalMesh`: WebAudio synthesis triggered by clicks on the dot grid
- [background.js](background.js) — `BackgroundField`: the animated dot-grid canvas, key-color flashes, wave animation
- [instrument-mixes.js](instrument-mixes.js) — instrument timbre presets used by the mesh
- [tuner.js](tuner.js) — `Tuner` panels (halo / pip / sound / tonal / color / instrument), deep-linkable via `?tune=1..6`
- [seed-music.js](seed-music.js) — `SeedSequencer`, registered alongside the tuners (`?tune=7`); its DELUXE toggle swaps in a two-voice measure-based generator (seeded key/mode, shuffled rhythm patterns, treble chords + bass line, reverb) modeled on codepen.io/jak_e/pen/EKRarY
- [controls.js](controls.js) — `ControlBar` (left/right edge bars), `InstrumentSelector` bottom strip

## File layout

| File | Purpose |
|------|---------|
| [index.html](index.html) | Entry point; 9 `<a class="button">` links + the inline bootstrap that wires the mesh, tuners, and control bars |
| [layout.js](layout.js) | `Layout` class — button emoji assignment + responsive container scaling (`zoom`, divides by the 540px container size) |
| [animation.js](animation.js) | `Animation` class — click animation + navigation |
| [layout.css](layout.css) | Ring geometry (absolute-positioned wrappers), tile/tooltip base styles |
| [animation.css](animation.css) | Body/viewport setup, hover + focus effects, tooltip transitions, invite-pulse keyframes, reduced-motion + small-screen media queries |
| [mesh-audio.js](mesh-audio.js), [background.js](background.js), [instrument-mixes.js](instrument-mixes.js), [tuner.js](tuner.js), [seed-music.js](seed-music.js), [controls.js](controls.js) | Interactive musical-mesh layer (see Architecture) |
| [icons/](icons/) | Local image assets: instrument icons (`saw.png`, `tabla.png`, `kalimba.png`) + the camp tile logo (`camp-logo.png`) |
| [ARCHIVE/](ARCHIVE/) | Pre-split legacy files (`styles.css`, `script.js`, `index_bak.html`) — nothing references them |

## Linked projects (in button order)

Ring layout: button 1 is the centre; 2–9 ring it clockwise from the top.

1. 👽 Close Encounters with 5 Tones — `Close-Encounters-with-5-Tones/` (centre)
2. 🥚 Swirling Cosmic Egg — `Swirling-Cosmic-Egg/` (top)
3. ✨ Space Sounds Generator — `Space-Sounds-Generator/` (top-right)
4. 🌀 Ethereal Chord Generator — `Ethereal_Chord_Generator/` (right)
5. 🔊 YouTube Audio Extractor — github.com repo link (`https://github.com/Edulus/YT-Audio-Extractor`), not a Pages site (bottom-right)
6. 🏓 Space Pong — `space-pong/` (bottom)
7. 🏕️ Camp Location Chooser — `camp-location-chooser/` (bottom-left; uses `icons/camp-logo.png` as an `<img>` instead of an emoji — its slot in [layout.js](layout.js) is `null`)
8. 📡 Icecast Now-Playing — github.com repo link (`https://github.com/Edulus/icecast-nowplaying-spotify-youtube-metadata`) (left)
9. 📻 Telos FM — `https://telosfm.com` (external site) (top-left)

Buttons 5 and 8 link to github.com repos and 9 to an external domain; the rest follow the `https://edulus.github.io/<repo-name>/` pattern.

## Visual design

- Dark background (`#222`) with an interactive canvas dot field (halo + pip layers) that doubles as a musical instrument
- Buttons are 125×125px dark tiles (`#333`) with white borders and 64px emoji (or an `<img>` for #7), absolutely positioned in a 540×540 container: centre + ring of 8 at R=200 (geometry derivation commented at the top of [layout.css](layout.css))
- Hover **and keyboard focus** reveal a cyan radial glow behind the button and a Montserrat tooltip below it; every `<a>` carries an `aria-label`
- Click triggers a 350ms emoji zoom-out animation before navigation
- Font: Google Fonts Montserrat (400, 700); emoji-rocket SVG favicon inlined as a data URI

## Notes

- The container is scaled with CSS `zoom` in `Layout.scaleContainer()`; the `/ 540` divisor there must track `.container`'s width/height in [layout.css](layout.css).
- On height-constrained viewports the bottom tile can overlap the 60px instrument strip by design — the strip sits at `z-index: 0`, below the tiles (`z: 1`), so tile clicks always win.
- Click-to-retune-the-mesh is opt-out: the inline handler in [index.html](index.html) skips clicks inside `.button`, `.instrument-slot`, `.control-slot`, and `.tuner-panel`, so portal navigation never accidentally retunes the audio.
- The page loads muted; audio starts only via the breathing sound toggle in the left control bar. Picking instruments, seeds, or panels never unmutes on its own.
- Tuner/seed panels are positioned inline by their JS; the small-screen scroll guard for them lives in [animation.css](animation.css) (`.tuner-panel` media query) because inline `overflow` would clip the hover tooltips that float outside the panels.
