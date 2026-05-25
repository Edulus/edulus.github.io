// seed-music.js — seeded procedural sequencer that drives MusicalMesh.
// A string seed feeds a deterministic xorshift32 PRNG which picks a BPM
// then emits an 8th-note melody from MusicalMesh's pentatonic slots.
// Each note also pulses the matching dots via BackgroundField.exciteAt
// so the canvas dances in lockstep with the audio.
//
// The seed-music slot lives in the left (audio) ControlBar. Clicking it
// opens this panel; SeedSequencer exposes the same show/hide/toggle/
// isVisible surface as Tuner so the bar's openTuner() can swap it with
// any other panel and only one panel is ever visible at a time.

class SeedSequencer {
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
      "margin-bottom:8px",
    ].join(";");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.startPressed(); }
    });

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

    panel.append(titleWrap, seedLabel, input, bpmRow, btn);
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
    // Burn one PRNG draw for tempo so the BPM and the melody are both
    // seed-deterministic — and the melody starts from the same state on
    // every restart with the same seed.
    this.bpm = 72 + Math.floor(this.prng() * 69); // 72..140
    this.eighthSec = (60 / this.bpm) / 2;
    this.prevSlot = 4;
    this.prevBand = 2;
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
    this.playing = false;
    this.mesh.sequencerActive = false;
    this.btn.textContent = "▶";
    if (wasPlaying && this.onPlayingChange) this.onPlayingChange(false);
  }

  pickNextSlot() {
    const r = this.prng();
    let next;
    if (r < 0.60) next = this.prevSlot + (this.prng() < 0.5 ? -1 : 1);
    else if (r < 0.85) next = this.prevSlot + (this.prng() < 0.5 ? -2 : 2);
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
    const rest = this.prng() < 0.20;
    const slot = this.pickNextSlot();
    const band = this.pickNextBand();
    this.prevSlot = slot;
    this.prevBand = band;
    if (rest) return;
    const intensity = 0.5 + this.prng() * 0.5;
    const freq = this.mesh.noteForSlot(slot, band);
    this.mesh.sequencerPlay(freq, intensity, when);
    // Visual pulse fires at the audible moment, not at schedule time.
    const ctx = this.mesh.audioCtx;
    const delayMs = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (slot + 0.5) / 10 * w;
    const y = (band + 0.5) / 5 * h;
    setTimeout(() => {
      if (this.playing) this.bg.exciteAt(x, y, 120);
    }, delayMs);
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
