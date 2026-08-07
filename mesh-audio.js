// mesh-audio.js — turns the dot grid into a musical instrument.
// Each dot maps to a pitch:
//   X position → chromatic note (12 across the screen)
//   Y position → octave (top = high, bottom = low)
// When a dot crosses the excitement threshold, the active instrument's voice
// envelope rings out. Multiple simultaneous pings = chord.
//
// A click on the grid retunes the mesh (X = key, Y = octave shift).
// A click on one of the 7 invisible slots along the bottom edge changes
// the active instrument timbre (clarinet, bass, piano, harpsichord, …).
//
// Browsers block AudioContext until a user gesture. The page loads muted;
// audio goes live only when the user clicks the sound toggle in the left
// control bar (controls.js), which doubles as a breathing "click me" invite.

class MusicalMesh {
  // A small cross-cultural set of tonal systems. Float entries are
  // microtonal (real-world Slendro and Maqam tunings aren't quantized
  // to Western 12-TET); the MIDI→Hz formula handles non-integer values
  // natively so they sound correct, not snapped.
  static SCALES = [
    { name: "Major Pent.",  notes: [0, 2, 4, 7, 9] },
    { name: "Minor Pent.",  notes: [0, 3, 5, 7, 10] },
    { name: "Diatonic Maj", notes: [0, 2, 4, 5, 7, 9, 11] },
    { name: "Diatonic Min", notes: [0, 2, 3, 5, 7, 8, 10] },
    { name: "Chromatic",    notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: "Whole Tone",   notes: [0, 2, 4, 6, 8, 10] },
    { name: "Slendro",      notes: [0, 2.4, 4.8, 7.2, 9.6] },
    { name: "Pelog",        notes: [0, 1, 3, 7, 8] },
    { name: "Maqam Rast",   notes: [0, 2, 3.5, 5, 7, 9, 10.5] },
    { name: "Hirajoshi",    notes: [0, 2, 3, 7, 8] },
  ];

  static KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  constructor() {
    this.audioCtx = null;
    this.master = null;
    this.filter = null;
    this.enabled = false;

    // WeakMaps so entries get GC'd when dots are replaced on resize
    this.cooldowns = new WeakMap();
    this.previousExcitement = new WeakMap();

    this.cooldownMs = 220;
    this.excitementThreshold = 0.35;
    this.masterVolume = 0.10;

    // Tunable audio properties surfaced for ?tune=sound. Setters
    // (applyMasterVolume, applyFilterCutoff, applyFilterQ) push these
    // into the live audio graph; start() reads them when first building
    // the graph so changes made before audio is enabled also stick.
    this.filterCutoff = 5000;
    this.filterQ = 0.7;
    // waveSpeed mirrors background.waveSpeed so the audio wave stays
    // locked to the visual wave; syncWaveSpeed() writes through.
    this.waveSpeed = 900;
    this.background = null;
    // Click-wave shape: how many notes/sec at most, and how soft the
    // furthest dot's note is allowed to be.
    this.waveNoteDensity = 40;
    this.waveIntensityFloor = 0.12;

    // Global rate limit across all voices to prevent the audio graph from
    // ballooning when the cursor sweeps fast. ~33 new voices/sec maximum.
    this.minVoiceIntervalMs = 30;
    this.lastVoiceTime = 0;

    // When the SeedSequencer is running, cursor pings duck to keep the
    // sequenced melody in the foreground. See ping() and sequencerPlay().
    this.sequencerActive = false;

    // Convolution reverb wet level. 0 = fully dry (the default page
    // sound is untouched). The seed-music DELUXE mode raises this while
    // playing for a lusher, hall-like blend, then restores it on stop.
    this.reverbWet = 0;

    // Tonal system, surfaced for ?tune=4. scaleIndex picks one of the
    // presets in MusicalMesh.SCALES; setScale() copies the chosen array
    // into this.scale, which noteForPosition reads each frame. Float
    // entries in the array (e.g. Slendro, Maqam Rast) intentionally
    // produce microtonal pitches.
    this.scaleIndex = 0;
    this.scale = MusicalMesh.SCALES[0].notes;
    this.rootKey = 0; // 0=C, 1=C#, 2=D, ... 11=B — semitones added to every pitch
    this.baseOctave = 6; // octave that plays at the top edge of the screen
    this.octaveSpan = 5; // how many octaves span the screen height
    this.notesPerScreen = 10; // horizontal note divisions
    this.tuningA4 = 440; // reference frequency in Hz for note A4
    this.toneStride = 1; // scale-degrees between adjacent x positions (0 = unison)
    this.keyLocked = 0; // 1 = clicks no longer retune key/octave (0 = free)

    // Click-driven transposition: shifts the whole mesh up or down
    this.keyOffset = 0; // 0..11 semitones (X of click)
    this.octaveOffset = 0; // -1..+1 octaves (Y of click)

    // Instrument voices come from instrument-mixes.js (loaded before this
    // file). Each entry is { name, emoji, voice(freq, intensity, time) }.
    // applyMix() (driven by the instrument tuner dial) swaps the whole
    // array in place for a different curated timbre set.
    this.currentMix = 0;
    this.instruments = INSTRUMENT_MIXES[0].instruments;
    this.currentInstrument = 0;
    // Wired in index.html — fires when the active mix changes so the
    // InstrumentSelector bar can re-skin its emoji/name labels.
    this.onMixChange = null;
  }

  // Side-effect for the instrument tuner dial: reads currentMix and
  // swaps the whole 7-voice array. The tuner just writes currentMix and
  // calls applyMix() (see Tuner.SIDE_EFFECTS) — same pattern as setScale.
  applyMix() {
    const max = INSTRUMENT_MIXES.length - 1;
    this.currentMix = Math.max(0, Math.min(max, Math.round(this.currentMix)));
    this.instruments = INSTRUMENT_MIXES[this.currentMix].instruments;
    if (this.currentInstrument >= this.instruments.length) {
      this.currentInstrument = 0;
    }
    if (this.enabled && this.audioCtx) {
      this.playVoice(261.63, 0.65, this.audioCtx.currentTime);
    }
    if (this.onMixChange) this.onMixChange(this.currentMix);
  }

  start() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();

      this.master = this.audioCtx.createGain();
      this.master.gain.value = this.masterVolume;

      // Compressor squashes peaks so simultaneous voices don't clip
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.1;

      this.filter = this.audioCtx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = this.filterCutoff;
      this.filter.Q.value = this.filterQ;

      this.master.connect(this.compressor);
      this.compressor.connect(this.filter);
      this.filter.connect(this.audioCtx.destination);

      // Parallel wet path: filter → convolver → wet gain → out. Sits at
      // zero gain until something (DELUXE playback) turns it up, so the
      // graph carries no audible reverb by default.
      this.reverb = this.audioCtx.createConvolver();
      this.reverb.buffer = this.buildReverbImpulse(2.5, 2.5);
      this.reverbGain = this.audioCtx.createGain();
      this.reverbGain.gain.value = this.reverbWet;
      this.filter.connect(this.reverb);
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.audioCtx.destination);

      this.enabled = true;
    } catch (err) {
      console.warn("Audio init failed:", err);
    }
  }

  // Side-effect setters called by the Tuner when a sound dial moves so
  // the change is audible immediately (rather than waiting for the next
  // voice to be scheduled).
  applyMasterVolume() {
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  applyFilterCutoff() {
    if (this.filter) this.filter.frequency.value = this.filterCutoff;
  }

  applyFilterQ() {
    if (this.filter) this.filter.Q.value = this.filterQ;
  }

  applyReverbWet() {
    if (this.reverbGain) this.reverbGain.gain.value = this.reverbWet;
  }

  // Synthesized impulse response: stereo decaying noise. Avoids shipping
  // an IR sample file — good enough for an ambient hall wash.
  buildReverbImpulse(seconds, decay) {
    const rate = this.audioCtx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.audioCtx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Keep the visual wave speed in sync with the audio wave speed so the
  // sound's expansion stays glued to the ring on screen.
  syncWaveSpeed() {
    if (this.background) this.background.waveSpeed = this.waveSpeed;
  }

  // Look up the selected scale by index and copy its note array into
  // this.scale so noteForPosition sees the new tuning on the next call.
  setScale() {
    const max = MusicalMesh.SCALES.length - 1;
    const i = Math.max(0, Math.min(max, Math.round(this.scaleIndex)));
    this.scale = MusicalMesh.SCALES[i].notes;
  }

  noteForPosition(x, y, w, h) {
    const xRatio = Math.max(0, Math.min(0.999, x / w));
    const yRatio = Math.max(0, Math.min(0.999, y / h));
    const noteIdx = Math.floor(xRatio * this.notesPerScreen);
    // toneStride multiplies the scale-degree index so adjacent dots can be
    // spaced wider than a single scale step (0 = unison, 1 = neighbors,
    // 2 = thirds, 3 = fifths, ...). Wrap through the scale, climbing one
    // octave (12 semitones) each time the stepped index passes sLen.
    const stepped = noteIdx * this.toneStride;
    const sLen = this.scale.length;
    const semitone = this.scale[((stepped % sLen) + sLen) % sLen] + Math.floor(stepped / sLen) * 12;
    const octave = this.baseOctave - Math.floor(yRatio * this.octaveSpan);
    const midi =
      12 * (octave + 1) + semitone + this.keyOffset + this.octaveOffset * 12 + this.rootKey;
    // Tunable A4 lets you switch to 432 Hz, 415 Hz (Baroque), etc.
    return this.tuningA4 * Math.pow(2, (midi - 69) / 12);
  }

  // Same MIDI math as noteForPosition, but indexed by discrete slot/band
  // so the sequencer doesn't need to fabricate pixel coordinates. slotIndex
  // mirrors `floor(xRatio * notesPerScreen)`; octaveBand mirrors
  // `floor(yRatio * octaveSpan)` (0 = top/high, octaveSpan-1 = bottom/low).
  noteForSlot(slotIndex, octaveBand) {
    const stepped = slotIndex * this.toneStride;
    const sLen = this.scale.length;
    const semitone = this.scale[((stepped % sLen) + sLen) % sLen] + Math.floor(stepped / sLen) * 12;
    const octave = this.baseOctave - octaveBand;
    const midi =
      12 * (octave + 1) + semitone + this.keyOffset + this.octaveOffset * 12 + this.rootKey;
    return this.tuningA4 * Math.pow(2, (midi - 69) / 12);
  }

  // Sequencer voice path — bypasses the cursor-sweep rate limiter so the
  // tempo grid is never thinned. Routes through the same instrument voice
  // (so timbre switches mid-playback) and master/compressor/filter chain.
  //
  // sustainSec (optional): truncate the voice's natural tail by routing
  // it through a per-note gain that holds at unity until `t + sustainSec`,
  // then releases over ~50ms. The voice still draws its own attack
  // envelope; we only gate the tail. Voices wire to `this.master` during
  // the call, so we temporarily swap master for a per-note gate that
  // feeds master — when the voice returns, master is restored. Long
  // sustainSec values (longer than the voice's own envelope) are
  // effectively no-ops.
  sequencerPlay(freq, intensity, when, sustainSec) {
    if (!this.enabled || !this.audioCtx) return;
    const ctx = this.audioCtx;
    const t = (typeof when === "number") ? when : ctx.currentTime;
    const inst = this.instruments[this.currentInstrument];
    if (typeof sustainSec !== "number" || sustainSec <= 0) {
      // A throw here would otherwise abort the remaining steps in
      // tick()'s scheduling while-loop, dropping every note still queued
      // for this frame — one bad voice call shouldn't skip the rest.
      try {
        inst.voice.call(this, freq, intensity, t);
      } catch (err) {
        console.warn("[mesh] sequencer voice synthesis failed:", inst.name, err);
      }
      return;
    }
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(1, t);
    gate.connect(this.master);
    const realMaster = this.master;
    this.master = gate;
    try {
      inst.voice.call(this, freq, intensity, t);
    } catch (err) {
      console.warn("[mesh] sequencer voice synthesis failed:", inst.name, err);
    } finally {
      this.master = realMaster;
    }
    gate.gain.setValueAtTime(1, t + sustainSec);
    gate.gain.exponentialRampToValueAtTime(0.001, t + sustainSec + 0.05);
  }

  setAnchor(x, y, w, h) {
    const xRatio = Math.max(0, Math.min(0.999, x / w));
    const yRatio = Math.max(0, Math.min(0.999, y / h));
    // 24 horizontal buckets (full chromatic wheel × 2) and 5 vertical
    // buckets (octaveOffset ±2). Doubles the color/tone resolution from
    // the original 12×3 while staying inside a musical pitch range.
    this.keyOffset = Math.floor(xRatio * 24);
    this.octaveOffset = 2 - Math.floor(yRatio * 5);
  }

  setInstrument(idx) {
    const max = this.instruments.length - 1;
    this.currentInstrument = Math.max(0, Math.min(max, idx));
    // Demo note (middle C) so the user immediately hears the new timbre
    if (this.enabled && this.audioCtx) {
      this.playVoice(261.63, 0.65, this.audioCtx.currentTime);
    }
  }

  // Dispatch to the active instrument's voice synthesis.
  // Returns false if the voice was rate-limited (caller can skip cooldown updates).
  //
  // Every hover-driven ping reaches this through update(), which runs inside
  // BackgroundField's requestAnimationFrame loop. An uncaught throw here
  // would abort that frame before it reaches its own rAF reschedule call,
  // permanently freezing the dot field — so a synthesis bug degrades to a
  // dropped note instead of a dead canvas.
  playVoice(freq, intensity, time) {
    const nowMs = performance.now();
    if (nowMs - this.lastVoiceTime < this.minVoiceIntervalMs) return false;
    this.lastVoiceTime = nowMs;
    const inst = this.instruments[this.currentInstrument];
    try {
      inst.voice.call(this, freq, intensity, time);
    } catch (err) {
      console.warn("[mesh] voice synthesis failed:", inst.name, err);
    }
    return true;
  }

  // ============ TRIGGERS ============

  // Hover-driven ping with cooldown
  ping(dot, freq) {
    if (!this.enabled || !this.audioCtx) return;
    // Silence cursor voices entirely while the seeded melody is playing —
    // the dot field still lights up via the cursor, only its audio is muted.
    if (this.sequencerActive) return;
    const nowMs = performance.now();
    const last = this.cooldowns.get(dot) || 0;
    if (nowMs - last < this.cooldownMs) return;
    this.cooldowns.set(dot, nowMs);
    this.playVoice(freq, 1.0, this.audioCtx.currentTime);
  }

  // Schedule a ripple of notes that emanates outward from (cx, cy) in sync
  // with the visual bow-wave: each dot's pitch (from noteForPosition) fires
  // when the wavefront reaches it (delay = dist / waveSpeed). Pitches come
  // from the same pentatonic mapping used by hover, so the ripple is always
  // in key. A minimum time gap thins dense rings to ~40 notes/sec; intensity
  // falls off with distance so the wave audibly dies at the edges. Pending
  // notes from a prior wave are cancelled so rapid clicks restart the
  // ripple rather than stacking waves into a wall of sound.
  waveTriggerAt(dots, cx, cy, w, h, waveSpeed = 900) {
    if (!this.enabled || !this.audioCtx) return;

    if (this._waveTimers && this._waveTimers.length) {
      for (const id of this._waveTimers) clearTimeout(id);
    }
    this._waveTimers = [];

    const maxDist = Math.sqrt(w * w + h * h);
    const minGapSec = 1 / Math.max(1, this.waveNoteDensity);
    const floor = this.waveIntensityFloor;

    // Sort by distance so the gap filter thins evenly along the wave's
    // expansion (closer dots commit their time slots first).
    const ordered = new Array(dots.length);
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dx = dot.x - cx;
      const dy = dot.y - cy;
      ordered[i] = { dot, dist: Math.sqrt(dx * dx + dy * dy) };
    }
    ordered.sort((a, b) => a.dist - b.dist);

    let lastDelay = -minGapSec;
    for (const entry of ordered) {
      const delaySec = entry.dist / waveSpeed;
      if (delaySec - lastDelay < minGapSec) continue;
      lastDelay = delaySec;
      const freq = this.noteForPosition(entry.dot.x, entry.dot.y, w, h);
      const intensity = Math.max(floor, 1 - entry.dist / maxDist);
      const dot = entry.dot;
      const id = setTimeout(() => {
        // Direct voice call bypasses the cursor-sweep rate limit, which
        // exists to throttle hover spam — click events should ring through.
        const inst = this.instruments[this.currentInstrument];
        try {
          inst.voice.call(this, freq, intensity, this.audioCtx.currentTime);
        } catch (err) {
          console.warn("[mesh] wave voice synthesis failed:", inst.name, err);
        } finally {
          // Set regardless of the try outcome — a dot whose voice call
          // threw shouldn't be left able to re-fire immediately on the
          // next hover-driven excitement crossing.
          this.cooldowns.set(dot, performance.now());
        }
      }, delaySec * 1000);
      this._waveTimers.push(id);
    }
  }

  update(dots, w, h) {
    if (!this.enabled) return;
    const threshold = this.excitementThreshold;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const prev = this.previousExcitement.get(dot) || 0;
      const curr = dot.excitement;
      if (prev < threshold && curr >= threshold) {
        const freq = this.noteForPosition(dot.x, dot.y, w, h);
        this.ping(dot, freq);
      }
      this.previousExcitement.set(dot, curr);
    }
  }
}

// Invisible row of 7 click zones along the bottom edge.
// Each zone selects an instrument timbre on the mesh.
class InstrumentSelector {
  constructor(mesh) {
    this.mesh = mesh;
    this.slots = [];
    this.emojiEls = [];
    this.activeIndex = 0;
    this.tooltipEls = [];
    this.build();
    // Highlight the default starting instrument
    this.markActive(0);
  }

  build() {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      position: "fixed",
      bottom: "0",
      left: "0",
      right: "0",
      height: "60px",
      display: "flex",
      // z-index 0 keeps it below the project buttons (z:1) on overlap
      zIndex: "0",
    });

    this.mesh.instruments.forEach((inst, i) => {
      const slot = document.createElement("div");
      slot.className = "instrument-slot";
      slot.dataset.name = inst.name;
      Object.assign(slot.style, {
        flex: "1",
        cursor: "pointer",
        backgroundColor: "transparent",
        transition: "background-color 0.25s",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      });

      // Per-slot hover tooltip. Bottom edge sits 70px above the viewport
      // bottom — the slot bar is 60px tall, so 10px above the slot top.
      const tooltip = document.createElement("div");
      tooltip.className = "instrument-tooltip";
      tooltip.textContent = inst.name;
      Object.assign(tooltip.style, {
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "5px 12px",
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        fontFamily: "Montserrat, sans-serif",
        fontSize: "12px",
        letterSpacing: "1px",
        textTransform: "uppercase",
        borderRadius: "14px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        opacity: "0",
        transition: "opacity 0.25s",
        zIndex: "22",
      });
      slot.appendChild(tooltip);

      // Icon preview — fades in on hover, stays solid when slot is active.
      // Renders inst.iconUrl as an <img> when present, otherwise inst.emoji
      // as text. refreshLabels() re-runs this when the mix changes.
      const emojiEl = document.createElement("div");
      Object.assign(emojiEl.style, {
        fontSize: "32px",
        lineHeight: "1",
        opacity: "0",
        transition: "opacity 0.3s",
        pointerEvents: "none",
      });
      InstrumentSelector.renderIcon(emojiEl, inst);
      slot.appendChild(emojiEl);

      slot.addEventListener("mouseenter", () => {
        slot.style.backgroundColor = "rgba(255,255,255,0.04)";
        emojiEl.style.opacity = "0.85";
        // Per-slot tooltip preview. The bottom-center label is reserved
        // for the active instrument and is left alone on hover so it
        // never gets replaced or covered.
        tooltip.style.opacity = "0.92";
      });
      slot.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
        // Active slot keeps the white tint as its persistent indicator
        if (i !== this.activeIndex) {
          slot.style.backgroundColor = "transparent";
          emojiEl.style.opacity = "0";
        }
      });
      slot.addEventListener("click", () => {
        // Resume audio only if the user already enabled it. Picking an
        // instrument never unmutes the page — that's the sound toggle's
        // job — so the site can load and stay muted until asked.
        if (this.mesh.enabled) this.mesh.start();
        this.select(i);
      });
      bar.appendChild(slot);
      this.slots.push(slot);
      this.emojiEls.push(emojiEl);
      this.tooltipEls.push(tooltip);
    });

    document.body.appendChild(bar);
  }

  select(idx) {
    this.activeIndex = idx;
    this.mesh.setInstrument(idx);
    this.markActive(idx);
  }

  markActive(idx) {
    // Active slot keeps the same 4% white tint as hover; inactive slots clear.
    this.slots.forEach((s, i) => {
      s.style.backgroundColor =
        i === idx ? "rgba(255,255,255,0.04)" : "transparent";
    });
    // Active emoji stays at full opacity; others fade out (unless hovered).
    this.emojiEls.forEach((el, i) => {
      el.style.opacity = i === idx ? "1" : "0";
    });
  }

  // Re-skin every slot's icon + tooltip from the current mesh.instruments
  // array. Called after MusicalMesh.applyMix() swaps the instrument set so
  // the bottom bar reflects the new mix's icons and instrument names.
  refreshLabels() {
    this.mesh.instruments.forEach((inst, i) => {
      if (this.emojiEls[i]) InstrumentSelector.renderIcon(this.emojiEls[i], inst);
      if (this.slots[i]) this.slots[i].dataset.name = inst.name;
      if (this.tooltipEls[i]) this.tooltipEls[i].textContent = inst.name;
    });
    // Reapply highlight (which voice is currently active in the new mix)
    if (this.activeIndex >= this.mesh.instruments.length) this.activeIndex = 0;
    this.markActive(this.activeIndex);
  }

  // Populate a slot's icon container. iconUrl wins over emoji so instruments
  // whose glyph doesn't render reliably (Unicode 13 emoji on older Windows
  // fonts) can supply a local image instead.
  static renderIcon(el, inst) {
    el.textContent = "";
    if (inst.iconUrl) {
      const img = document.createElement("img");
      img.src = inst.iconUrl;
      img.alt = inst.name || "";
      img.style.cssText =
        "width:36px;height:36px;display:block;object-fit:contain;pointer-events:none";
      el.appendChild(img);
    } else {
      el.textContent = inst.emoji || "";
    }
  }
}
