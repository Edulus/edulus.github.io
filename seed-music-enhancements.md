# Seed Music — optional enhancements

Working list of *musicality*-focused enhancements for the seed-music panel ([seed-music.js](seed-music.js)). Shareability (URL deep-links, copy-as-link, favorites) is intentionally out of scope here.

Status: first slice landed (see **Landed** below). Remaining items still up for grabs.

---

## Landed

- **#1 Sustain** — `note length` slider in the panel. Implemented via the *envelope-on-top* shape: [mesh-audio.js:220-249](mesh-audio.js#L220-L249) now accepts an optional `sustainSec`; the sequencer passes `eighthSec × noteLengthFrac`. Range 0.1×–3.0× (staccato → legato overlap).
- **#5 Bass voice** — `bass voice` checkbox in the panel. When on, schedules `noteForSlot(0, 4)` every 8 eighth-notes with a sustain matching the loop length × note-length-frac, fed through `mesh.sequencerPlay`. See [seed-music.js](seed-music.js) `scheduleStep`.
- **#7 Density** — `rests` slider replaces the hardcoded `0.20` rest probability.
- **#8 Stepwise-vs-leap bias** — `stepwise` slider drives `pickNextSlot`'s threshold; the small-leap band is proportionally derived from it.
- **#16 Final-note resolution** *(lightweight variant)* — every `phraseLength` (default 16) steps, the slot is forced to `0` (tonic) and any rest is suppressed. A simpler version of the originally-described idea that didn't need loop length (#3) to land first.
- **#17 Cancel pending `exciteAt` timeouts on stop** — `stop()` now `clearTimeout`s every pending visual-pulse handle.
- **#18 Seed first-note prevSlot/prevBand from PRNG** — initial values are drawn from the PRNG instead of the `4/2` defaults. Side effect: existing seed strings now produce different opening notes than before (still deterministic from the seed, just shifted).

---

## Headline ideas (remaining)

### 2. Phrase form (A-B-A or A-A-B-A)

Instead of an endless stream, generate a finite A phrase, a contrasting B phrase, and arrange them. Same seed, but the listener hears repetition → "song."

- Cheap to implement: pre-generate N notes from the PRNG into an array, then iterate a fixed pattern of indices (e.g. `[A, A, B, A]`).
- Probably the single biggest perceived-quality jump for the least code.
- Could expose a "form" dropdown: `endless wander | A-A-B-A | A-B-A-B`.

### 3. Loop length toggle

Closely related to #2: a "loop length" control (e.g. 16 / 32 / 64 notes, or `∞`). When finite, the same N notes loop forever; when `∞`, current behavior.

- Gives the brain something to latch onto.
- Plays well with sustain (#1): a slow, sustained 16-note loop becomes a meditative cell.

### 4. Light percussion layer

A second voice that ticks on every beat (or every other beat) with a noise-burst or short blip, driven from the same PRNG.

- Same one-input shareability, more body.
- The PRNG can decide accents (e.g. "hi-hat on every 8th, accent the downbeat 80% of the time").
- Could be a checkbox: `[ ] add pulse`.

### 6. Swing

Delay the off-eighth by 55–65% of a beat instead of 50%.

- Humanizes without breaking determinism, as long as the swing amount is either fixed or seeded.
- One-line change in the tick scheduler.

---

## Expose the magic numbers

These are values currently hardcoded in [seed-music.js](seed-music.js). Turning each into a slider gives the same seed multiple "moods." (#7 density and #8 leap bias already landed — see **Landed**.)

### 9. Octave-band stickiness

Currently `0.70` chance to stay in the same band at [seed-music.js:355](seed-music.js#L355). Slider would range from "fixed register" (high) to "wide-ranging" (low).

### 10. Seeded-BPM range

Today the seed picks a BPM in `72..140` ([seed-music.js:319](seed-music.js#L319)) but the user can override to `40..220`. Worth surfacing the seeded BPM more visibly (e.g. a small "seeded: 112" label next to the BPM field) so the user knows what's seed-derived vs hand-tuned.

---

## Integration with the rest of the app

### 11. Verify / advertise live tonal-panel awareness

The sequencer calls `mesh.noteForSlot()`, so key/scale/octave changes from the tonal panel ([tuner.js](tuner.js), `?tune=4`) should flow through live. Worth confirming, and if so, saying so in the tooltip ("change key / scale live from the tonal panel while playing").

### 12. Sequencer-driven color wave

Each note already calls `bg.exciteAt` ([seed-music.js:379](seed-music.js#L379)). Could optionally also call `bg.setKeyColor` so the dot-grid hue tracks the running melody, not just user clicks.

### 13. Per-note instrument variation

Today every note uses the currently-selected instrument. With seed-driven probabilities you could occasionally swap (e.g. 10% of notes use a "harmonic" voice). Risk: muddies the timbre. Probably only worth it as an opt-in toggle.

---

## Smaller musicality wins

### 14. Variable note lengths

Currently rigid 8ths. The PRNG could occasionally tie two 8ths into a quarter, or split one into two 16ths. Combine with sustain (#1) for real rhythmic variety.

### 15. Pickup-note probability

A small chance the very first note of a phrase is silenced (anacrusis behavior) so phrases don't always start on the downbeat.

### 16. Stronger final-note resolution

Already landed in a lightweight form (force slot 0 every `phraseLength` steps). A "full" version would: bias the *band* toward the prevailing register too, optionally lengthen the resolution note's sustain, and only kick in when loop length (#3) is finite so the resolution genuinely marks an ending. Worth revisiting once #3 lands.

---

## Suggested next slice

Now that #1, #5, #7, #8, #16, #17, #18 have landed, the highest musicality-per-LOC return for the next round is roughly:

1. **#2 phrase form + #3 loop length** — together turn this from "infinite procedural noodle" into "a song that loops." Biggest perceived jump remaining.
2. **#6 swing** — one-line tick scheduler change; instantly humanizes the rigid 8ths.
3. **#9 octave-band stickiness** — same "expose the magic number" pattern as #7/#8, low effort.
4. **#4 percussion layer** — combined with bass (already landed), gives a full rhythm-section feel.
5. **#11 verify live tonal-panel awareness** — mostly testing + a tooltip line.

Everything else can wait.
