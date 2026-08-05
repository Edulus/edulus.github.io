// seed-music.js — seeded procedural sequencer that drives MusicalMesh.
// A string seed feeds a deterministic xorshift32 PRNG which picks a BPM
// then emits an 8th-note melody from MusicalMesh's pentatonic slots.
// Each note also pulses the matching dots via BackgroundField.exciteAt
// so the canvas dances in lockstep with the audio.
//
// DELUXE mode (toggle in the panel) swaps the single-voice melody engine
// for a measure-based two-voice generator modeled on jak_e's
// "Procedurally Generated Music" pen (codepen.io/jak_e/pen/EKRarY):
//   - the seed picks a root key and major/minor mode (mesh is retuned to
//     that diatonic scale while playing, restored on stop)
//   - every measure, each clef draws a rhythm pattern from a fixed
//     length-sequence library and shuffles it
//   - treble stacks 1-3 note chords with an adjacency-rejection rule
//     (no two chord tones on neighboring scale degrees); bass walks its
//     own independent single-note line two octaves down
//   - each clef runs on a child PRNG derived from the main seed stream,
//     so the voices diverge but the whole song stays seed-deterministic
//   - a convolution reverb (mesh.reverbWet) opens up while playing for
//     the lush hall blend the original got from Freeverb
//
// The seed-music slot lives in the left (audio) ControlBar. Clicking it
// opens this panel; SeedSequencer exposes the same show/hide/toggle/
// isVisible surface as Tuner so the bar's openTuner() can swap it with
// any other panel and only one panel is ever visible at a time.

class SeedSequencer {
  // DELUXE rhythm library — note-length patterns that each fill one 4/4
  // measure on an 8th-note grid (len n = one 1/n note = 8/n grid steps).
  // Taken verbatim from the CodePen's _genLengthSequences().
  static DELUXE_LEN_SEQS = [
    [1],
    [2, 2],
    [2, 4, 4],
    [2, 4, 8, 8],
    [4, 4, 4, 4],
    [2, 8, 8, 8, 8],
    [4, 4, 4, 8, 8],
    [8, 8, 8, 8, 8, 8, 8, 8],
  ];

  constructor(mesh, bg) {
    this.mesh = mesh;
    this.bg = bg;
    this.playing = false;
    this.intervalId = null;
    this.nextNoteTime = 0;
    this.eighthSec = 0.25;
    this.bpm = 100;
    this.prng = null;
    // Melodic memory — the stepwise-motion bias references the prior note.
    this.prevSlot = 4;
    this.prevBand = 2;
    this.lookaheadSec = 0.1;
    this.tickMs = 50;
    this.visible = false;
    // Musicality controls — exposed as sliders in the panel.
    // noteLengthFrac multiplies eighthSec to get per-note sustain: 1.0 =
    // one eighth, 0.25 = staccato, 2.0 = legato overlap.
    this.noteLengthFrac = 1.0;
    // Rest probability (was hardcoded 0.20).
    this.density = 0.20;
    // Stepwise-vs-leap threshold (was hardcoded 0.60). Higher = more
    // stepwise motion; lower = jumpier melody.
    this.leapBias = 0.60;
    // Bass voice: a slow root drone on the lowest octave, on every
    // bassEveryNSteps eighth-note (8 = once per 4/4 measure of eighths).
    this.bassEnabled = false;
    this.bassEveryNSteps = 8;
    // Final-note resolution: every phraseLength steps, force the slot
    // toward the scale tonic so phrases periodically "land."
    this.phraseLength = 16;
    this.stepCount = 0;
    // DELUXE mode state. deluxeNotes is the playable pitch table (7
    // diatonic degrees × octaves 2..5); deluxeSteps is the queue of
    // pending 8th-note steps, refilled one generated measure at a time.
    // savedTonal holds the mesh's scale/root so stop() can restore
    // whatever the user had tuned before deluxe took the keys.
    this.deluxe = false;
    this.deluxeNotes = [];
    this.deluxeSteps = [];
    this.savedTonal = null;
    this.deluxeReverbOn = false;
    // Tracks visual-pulse timeouts so stop() can cancel pending flashes
    // instead of relying on the `if (this.playing)` guard inside them.
    this.pendingTimeouts = [];
    // Wired in index.html — fires on play/stop transitions so the
    // ControlBar can keep the 🌱 slot icon lit while the sequencer
    // runs, signaling where the stop control is.
    this.onPlayingChange = null;
    this.build();
  }

  // djb2 → uint32; xorshift32 closure. Same seed string → identical sequence.
  static hash(str) {
    let h = 5381 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    }
    return h || 1; // xorshift collapses to zero if seeded with zero
  }

  makePrng(seed) {
    let state = SeedSequencer.hash(seed);
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;  state >>>= 0;
      return state / 4294967296;
    };
  }

  build() {
    // Panel styling mirrors tuner.js so opening seed feels like opening
    // any other left-side panel — same blur, padding, accent stripe.
    const panel = document.createElement("div");
    this.panel = panel;
    panel.className = "tuner-panel";
    panel.dataset.set = "seed";
    panel.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:80px",
      "z-index:9999",
      "background:rgba(18,20,28,0.88)",
      "color:#fff",
      "font:12px/1.4 Montserrat,sans-serif",
      "padding:12px 14px 10px",
      "border-radius:8px",
      "border-left:3px solid #6ec96e",
      "min-width:240px",
      "box-shadow:0 6px 24px rgba(0,0,0,0.45)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "user-select:none",
      "display:none",
    ].join(";");

    // Title row with hover tooltip.
    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "position:relative;cursor:help;margin-bottom:10px";
    const title = document.createElement("div");
    title.textContent = "Seed Music";
    title.style.cssText =
      "font-weight:700;letter-spacing:0.06em;font-size:11px;text-transform:uppercase;color:#6ec96e";
    const tooltip = document.createElement("div");
    tooltip.textContent =
      "A seed is any text you choose — letters, numbers, words, any length — that locks in one specific melody. Type something and press play; the same seed always produces the same tune. Leave it blank to get a random seed. BPM is adjustable.";
    tooltip.style.cssText = [
      "position:absolute",
      "top:0",
      "left:calc(100% + 12px)",
      "width:220px",
      "padding:8px 10px",
      "background:rgba(18,20,28,0.95)",
      "color:#fff",
      "font:11px/1.45 Montserrat,sans-serif",
      "border-radius:6px",
      "border-left:2px solid #6ec96e",
      "opacity:0",
      "pointer-events:none",
      "transition:opacity 0.25s",
      "letter-spacing:0",
      "text-transform:none",
      "font-weight:400",
      "z-index:10000",
    ].join(";");
    titleWrap.addEventListener("mouseenter", () => (tooltip.style.opacity = "1"));
    titleWrap.addEventListener("mouseleave", () => (tooltip.style.opacity = "0"));
    titleWrap.append(title, tooltip);

    // seedLabel + input share a wrapper so the per-setting tooltip can
    // anchor to the wrapper (full panel width) while only the label gets
    // the cursor:help affordance.
    const seedWrap = document.createElement("div");
    seedWrap.style.cssText = "margin-bottom:8px";
    const seedLabel = document.createElement("div");
    seedLabel.textContent = "seed";
    seedLabel.style.cssText =
      "margin-bottom:4px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:10px;color:#aaa";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "seed";
    input.style.cssText = [
      "width:100%",
      "box-sizing:border-box",
      "padding:5px 7px",
      "background:rgba(255,255,255,0.08)",
      "color:#fff",
      "border:1px solid rgba(255,255,255,0.15)",
      "border-radius:6px",
      "font:13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "outline:none",
    ].join(";");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.startPressed(); }
    });
    seedWrap.append(seedLabel, input);

    const bpmRow = document.createElement("div");
    bpmRow.style.cssText =
      "display:flex;align-items:center;gap:6px;justify-content:space-between;margin-bottom:8px";
    const bpmLabel = document.createElement("div");
    bpmLabel.textContent = "bpm";
    bpmLabel.style.cssText =
      "font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:10px;color:#aaa";

    // Field: [ 123          ▲ ]
    //                       ▼
    // Number sits left, custom triangle stepper sits flush against the
    // right edge with a small divider — keeps the digit area visually
    // separate from the controls.
    const bpmField = document.createElement("div");
    bpmField.style.cssText = [
      "display:flex",
      "align-items:stretch",
      "width:88px",
      "height:24px",
      "background:rgba(255,255,255,0.08)",
      "border:1px solid rgba(255,255,255,0.15)",
      "border-radius:6px",
      "overflow:hidden",
      "box-sizing:border-box",
    ].join(";");

    const bpmInput = document.createElement("input");
    bpmInput.type = "text";
    bpmInput.inputMode = "numeric";
    bpmInput.placeholder = "—";
    bpmInput.style.cssText = [
      "flex:1",
      "min-width:0",
      "padding:0 8px",
      "background:transparent",
      "color:#fff",
      "border:none",
      "font:12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      "text-align:left",
      "outline:none",
    ].join(";");

    const stepper = document.createElement("div");
    stepper.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "width:18px",
      "border-left:1px solid rgba(255,255,255,0.12)",
      "flex:none",
    ].join(";");

    const applyBpm = () => {
      const v = parseInt(bpmInput.value, 10);
      if (!Number.isFinite(v) || v < 40 || v > 220) {
        bpmInput.value = this.bpm;
        return;
      }
      this.bpm = v;
      this.eighthSec = (60 / this.bpm) / 2;
      bpmInput.value = v;
    };
    const stepBpm = (delta) => {
      const cur = parseInt(bpmInput.value, 10);
      const start = Number.isFinite(cur) ? cur : this.bpm;
      bpmInput.value = Math.max(40, Math.min(220, start + delta));
      applyBpm();
    };
    // Small white triangle buttons drawn with CSS borders so they render
    // identically across platforms (avoids the ▲ ▼ glyphs picking up an
    // emoji font on some systems).
    const makeStepBtn = (direction) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", direction === "up" ? "Increase BPM" : "Decrease BPM");
      b.style.cssText = [
        "flex:1",
        "background:transparent",
        "border:none",
        "padding:0",
        "margin:0",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "opacity:0.75",
        "transition:opacity 0.15s,background-color 0.15s",
      ].join(";");
      const tri = document.createElement("span");
      tri.style.cssText = [
        "display:block",
        "width:0",
        "height:0",
        "border-left:4px solid transparent",
        "border-right:4px solid transparent",
        direction === "up"
          ? "border-bottom:5px solid #fff"
          : "border-top:5px solid #fff",
      ].join(";");
      b.appendChild(tri);
      b.addEventListener("mouseenter", () => {
        b.style.opacity = "1";
        b.style.backgroundColor = "rgba(255,255,255,0.08)";
      });
      b.addEventListener("mouseleave", () => {
        b.style.opacity = "0.75";
        b.style.backgroundColor = "transparent";
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        stepBpm(direction === "up" ? 1 : -1);
      });
      return b;
    };
    const upBtn = makeStepBtn("up");
    const downBtn = makeStepBtn("down");
    upBtn.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

    bpmInput.addEventListener("change", applyBpm);
    bpmInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter")          { e.preventDefault(); applyBpm(); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); stepBpm(1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); stepBpm(-1); }
    });
    stepper.append(upBtn, downBtn);
    bpmField.append(bpmInput, stepper);
    bpmRow.append(bpmLabel, bpmField);

    // Slider row helper — mirrors tuner.js layout (label + value on top,
    // full-width range slider below). Returns { row, slider, valueEl, labelRow }.
    const ACCENT = "#6ec96e";
    const makeSliderRow = (labelText, min, max, step, initial, format) => {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:8px";
      const labelRow = document.createElement("div");
      labelRow.style.cssText =
        "display:flex;justify-content:space-between;margin-bottom:2px;" +
        "font-weight:700;letter-spacing:0.04em;text-transform:uppercase;" +
        "font-size:10px;color:#aaa";
      const label = document.createElement("span");
      label.textContent = labelText;
      const valueEl = document.createElement("span");
      valueEl.style.cssText = `color:${ACCENT};font-variant-numeric:tabular-nums;text-transform:none`;
      labelRow.append(label, valueEl);
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = min;
      slider.max = max;
      slider.step = step;
      slider.value = initial;
      slider.style.cssText = `width:100%;accent-color:${ACCENT};display:block;margin:0`;
      const writeValue = () => { valueEl.textContent = format(parseFloat(slider.value)); };
      writeValue();
      slider.addEventListener("input", writeValue);
      row.append(labelRow, slider);
      return { row, slider, valueEl, labelRow };
    };

    // Per-setting tooltip — slides in to the right of the panel on hover.
    // Matches the title tooltip style. `host` is the row used for absolute
    // positioning (it gets position:relative); `hoverEl` is where the
    // cursor:help applies and mouseenter/leave fire. Splitting these lets
    // us put cursor:help on the small label without forcing it onto the
    // slider, where it would override the natural grab cursor.
    const addTooltip = (host, hoverEl, text) => {
      host.style.position = "relative";
      hoverEl.style.cursor = "help";
      const tip = document.createElement("div");
      tip.textContent = text;
      tip.style.cssText = [
        "position:absolute",
        "top:0",
        "left:calc(100% + 12px)",
        "width:220px",
        "padding:8px 10px",
        "background:rgba(18,20,28,0.95)",
        "color:#fff",
        "font:11px/1.45 Montserrat,sans-serif",
        "border-radius:6px",
        "border-left:2px solid #6ec96e",
        "opacity:0",
        "pointer-events:none",
        "transition:opacity 0.25s",
        "letter-spacing:0",
        "text-transform:none",
        "font-weight:400",
        "z-index:10000",
      ].join(";");
      host.appendChild(tip);
      hoverEl.addEventListener("mouseenter", () => (tip.style.opacity = "1"));
      hoverEl.addEventListener("mouseleave", () => (tip.style.opacity = "0"));
    };

    // Note length: how long each note rings, as a fraction of one 8th.
    // 0.25 = staccato, 1.0 = exactly one 8th, 2.0 = legato overlap.
    const sustain = makeSliderRow(
      "note length", 0.1, 3.0, 0.05, this.noteLengthFrac,
      (v) => `${v.toFixed(2)}×`
    );
    sustain.slider.addEventListener("input", () => {
      this.noteLengthFrac = parseFloat(sustain.slider.value);
    });

    // Density: rest probability per step. Higher = sparser melody.
    const density = makeSliderRow(
      "rests", 0.0, 0.6, 0.01, this.density,
      (v) => `${Math.round(v * 100)}%`
    );
    density.slider.addEventListener("input", () => {
      this.density = parseFloat(density.slider.value);
    });

    // Leap bias: probability the next note is one scale-step away.
    // Higher = calmer / stepwise; lower = jumpier melody.
    const leap = makeSliderRow(
      "stepwise", 0.1, 0.95, 0.01, this.leapBias,
      (v) => `${Math.round(v * 100)}%`
    );
    leap.slider.addEventListener("input", () => {
      this.leapBias = parseFloat(leap.slider.value);
    });

    // Bass voice toggle.
    const bassRow = document.createElement("label");
    bassRow.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "margin-bottom:10px",
      "cursor:pointer",
      "font-weight:700",
      "letter-spacing:0.04em",
      "text-transform:uppercase",
      "font-size:10px",
      "color:#aaa",
    ].join(";");
    const bassBox = document.createElement("input");
    bassBox.type = "checkbox";
    bassBox.checked = this.bassEnabled;
    bassBox.style.accentColor = ACCENT;
    bassBox.addEventListener("change", () => {
      this.bassEnabled = bassBox.checked;
    });
    const bassLabel = document.createElement("span");
    bassLabel.textContent = "bass voice";
    bassRow.append(bassBox, bassLabel);

    // DELUXE toggle — gold accent to set it apart from the green panel
    // chrome. Sits directly under the title; flipping it while playing
    // restarts the same seed in the new engine.
    const DELUXE_GOLD = "#e9c46a";
    const deluxeRow = document.createElement("label");
    deluxeRow.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "margin-bottom:10px",
      "cursor:pointer",
      "font-weight:700",
      "letter-spacing:0.08em",
      "text-transform:uppercase",
      "font-size:10px",
      `color:${DELUXE_GOLD}`,
    ].join(";");
    const deluxeBox = document.createElement("input");
    deluxeBox.type = "checkbox";
    deluxeBox.checked = this.deluxe;
    deluxeBox.style.accentColor = DELUXE_GOLD;
    const deluxeLabel = document.createElement("span");
    deluxeLabel.textContent = "✨ deluxe";
    // inline-block so the throb's scale transform applies (transforms are
    // ignored on plain inline elements); origin left keeps it beside the box.
    deluxeLabel.style.cssText = "display:inline-block;transform-origin:left center";
    deluxeRow.append(deluxeBox, deluxeLabel);
    // Deluxe generates its own rhythms, chords, and bass clef, so the
    // melodic-contour and drone controls don't apply — dim them. Also
    // drives the gold throb (animation.css @keyframes deluxeThrob): the
    // label glows and pulses while deluxe is OFF to invite the click,
    // then settles once it's enabled — same "breathe until used" idiom as
    // the mute button.
    const applyDeluxeDim = () => {
      for (const el of [leap.row, bassRow]) {
        el.style.opacity = this.deluxe ? "0.35" : "1";
        el.style.pointerEvents = this.deluxe ? "none" : "auto";
      }
      deluxeLabel.style.animation = this.deluxe
        ? "none"
        : "deluxeThrob 2.8s ease-in-out infinite";
    };
    applyDeluxeDim();
    deluxeBox.addEventListener("change", () => {
      this.deluxe = deluxeBox.checked;
      applyDeluxeDim();
      if (this.playing) {
        const seed = this.input.value.trim();
        if (seed) this.startWithSeed(seed);
        else this.stop();
      }
    });

    const btn = document.createElement("button");
    btn.textContent = "▶";
    btn.style.cssText = [
      "cursor:pointer",
      "padding:5px 12px",
      "background:rgba(110,201,110,0.18)",
      "color:#fff",
      "border:1px solid #6ec96e",
      "border-radius:6px",
      "font:15px/1 Montserrat,sans-serif",
    ].join(";");
    btn.addEventListener("click", () => this.playToggle());

    // Per-setting hover tooltips. Anchor on each row (or wrapper); the
    // hover target is the label only, so the slider's grab cursor is
    // preserved.
    addTooltip(seedWrap, seedLabel,
      "Any text — letters, numbers, words, any length. Locks in one specific melody; the same seed always plays the same tune. Leave blank for a random seed.");
    addTooltip(bpmRow, bpmLabel,
      "Beats per minute. The seed picks a starting tempo between 72 and 140; you can override anywhere from 40 to 220.");
    addTooltip(sustain.row, sustain.labelRow,
      "How long each note rings, as a fraction of one 8th note. 0.25× is staccato; 1.0× is exactly one beat; above 1.0× notes overlap into a legato wash.");
    addTooltip(density.row, density.labelRow,
      "Probability that any given step is silent instead of playing a note. Higher = sparser melody with more breathing room between notes.");
    addTooltip(leap.row, leap.labelRow,
      "Probability the next note is one scale step from the previous one. Higher = calmer, flowing line; lower = jumpier melody with more leaps.");
    addTooltip(bassRow, bassLabel,
      "Adds a slow root-note drone on the lowest octave, firing once per measure (every 8 eighth-notes). Pairs especially well with longer note lengths.");
    addTooltip(deluxeRow, deluxeLabel,
      "Full two-voice arrangement: the seed picks a key and major/minor mode, then composes measure by measure — shuffled rhythm patterns, 1-3 note treble chords, an independent bass line, and a reverb wash. Same seed, same song, every time.");

    panel.append(
      titleWrap, deluxeRow, seedWrap, bpmRow,
      sustain.row, density.row, leap.row, bassRow,
      btn
    );
    // Eat panel clicks so the document handler doesn't retune the mesh.
    panel.addEventListener("click", (e) => e.stopPropagation());

    document.body.appendChild(panel);

    this.input = input;
    this.bpmInput = bpmInput;
    this.btn = btn;
  }

  // Tuner-like surface — used by ControlBar.openTuner so the seed panel
  // participates in the "only one panel open at a time" rule.
  isVisible() { return this.visible; }
  show() { this.visible = true; this.panel.style.display = "block"; }
  hide() { this.visible = false; this.panel.style.display = "none"; }
  toggle() { if (this.visible) this.hide(); else this.show(); }

  startPressed() {
    let seed = this.input.value.trim();
    if (!seed) {
      seed = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
      this.input.value = seed;
    }
    // Mirror InstrumentSelector: only nudge the existing audio context
    // back to life. The page stays silent until the user unmutes through
    // the breathing sound toggle in the left ControlBar.
    if (this.mesh.enabled) this.mesh.start();
    this.startWithSeed(seed);
  }

  playToggle() {
    if (this.playing) this.stop();
    else this.startPressed();
  }

  startWithSeed(seed) {
    this.stop();
    this.prng = this.makePrng(seed);
    if (this.deluxe) {
      // Deluxe draw order: root, mode, then tempo — all before any
      // measure generation so the whole arrangement is seed-locked.
      this.deluxeInit();
      this.bpm = 60 + Math.floor(this.prng() * 61); // 60..120, like the pen
      // Open the reverb send for the hall blend; stop() closes it.
      this.mesh.reverbWet = 0.3;
      this.mesh.applyReverbWet();
      this.deluxeReverbOn = true;
    } else {
      // Burn one PRNG draw for tempo so the BPM and the melody are both
      // seed-deterministic — and the melody starts from the same state on
      // every restart with the same seed.
      this.bpm = 72 + Math.floor(this.prng() * 69); // 72..140
      // Seed the first note's bias state from the PRNG so the very first
      // interval is also seed-determined (rather than always referencing
      // the 4/2 default).
      this.prevSlot = Math.floor(this.prng() * 10);
      this.prevBand = Math.floor(this.prng() * 5);
    }
    this.eighthSec = (60 / this.bpm) / 2;
    this.stepCount = 0;
    this.bpmInput.value = this.bpm;
    this.btn.textContent = "⏹";
    this.playing = true;
    this.mesh.sequencerActive = true;
    const ctx = this.mesh.audioCtx;
    this.nextNoteTime = ctx ? ctx.currentTime + 0.05 : 0;
    this.intervalId = setInterval(() => this.tick(), this.tickMs);
    if (this.onPlayingChange) this.onPlayingChange(true);
  }

  stop() {
    const wasPlaying = this.playing;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    // Cancel any visual-pulse timeouts still in flight so no stray dot
    // flashes after the user hits stop.
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts.length = 0;
    this.playing = false;
    this.mesh.sequencerActive = false;
    // Hand the tonal system back: deluxe borrowed the mesh's scale/root
    // for the seed's key; the user's own tuning comes back on stop.
    if (this.savedTonal) {
      this.mesh.scaleIndex = this.savedTonal.scaleIndex;
      this.mesh.setScale();
      this.mesh.rootKey = this.savedTonal.rootKey;
      this.savedTonal = null;
    }
    if (this.deluxeReverbOn) {
      this.mesh.reverbWet = 0;
      this.mesh.applyReverbWet();
      this.deluxeReverbOn = false;
    }
    this.btn.textContent = "▶";
    if (wasPlaying && this.onPlayingChange) this.onPlayingChange(false);
  }

  pickNextSlot() {
    const r = this.prng();
    // leapBias is the stepwise threshold; the gap between it and 1.0 is
    // split: most of it is "small leap" (±2), the last 15% is "random".
    const stepwise = this.leapBias;
    const smallLeap = stepwise + (1 - stepwise) * 0.625;
    let next;
    if (r < stepwise) next = this.prevSlot + (this.prng() < 0.5 ? -1 : 1);
    else if (r < smallLeap) next = this.prevSlot + (this.prng() < 0.5 ? -2 : 2);
    else next = Math.floor(this.prng() * 10);
    return Math.max(0, Math.min(9, next));
  }

  pickNextBand() {
    const r = this.prng();
    let next;
    if (r < 0.70) next = this.prevBand;
    else if (r < 0.92) next = this.prevBand + (this.prng() < 0.5 ? -1 : 1);
    else next = Math.floor(this.prng() * 5);
    return Math.max(0, Math.min(4, next));
  }

  scheduleStep(when) {
    if (this.deluxe) return this.deluxeScheduleStep(when);
    this.stepCount++;
    // Final-note resolution: on every phraseLength-th step, force the
    // slot to the scale tonic (slot 0) so phrases periodically land.
    // Rest is also suppressed on resolution steps — a phrase that ends
    // on silence doesn't feel like a landing.
    const isResolution = this.stepCount % this.phraseLength === 0;
    const rest = !isResolution && this.prng() < this.density;
    let slot = isResolution ? 0 : this.pickNextSlot();
    const band = this.pickNextBand();
    this.prevSlot = slot;
    this.prevBand = band;
    // Bass: independent voice on the lowest band, root note, every
    // bassEveryNSteps eighths. Fires regardless of melody rest so the
    // bottom end keeps moving.
    if (this.bassEnabled && this.stepCount % this.bassEveryNSteps === 1) {
      const bassFreq = this.mesh.noteForSlot(0, 4);
      const bassSustain = this.eighthSec * this.bassEveryNSteps * this.noteLengthFrac;
      this.mesh.sequencerPlay(bassFreq, 0.45, when, bassSustain);
    }
    if (rest) return;
    const intensity = 0.5 + this.prng() * 0.5;
    const freq = this.mesh.noteForSlot(slot, band);
    const sustainSec = this.eighthSec * this.noteLengthFrac;
    this.mesh.sequencerPlay(freq, intensity, when, sustainSec);
    // Visual pulse fires at the audible moment, not at schedule time.
    const ctx = this.mesh.audioCtx;
    const delayMs = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (slot + 0.5) / 10 * w;
    const y = (band + 0.5) / 5 * h;
    const id = setTimeout(() => {
      if (this.playing) this.bg.exciteAt(x, y, 120);
    }, delayMs);
    this.pendingTimeouts.push(id);
  }

  // ============ DELUXE ENGINE ============

  // Seed-determined key/mode, mesh retune, and pitch-table construction.
  // Draw order (root, then mode) is part of the seed contract — changing
  // it changes every seed's song.
  deluxeInit() {
    const root = Math.floor(this.prng() * 12);
    const minor = this.prng() < 0.5;
    if (!this.savedTonal) {
      this.savedTonal = {
        scaleIndex: this.mesh.scaleIndex,
        rootKey: this.mesh.rootKey,
      };
    }
    // SCALES[2] = Diatonic Maj, SCALES[3] = Diatonic Min (mesh-audio.js).
    // Retuning the mesh keeps hover/click pitches in the song's key.
    this.mesh.scaleIndex = minor ? 3 : 2;
    this.mesh.setScale();
    this.mesh.rootKey = root;
    // Pitch table: 7 diatonic degrees × octaves 2..5, low to high — the
    // same register span as the pen. Bass owns the lower half, treble
    // the upper half, exactly like its offset scheme.
    this.deluxeNotes = [];
    const sems = this.mesh.scale;
    for (let o = 2; o <= 5; o++) {
      for (let d = 0; d < sems.length; d++) {
        this.deluxeNotes.push({ sem: sems[d], oct: o, deg: d });
      }
    }
    this.deluxeSteps = [];
  }

  // Same MIDI math as mesh.noteForSlot, but addressed by absolute
  // octave + scale semitone so the two clefs get real registers instead
  // of screen bands. Click transposition (keyOffset/octaveOffset) still
  // applies, so retuning the grid mid-song shifts the whole arrangement.
  deluxeFreq(n) {
    const m = this.mesh;
    const midi = 12 * (n.oct + 1) + n.sem + m.keyOffset + m.octaveOffset * 12 + m.rootKey;
    return m.tuningA4 * Math.pow(2, (midi - 69) / 12);
  }

  // Compose one 4/4 measure (8 grid steps) for both clefs and append it
  // to the step queue. Mirrors the pen's _getClef/_getChord/_getNote:
  // child PRNG per clef, shuffled length sequence, 1..maxNotes chord
  // tones with the adjacency-rejection rule.
  deluxeGenMeasure() {
    const steps = Array.from({ length: 8 }, () => []);
    const half = Math.floor(this.deluxeNotes.length / 2);
    const clefs = [
      { name: "treb", maxNotes: 3, offset: half, base: 0.45 },
      { name: "bass", maxNotes: 1, offset: 0,    base: 0.50 },
    ];
    for (const clef of clefs) {
      // Child generator: one draw from the main stream seeds a fresh
      // PRNG per clef, so treble and bass diverge deterministically.
      const crand = this.makePrng(
        Math.floor(this.prng() * 0xffffffff) + clef.name
      );
      const seqs = SeedSequencer.DELUXE_LEN_SEQS;
      const seq = seqs[Math.floor(crand() * seqs.length)].slice();
      // Fisher-Yates shuffle on the clef stream.
      for (let i = seq.length - 1; i > 0; i--) {
        const j = Math.floor(crand() * (i + 1));
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
      let pos = 0;
      for (const len of seq) {
        const eighths = 8 / len; // len 1 = whole note = 8 grid steps
        // The rests slider doubles as chord-drop probability in deluxe
        // (the original had no rests at all; 0% reproduces that).
        if (crand() >= this.density) {
          const count = Math.ceil(crand() * clef.maxNotes);
          const used = [];
          for (let nth = 0; nth < count; nth++) {
            // Reject candidates on or adjacent to an already-used scale
            // degree — the pen's dissonance guard against stacked 2nds.
            // Bounded retries instead of its unbounded recursion.
            for (let tries = 0; tries < 30; tries++) {
              const cand = Math.floor(crand() * half) + clef.offset;
              if (
                used.indexOf(cand) === -1 &&
                used.indexOf(cand - 1) === -1 &&
                used.indexOf(cand + 1) === -1
              ) {
                used.push(cand);
                break;
              }
            }
          }
          if (used.length) {
            steps[pos].push({
              noteIdxs: used,
              eighths,
              intensity: clef.base + crand() * 0.25,
            });
          }
        }
        pos += eighths;
        if (pos >= 8) break;
      }
    }
    for (const s of steps) this.deluxeSteps.push(s);
  }

  // Deluxe counterpart of scheduleStep: play every chord landing on this
  // grid step and pulse the dots under each chord tone.
  deluxeScheduleStep(when) {
    if (!this.deluxeSteps.length) this.deluxeGenMeasure();
    const events = this.deluxeSteps.shift();
    if (!events.length) return;
    const ctx = this.mesh.audioCtx;
    const delayMs = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const degCount = this.mesh.scale.length;
    for (const ev of events) {
      const sustainSec = ev.eighths * this.eighthSec * this.noteLengthFrac;
      for (const idx of ev.noteIdxs) {
        const n = this.deluxeNotes[idx];
        this.mesh.sequencerPlay(this.deluxeFreq(n), ev.intensity, when, sustainSec);
        // Dot pulse: degree → x, octave (2..5, high on top) → y.
        const x = (n.deg + 0.5) / degCount * w;
        const y = ((5 - n.oct) + 0.5) / 4 * h;
        const id = setTimeout(() => {
          if (this.playing) this.bg.exciteAt(x, y, 110);
        }, delayMs);
        this.pendingTimeouts.push(id);
      }
    }
  }

  tick() {
    const ctx = this.mesh.audioCtx;
    if (!ctx) return;
    // If the tab was backgrounded (setInterval drifted) or audio just came
    // online, snap forward so we don't dump a backlog of stale notes.
    if (this.nextNoteTime < ctx.currentTime) {
      this.nextNoteTime = ctx.currentTime + 0.05;
    }
    while (this.nextNoteTime < ctx.currentTime + this.lookaheadSec) {
      this.scheduleStep(this.nextNoteTime);
      this.nextNoteTime += this.eighthSec;
    }
  }
}
