// mesh-audio.js — turns the dot grid into a musical instrument.
// Each dot maps to a pitch:
//   X position → chromatic note (12 across the screen)
//   Y position → octave (top = high, bottom = low)
// When a dot crosses the excitement threshold, a soft sine envelope rings out.
// Multiple simultaneous pings = chord.
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
    this.masterVolume = 0.14;

    // Chromatic — 12 notes across the screen as requested
    this.notesPerScreen = 12;

    this.hint = null;
    this.showHint();
  }

  showHint() {
    const hint = document.createElement("div");
    hint.id = "audio-hint";
    hint.textContent = "🔊 click anywhere to enable sound";
    Object.assign(hint.style, {
      position: "fixed",
      bottom: "20px",
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

      // Gentle lowpass to soften the high octaves
      this.filter = this.audioCtx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 5000;
      this.filter.Q.value = 0.7;

      this.master.connect(this.filter);
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

    // 12 chromatic notes across width — left=C, right=B
    const noteIdx = Math.floor(xRatio * this.notesPerScreen);

    // Y: top = octave 6 (high), bottom = octave 2 (low) — 5 octaves of range
    const octave = 6 - Math.floor(yRatio * 5);

    // MIDI: C0 = 12, so C{octave} = 12*(octave+1)
    const midi = 12 * (octave + 1) + noteIdx;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  ping(dot, freq) {
    if (!this.enabled || !this.audioCtx) return;

    const nowMs = performance.now();
    const last = this.cooldowns.get(dot) || 0;
    if (nowMs - last < this.cooldownMs) return;
    this.cooldowns.set(dot, nowMs);

    const t = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Slight detuned overtone for a richer, music-box-like timbre
    const overtone = this.audioCtx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2;

    const overtoneGain = this.audioCtx.createGain();
    overtoneGain.gain.value = 0.15;

    const env = this.audioCtx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    osc.connect(env);
    overtone.connect(overtoneGain);
    overtoneGain.connect(env);
    env.connect(this.master);

    osc.start(t);
    overtone.start(t);
    osc.stop(t + 1.6);
    overtone.stop(t + 1.6);
  }

  update(dots, w, h) {
    if (!this.enabled) return;
    const threshold = this.excitementThreshold;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const prev = this.previousExcitement.get(dot) || 0;
      const curr = dot.excitement;
      // Trigger only on the rising edge — dot crossed the threshold going up
      if (prev < threshold && curr >= threshold) {
        const freq = this.noteForPosition(dot.x, dot.y, w, h);
        this.ping(dot, freq);
      }
      this.previousExcitement.set(dot, curr);
    }
  }
}
