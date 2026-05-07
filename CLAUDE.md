# edulus.github.io

Personal GitHub Pages launch portal for Edward Kasimir. A static, no-build single page that links to separate creative web projects hosted on the same GitHub account.

## Architecture

No build step, no bundler, no dependencies. Pure HTML/CSS/JS served directly by GitHub Pages.

JS uses native ES modules (`type="module"` in index.html). Two classes:
- `Layout` ([layout.js](layout.js)) — assigns emoji icons to buttons on init
- `Animation` ([animation.js](animation.js)) — intercepts clicks, plays a scale-up/fade-out emoji animation via the Web Animations API, then navigates to the target URL

## File layout

| File | Purpose |
|------|---------|
| [index.html](index.html) | Entry point; 5 `<a class="button">` links in a pentagon layout |
| [layout.js](layout.js) | `Layout` class — button emoji assignment |
| [animation.js](animation.js) | `Animation` class — click animation + navigation |
| [layout.css](layout.css) | Pentagon flex layout and tooltip positioning |
| [animation.css](animation.css) | Body background (animated dot grid), hover effects, tooltip transitions |
| [styles.css](styles.css) | Legacy combined stylesheet (predates the layout/animation split) — kept for reference |
| [script.js](script.js) | Legacy monolithic script (predates the module split) — kept for reference |
| [index_bak.html](index_bak.html) | Backup of a previous version of index.html |

## Linked projects (in button order)

1. 👽 Close Encounters with 5 Tones
2. 🥚 Swirling Cosmic Egg
3. ✨ Space Sounds Generator
4. 🌀 Ethereal Chord Generator
5. 🔊 YouTube Audio Extractor

All link to `https://edulus.github.io/<repo-name>/`.

## Visual design

- Dark background (`#222`) with an animated dual-layer radial-gradient dot grid (`pulseGlow` keyframe, 3s loop)
- Buttons are 125×125px dark tiles (`#333`) with white borders and 48px emoji
- Hover reveals a cyan radial glow behind the button and a Montserrat tooltip below it
- Click triggers a 350ms emoji zoom-out animation before navigation
- Font: Google Fonts Montserrat (400, 700)

## Notes

- `styles.css` duplicates the content now split across `layout.css` and `animation.css`. It is not referenced by `index.html` and can be deleted once confirmed unused.
- `script.js` is the pre-module equivalent of `layout.js` + `animation.js` combined. Also not referenced by `index.html`.
- The pentagon layout is achieved with CSS `order` and manual `width`/`margin` overrides per wrapper ID — there is no grid or absolute positioning.
