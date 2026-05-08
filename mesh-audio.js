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
// Browsers block AudioContext until a user gesture, so a small hint badge
// invites the user to click. After the first click, audio is live.

class MusicalMesh {
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

    // Global rate limit across all voices to prevent the audio graph from
    // ballooning when the cursor sweeps fast. ~33 new voices/sec maximum.
    this.minVoiceIntervalMs = 30;
    this.lastVoiceTime = 0;

    // Pentatonic major scale — adjacent dots can only form consonant intervals.
    // Two pentatonic octaves span the screen (10 slots), so there is enough
    // melodic range without cramming semitones next to each other.
    this.pentatonic = [0, 2, 4, 7, 9]; // semitone offsets: R, M2, M3, P5, M6
    this.notesPerScreen = this.pentatonic.length * 2; // 10 slots = 2 octaves

    // Click-driven transposition: shifts the whole mesh up or down
    this.keyOffset = 0; // 0..11 semitones (X of click)
    this.octaveOffset = 0; // -1..+1 octaves (Y of click)

    // Instrument voices — each is { name, voice(freq, intensity, time) }
    this.instruments = [
      { name: "Trumpet", voice: this.voiceTrumpet },
      { name: "Bass Guitar", voice: this.voiceBass },
      { name: "Piano", voice: this.voicePiano },
      { name: "Harpsichord", voice: this.voiceHarpsichord },
      { name: "Bell", voice: this.voiceBell },
      { name: "Pad", voice: this.voicePad },
      { name: "Pluck", voice: this.voicePluck },
    ];
    this.currentInstrument = 0;

    this.hint = null;
    this.showHint();
  }

  showHint() {
    const hint = document.createElement("div");
    hint.id = "audio-hint";
    hint.textContent = "🔊 click anywhere to enable sound";
    Object.assign(hint.style, {
      position: "fixed",
      bottom: "80px",
      right: "20px",
      padding: "8px 14px",
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      fontFamily: "Montserrat, sans-serif",
      fontSize: "12px",
      borderRadius: "20px",
      zIndex: "100",
      pointerEvents: "none",
      transition: "opacity 0.6s",
      opacity: "0.85",
    });
    document.body.appendChild(hint);
    this.hint = hint;
  }

  hideHint() {
    if (!this.hint) return;
    this.hint.style.opacity = "0";
    setTimeout(() => {
      this.hint && this.hint.remove();
      this.hint = null;
    }, 600);
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
      this.filter.frequency.value = 5000;
      this.filter.Q.value = 0.7;

      this.master.connect(this.compressor);
      this.compressor.connect(this.filter);
      this.filter.connect(this.audioCtx.destination);

      this.enabled = true;
      this.hideHint();
    } catch (err) {
      console.warn("Audio init failed:", err);
    }
  }

  noteForPosition(x, y, w, h) {
    const xRatio = Math.max(0, Math.min(0.999, x / w));
    const yRatio = Math.max(0, Math.min(0.999, y / h));
    const noteIdx = Math.floor(xRatio * this.notesPerScreen);
    // Map the slot to a pentatonic semitone, spanning multiple octaves left→right.
    const pLen = this.pentatonic.length;
    const semitone = this.pentatonic[noteIdx % pLen] + Math.floor(noteIdx / pLen) * 12;
    const octave = 6 - Math.floor(yRatio * 5);
    const midi =
      12 * (octave + 1) + semitone + this.keyOffset + this.octaveOffset * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setAnchor(x, y, w, h) {
    const xRatio = Math.max(0, Math.min(0.999, x / w));
    const yRatio = Math.max(0, Math.min(0.999, y / h));
    this.keyOffset = Math.floor(xRatio * 12);
    this.octaveOffset = 1 - Math.floor(yRatio * 3);
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
  playVoice(freq, intensity, time) {
    const nowMs = performance.now();
    if (nowMs - this.lastVoiceTime < this.minVoiceIntervalMs) return false;
    this.lastVoiceTime = nowMs;
    const inst = this.instruments[this.currentInstrument];
    inst.voice.call(this, freq, intensity, time);
    return true;
  }

  // ============ INSTRUMENT VOICES ============
  // Each takes (freq, intensity, time) and creates oscillator(s) + envelope.

  // Trumpet: bright brass tone from full integer-harmonic additive synthesis
  // with strong 2nd/3rd partials and a sharp attack for the brassy "blat".
  voiceTrumpet(freq, intensity, time) {
    const harmonics = [
      { mult: 1, gain: 0.4 },
      { mult: 2, gain: 0.5 },
      { mult: 3, gain: 0.45 },
      { mult: 4, gain: 0.3 },
      { mult: 5, gain: 0.2 },
      { mult: 6, gain: 0.1 },
    ];
    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.42 * intensity, time + 0.025);
    env.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.35);
    env.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    env.connect(this.master);

    for (const h of harmonics) {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * h.mult;
      const g = this.audioCtx.createGain();
      g.gain.value = h.gain;
      osc.connect(g);
      g.connect(env);
      osc.start(time);
      osc.stop(time + 1.5);
    }
  }

  // Bass Guitar: sawtooth dropped 2 octaves with a plucky filter envelope
  voiceBass(freq, intensity, time) {
    const f = freq / 4;
    const osc = this.audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(2200, time);
    filter.frequency.exponentialRampToValueAtTime(400, time + 0.35);

    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + 1.0);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    osc.start(time);
    osc.stop(time + 1.1);
  }

  // Piano: integer harmonics with hard attack and slow exponential decay
  voicePiano(freq, intensity, time) {
    const harmonics = [
      { mult: 1, gain: 0.7 },
      { mult: 2, gain: 0.32 },
      { mult: 3, gain: 0.16 },
      { mult: 4, gain: 0.08 },
      { mult: 5, gain: 0.04 },
    ];
    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
    env.connect(this.master);

    for (const h of harmonics) {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * h.mult;
      const g = this.audioCtx.createGain();
      g.gain.value = h.gain;
      osc.connect(g);
      g.connect(env);
      osc.start(time);
      osc.stop(time + 2.1);
    }
  }

  // Harpsichord: sawtooth + highpass, extremely plucky envelope
  voiceHarpsichord(freq, intensity, time) {
    const osc = this.audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq * 1.5;

    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.35 * intensity, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.7);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.8);
  }

  // Bell: inharmonic sine partials (ratios from real bell physics) with long decay
  voiceBell(freq, intensity, time) {
    const harmonics = [
      { mult: 1, gain: 0.5 },
      { mult: 2.0, gain: 0.25 },
      { mult: 2.76, gain: 0.3 },
      { mult: 5.4, gain: 0.15 },
    ];
    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.30 * intensity, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + 3.0);
    env.connect(this.master);

    for (const h of harmonics) {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * h.mult;
      const g = this.audioCtx.createGain();
      g.gain.value = h.gain;
      osc.connect(g);
      g.connect(env);
      osc.start(time);
      osc.stop(time + 3.1);
    }
  }

  // Pad: 3 detuned sawtooths through lowpass — slow attack, long sustain
  voicePad(freq, intensity, time) {
    const detunes = [-9, 0, 9]; // cents
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;

    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.18 * intensity, time + 0.35);
    env.gain.exponentialRampToValueAtTime(0.001, time + 2.5);

    filter.connect(env);
    env.connect(this.master);

    for (const d of detunes) {
      const osc = this.audioCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = d;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + 2.6);
    }
  }

  // Pluck: triangle wave with very fast attack, quick release
  voicePluck(freq, intensity, time) {
    const osc = this.audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

    osc.connect(env);
    env.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.65);
  }

  // ============ TRIGGERS ============

  // Hover-driven ping with cooldown
  ping(dot, freq) {
    if (!this.enabled || !this.audioCtx) return;
    const nowMs = performance.now();
    const last = this.cooldowns.get(dot) || 0;
    if (nowMs - last < this.cooldownMs) return;
    this.cooldowns.set(dot, nowMs);
    this.playVoice(freq, 1.0, this.audioCtx.currentTime);
  }

  // Click-driven force-ping with explicit intensity and time delay (no cooldown)
  pingAt(dot, freq, intensity, delay) {
    if (!this.enabled || !this.audioCtx) return;
    this.cooldowns.set(dot, performance.now());
    this.playVoice(freq, intensity, this.audioCtx.currentTime + delay);
  }

  // Force-play a chord at a position (used on key-change clicks)
  retriggerAt(dots, cx, cy, w, h, radius = 220) {
    if (!this.enabled || !this.audioCtx) return;
    const rSq = radius * radius;
    let stagger = 0;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dx = dot.x - cx;
      const dy = dot.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < rSq) {
        const intensity = 1 - Math.sqrt(distSq) / radius;
        const freq = this.noteForPosition(dot.x, dot.y, w, h);
        this.pingAt(dot, freq, intensity, stagger * 0.008);
        stagger++;
        this.previousExcitement.set(dot, 0);
      }
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
    // One emoji per instrument, in the same order as mesh.instruments
    this.emojis = ["🎺", "🎸", "🎹", "🎼", "🔔", "☁️", "🪕"];
    this.activeIndex = 0;
    this.labelEl = null;
    this.labelTimer = null;
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
      });

      // Emoji preview — fades in on hover, stays solid when slot is active
      const emojiEl = document.createElement("div");
      emojiEl.textContent = this.emojis[i] || "";
      Object.assign(emojiEl.style, {
        fontSize: "32px",
        lineHeight: "1",
        opacity: "0",
        transition: "opacity 0.3s",
        pointerEvents: "none",
      });
      slot.appendChild(emojiEl);

      slot.addEventListener("mouseenter", () => {
        slot.style.backgroundColor = "rgba(255,255,255,0.04)";
        emojiEl.style.opacity = "0.85";
      });
      slot.addEventListener("mouseleave", () => {
        // Active slot keeps the white tint as its persistent indicator
        if (i !== this.activeIndex) {
          slot.style.backgroundColor = "transparent";
          emojiEl.style.opacity = "0";
        }
      });
      slot.addEventListener("click", () => {
        // Ensure audio is up — this click counts as the user gesture
        this.mesh.start();
        this.select(i);
      });
      bar.appendChild(slot);
      this.slots.push(slot);
      this.emojiEls.push(emojiEl);
    });

    document.body.appendChild(bar);

    // Floating label, briefly shown when instrument changes
    const label = document.createElement("div");
    Object.assign(label.style, {
      position: "fixed",
      bottom: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "6px 14px",
      background: "rgba(0,0,0,0.6)",
      color: "#fff",
      fontFamily: "Montserrat, sans-serif",
      fontSize: "13px",
      letterSpacing: "1px",
      textTransform: "uppercase",
      borderRadius: "16px",
      pointerEvents: "none",
      zIndex: "21",
      opacity: "0",
      transition: "opacity 0.4s",
    });
    document.body.appendChild(label);
    this.labelEl = label;
  }

  select(idx) {
    this.activeIndex = idx;
    this.mesh.setInstrument(idx);
    this.markActive(idx);
    this.showLabel(this.mesh.instruments[idx].name);
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

  showLabel(text) {
    if (!this.labelEl) return;
    this.labelEl.textContent = text;
    this.labelEl.style.opacity = "0.92";
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => {
      if (this.labelEl) this.labelEl.style.opacity = "0";
    }, 1500);
  }
}
