# edulus.github.io

Personal GitHub Pages launch portal for Edward Kasimir. A static, no-build single page that links to separate creative web projects hosted on the same GitHub account.

## Architecture

No build step, no bundler, no dependencies. Pure HTML/CSS/JS served directly by GitHub Pages.

Scripts are loaded as plain `<script>` tags from [index.html](index.html) (not ES modules) and wire themselves together in an inline `DOMContentLoaded` handler. Two broad groupings:

**Launch portal (the visible button grid)**
- `Layout` ([layout.js](layout.js)) — assigns emoji icons to buttons and scales the container responsively
- `Animation` ([animation.js](animation.js)) — intercepts clicks, plays a scale-up/fade-out emoji animation, then navigates

**Ambient musical mesh / tuner system** (built on top of the portal — the page background is interactive)
- [mesh-audio.js](mesh-audio.js) — `MusicalMesh`: WebAudio synthesis triggered by clicks on the dot grid
- [background.js](background.js) — `BackgroundField`: the animated dot-grid canvas, key-color flashes, wave animation
- [instrument-mixes.js](instrument-mixes.js) — instrument timbre presets used by the mesh
- [tuner.js](tuner.js) — `Tuner` panels (halo / pip / sound / tonal / color / instrument), deep-linkable via `?tune=1..6`
- [seed-music.js](seed-music.js) — `SeedSequencer`, registered alongside the tuners (`?tune=7`)
- [controls.js](controls.js) — `ControlBar` (left/right edge bars), `InstrumentSelector` bottom strip

## File layout

| File | Purpose |
|------|---------|
| [index.html](index.html) | Entry point; 7 `<a class="button">` links + the inline bootstrap that wires the mesh, tuners, and control bars |
| [layout.js](layout.js) | `Layout` class — button emoji assignment + responsive container scaling |
| [animation.js](animation.js) | `Animation` class — click animation + navigation |
| [layout.css](layout.css) | Button cluster flex layout and tooltip positioning |
| [animation.css](animation.css) | Body background (animated dot grid), hover effects, tooltip transitions |
| [mesh-audio.js](mesh-audio.js), [background.js](background.js), [instrument-mixes.js](instrument-mixes.js), [tuner.js](tuner.js), [seed-music.js](seed-music.js), [controls.js](controls.js) | Interactive musical-mesh layer (see Architecture) |
| [styles.css](styles.css) | Legacy combined stylesheet (predates the layout/animation split) — not referenced by `index.html` |
| [script.js](script.js) | Legacy monolithic script (predates the module split) — not referenced by `index.html` |
| [index_bak.html](index_bak.html) | Backup of a previous version of index.html |

## Linked projects (in button order)

1. 👽 Close Encounters with 5 Tones — `Close-Encounters-with-5-Tones/`
2. 🥚 Swirling Cosmic Egg — `Swirling-Cosmic-Egg/`
3. ✨ Space Sounds Generator — `Space-Sounds-Generator/`
4. 🌀 Ethereal Chord Generator — `Ethereal_Chord_Generator/`
5. 🔊 YouTube Audio Extractor — links to the github.com repo (`https://github.com/Edulus/YT-Audio-Extractor`), not a Pages site; the only button that breaks the `edulus.github.io/<repo>/` pattern
6. 🏓 Space Pong — `space-pong/`
7. 🏕️ Camp Location Chooser — `camp-location-chooser/` (uses an `<img>` logo instead of an emoji; its emoji slot in [layout.js](layout.js) is `null`)

All link to `https://edulus.github.io/<repo-name>/`.

## Visual design

- Dark background (`#222`) with an animated dual-layer radial-gradient dot grid (`pulseGlow` keyframe, 3s loop)
- Buttons are 125×125px dark tiles (`#333`) with white borders and 48px emoji (or an `<img>` for #7)
- Hover reveals a cyan radial glow behind the button and a Montserrat tooltip below it
- Click triggers a 350ms emoji zoom-out animation before navigation
- Font: Google Fonts Montserrat (400, 700)

## Notes

- `styles.css` duplicates the content now split across `layout.css` and `animation.css`. It is not referenced by `index.html` and can be deleted once confirmed unused.
- `script.js` is the pre-split equivalent of `layout.js` + `animation.js` combined. Also not referenced by `index.html`.
- The button cluster is achieved with CSS `order` and manual `width`/`margin` overrides per wrapper ID — there is no grid or absolute positioning.
- Click-to-retune-the-mesh is opt-out: the inline handler in [index.html](index.html) skips clicks inside `.button`, `.instrument-slot`, `.control-slot`, and `.tuner-panel`, so portal navigation never accidentally retunes the audio.
