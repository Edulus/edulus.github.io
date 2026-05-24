// instrument-mixes.js — voice synthesis library and curated mixes.
// Loaded before mesh-audio.js so MusicalMesh can read INSTRUMENT_MIXES[0]
// as its default voice set. Each mix is 7 voices spanning bass/mid/high/
// sustained/percussive so any mix can cover a chord across the screen.
//
// Every voice is a function (freq, intensity, time) called with the
// MusicalMesh instance bound as `this` — so `this.audioCtx` and
// `this.master` are always available.

// ------------ shared utilities ------------

// One noise buffer per audio context, reused for all noise-burst voices
// (trumpet attack, brush, clap, tabla, flute breath, …). Filling a fresh
// buffer per voice is fine performance-wise but cheaper to share.
let _noiseCache = null;
function noiseBuffer(ctx) {
  if (!_noiseCache || _noiseCache.ctx !== ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    _noiseCache = { ctx, buf };
  }
  return _noiseCache.buf;
}

// Compute a Karplus-Strong pluck into an AudioBuffer. damping controls
// brightness/sustain (0.99 = bright/long, 0.95 = dark/short).
function karplusBuffer(ctx, freq, duration, damping) {
  const sr = ctx.sampleRate;
  const delayLen = Math.max(2, Math.round(sr / freq));
  const totalSamples = Math.ceil(duration * sr);
  const buf = ctx.createBuffer(1, totalSamples, sr);
  const out = buf.getChannelData(0);
  const ks = new Float32Array(delayLen);
  for (let i = 0; i < delayLen; i++) ks[i] = Math.random() * 2 - 1;
  let pos = 0;
  for (let i = 0; i < totalSamples; i++) {
    const curr = ks[pos];
    const next = ks[(pos + 1) % delayLen];
    out[i] = curr;
    ks[pos] = (curr + next) * 0.5 * damping;
    pos = (pos + 1) % delayLen;
  }
  return buf;
}

// Mild waveshaper for harmonic warmth (sub bass, etc.)
function makeShaper(ctx, amount) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = "2x";
  return ws;
}

// =================================================================
//  MIX 1 — Classic (improved versions of the original 7 voices)
// =================================================================

// Trumpet: noise-burst attack, bandpass that sweeps during the note,
// vibrato that kicks in after the attack. Sine harmonics provide the
// brass partials; the bandpass shapes them into a vocal-like formant.
function voiceTrumpetClassic(freq, intensity, time) {
  const ctx = this.audioCtx;

  // Brassy attack chiff — short bandpassed noise burst
  const burst = ctx.createBufferSource();
  burst.buffer = noiseBuffer(ctx);
  const burstBP = ctx.createBiquadFilter();
  burstBP.type = "bandpass";
  burstBP.frequency.value = freq * 3;
  burstBP.Q.value = 2;
  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0.18 * intensity, time);
  burstGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
  burst.connect(burstBP);
  burstBP.connect(burstGain);
  burstGain.connect(this.master);
  burst.start(time);
  burst.stop(time + 0.08);

  // Sweeping bandpass shapes the harmonic stack into a brass formant
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(freq * 1.6, time);
  bp.frequency.exponentialRampToValueAtTime(freq * 4, time + 0.18);
  bp.frequency.exponentialRampToValueAtTime(freq * 2.6, time + 0.9);

  // Vibrato — silent for the first 150 ms, then ramps to ~25 cents
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.5;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(0, time);
  vibratoDepth.gain.setValueAtTime(0, time + 0.15);
  vibratoDepth.gain.linearRampToValueAtTime(25, time + 0.45);
  vibrato.connect(vibratoDepth);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.42 * intensity, time + 0.04);
  env.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.35);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.25);
  bp.connect(env);
  env.connect(this.master);

  const harmonics = [
    { mult: 1, gain: 0.35 },
    { mult: 2, gain: 0.55 },
    { mult: 3, gain: 0.5 },
    { mult: 4, gain: 0.35 },
    { mult: 5, gain: 0.22 },
    { mult: 6, gain: 0.12 },
  ];
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    vibratoDepth.connect(osc.detune); // detune is in cents → mult-agnostic
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(bp);
    osc.start(time);
    osc.stop(time + 1.4);
  }
  vibrato.start(time);
  vibrato.stop(time + 1.4);
}

function voiceBassGuitar(freq, intensity, time) {
  const ctx = this.audioCtx;
  const f = freq / 4;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = f;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(2200, time);
  filter.frequency.exponentialRampToValueAtTime(400, time + 0.35);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
  osc.connect(filter);
  filter.connect(env);
  env.connect(this.master);
  osc.start(time);
  osc.stop(time + 1.1);
}

function voicePiano(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.7 },
    { mult: 2, gain: 0.32 },
    { mult: 3, gain: 0.16 },
    { mult: 4, gain: 0.08 },
    { mult: 5, gain: 0.04 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 2.1);
  }
}

function voiceHarpsichord(freq, intensity, time) {
  const ctx = this.audioCtx;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = freq * 1.5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.35 * intensity, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
  osc.connect(filter);
  filter.connect(env);
  env.connect(this.master);
  osc.start(time);
  osc.stop(time + 0.8);
}

function voiceBell(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.5 },
    { mult: 2.0, gain: 0.25 },
    { mult: 2.76, gain: 0.3 },
    { mult: 5.4, gain: 0.15 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.30 * intensity, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, time + 3.0);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 3.1);
  }
}

// Pad: 7 detuned sawtooths through two filter stages, a slow LFO sweeping
// the cutoff, and a wider detune spread for super-saw width.
function voicePadClassic(freq, intensity, time) {
  const ctx = this.audioCtx;
  const detunes = [-22, -14, -7, 0, 7, 14, 22];

  // Filter 1: lowpass swept by slow LFO
  const filter1 = ctx.createBiquadFilter();
  filter1.type = "lowpass";
  filter1.frequency.value = 1100;
  filter1.Q.value = 2.0;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.22;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 750;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter1.frequency);

  // Filter 2: gentle highpass anchors the bottom
  const filter2 = ctx.createBiquadFilter();
  filter2.type = "highpass";
  filter2.frequency.value = freq * 0.7;
  filter2.Q.value = 0.6;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.20 * intensity, time + 0.55);
  env.gain.linearRampToValueAtTime(0.15 * intensity, time + 1.5);
  env.gain.exponentialRampToValueAtTime(0.001, time + 3.4);

  filter1.connect(filter2);
  filter2.connect(env);
  env.connect(this.master);

  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = d;
    const g = ctx.createGain();
    g.gain.value = 1 / detunes.length;
    osc.connect(g);
    g.connect(filter1);
    osc.start(time);
    osc.stop(time + 3.5);
  }
  lfo.start(time);
  lfo.stop(time + 3.5);
}

function voicePluck(freq, intensity, time) {
  const ctx = this.audioCtx;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.55);
  osc.connect(env);
  env.connect(this.master);
  osc.start(time);
  osc.stop(time + 0.65);
}

// =================================================================
//  MIX 2 — Orchestra
// =================================================================

// Helper: bowed-string voice — sawtooth body, lowpass formant, vibrato.
function bowedString(ctx, master, freq, intensity, time, opts) {
  const {
    octave = 0,
    cutoff = 3000,
    Q = 1.2,
    attack = 0.12,
    release = 1.6,
    vibratoDepth = 18,
    vibratoRate = 5.0,
    peakGain = 0.32,
    detunes = [-6, 0, 6],
  } = opts;
  const f = freq * Math.pow(2, octave);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = Q;

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = vibratoRate;
  const vDepth = ctx.createGain();
  vDepth.gain.setValueAtTime(0, time);
  vDepth.gain.setValueAtTime(0, time + attack * 0.5);
  vDepth.gain.linearRampToValueAtTime(vibratoDepth, time + attack + 0.25);
  vibrato.connect(vDepth);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(peakGain * intensity, time + attack);
  env.gain.linearRampToValueAtTime(peakGain * 0.7 * intensity, time + attack + 0.3);
  env.gain.exponentialRampToValueAtTime(0.001, time + attack + release);

  filter.connect(env);
  env.connect(master);

  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.detune.value = d;
    vDepth.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.value = 1 / detunes.length;
    osc.connect(g);
    g.connect(filter);
    osc.start(time);
    osc.stop(time + attack + release + 0.1);
  }
  vibrato.start(time);
  vibrato.stop(time + attack + release + 0.1);
}

function voiceCello(freq, intensity, time) {
  bowedString(this.audioCtx, this.master, freq, intensity, time, {
    octave: -1, cutoff: 1800, Q: 1.6, attack: 0.14, release: 1.8,
    vibratoDepth: 14, vibratoRate: 4.5, peakGain: 0.36,
  });
}

function voiceViolin(freq, intensity, time) {
  bowedString(this.audioCtx, this.master, freq, intensity, time, {
    octave: 0, cutoff: 4500, Q: 1.0, attack: 0.09, release: 1.4,
    vibratoDepth: 22, vibratoRate: 5.8, peakGain: 0.28,
  });
}

// Flute: triangle body + breath noise mixed through a bandpass formant.
function voiceFlute(freq, intensity, time) {
  const ctx = this.audioCtx;

  // Body — triangle is naturally hollow
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  const osc2g = ctx.createGain();
  osc2g.gain.value = 0.18;
  osc2.connect(osc2g);

  // Breath — continuous bandpassed noise
  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx);
  breath.loop = true;
  const breathBP = ctx.createBiquadFilter();
  breathBP.type = "bandpass";
  breathBP.frequency.value = freq * 2.5;
  breathBP.Q.value = 0.9;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.07;
  breath.connect(breathBP);
  breathBP.connect(breathGain);

  // Soft vibrato
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5;
  const vDepth = ctx.createGain();
  vDepth.gain.setValueAtTime(0, time);
  vDepth.gain.linearRampToValueAtTime(12, time + 0.4);
  vibrato.connect(vDepth);
  vDepth.connect(osc.detune);
  vDepth.connect(osc2.detune);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.30 * intensity, time + 0.10);
  env.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.5);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.4);

  osc.connect(env);
  osc2g.connect(env);
  breathGain.connect(env);
  env.connect(this.master);

  osc.start(time);
  osc.stop(time + 1.5);
  osc2.start(time);
  osc2.stop(time + 1.5);
  breath.start(time);
  breath.stop(time + 1.5);
  vibrato.start(time);
  vibrato.stop(time + 1.5);
}

// Oboe: sawtooth+square through narrow bandpass for nasal reediness.
function voiceOboe(freq, intensity, time) {
  const ctx = this.audioCtx;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 2.2;
  bp.Q.value = 3;

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.5;
  const vDepth = ctx.createGain();
  vDepth.gain.setValueAtTime(0, time);
  vDepth.gain.linearRampToValueAtTime(15, time + 0.3);
  vibrato.connect(vDepth);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.30 * intensity, time + 0.08);
  env.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.4);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.3);
  bp.connect(env);
  env.connect(this.master);

  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = freq;
  const sq = ctx.createOscillator();
  sq.type = "square";
  sq.frequency.value = freq;
  const sqg = ctx.createGain();
  sqg.gain.value = 0.4;
  sq.connect(sqg);
  vDepth.connect(saw.detune);
  vDepth.connect(sq.detune);
  saw.connect(bp);
  sqg.connect(bp);

  saw.start(time);
  saw.stop(time + 1.4);
  sq.start(time);
  sq.stop(time + 1.4);
  vibrato.start(time);
  vibrato.stop(time + 1.4);
}

// String Pad: lush orchestral section — many detuned sawtooths, slow attack.
function voiceStringPad(freq, intensity, time) {
  const ctx = this.audioCtx;
  const detunes = [-18, -11, -4, 4, 11, 18];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.7);
  env.gain.linearRampToValueAtTime(0.17 * intensity, time + 2.0);
  env.gain.exponentialRampToValueAtTime(0.001, time + 3.5);

  filter.connect(env);
  env.connect(this.master);

  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = d;
    const g = ctx.createGain();
    g.gain.value = 1 / detunes.length;
    osc.connect(g);
    g.connect(filter);
    osc.start(time);
    osc.stop(time + 3.6);
  }
}

function voiceGlockenspiel(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.5 },
    { mult: 3, gain: 0.4 },
    { mult: 5.4, gain: 0.3 },
    { mult: 8.9, gain: 0.18 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.35 * intensity, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.8);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult * 2; // octave up for glock register
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 1.9);
  }
}

// Timpani: low pitched sine + filtered noise tail for a tuned drum thump.
function voiceTimpani(freq, intensity, time) {
  const ctx = this.audioCtx;
  const f = freq / 4;

  // Pitched body — sine with slight pitch drop
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(f * 1.15, time);
  osc.frequency.exponentialRampToValueAtTime(f, time + 0.08);
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = f * 1.5;
  const osc2g = ctx.createGain();
  osc2g.gain.value = 0.3;
  osc2.connect(osc2g);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0, time);
  bodyEnv.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.005);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, time + 1.4);
  osc.connect(bodyEnv);
  osc2g.connect(bodyEnv);
  bodyEnv.connect(this.master);

  // Stick thump — short low-passed noise
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const nlp = ctx.createBiquadFilter();
  nlp.type = "lowpass";
  nlp.frequency.value = 600;
  const nEnv = ctx.createGain();
  nEnv.gain.setValueAtTime(0.35 * intensity, time);
  nEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  n.connect(nlp);
  nlp.connect(nEnv);
  nEnv.connect(this.master);

  osc.start(time);
  osc.stop(time + 1.5);
  osc2.start(time);
  osc2.stop(time + 1.5);
  n.start(time);
  n.stop(time + 0.1);
}

// =================================================================
//  MIX 3 — Synthwave
// =================================================================

function voiceSubBass(freq, intensity, time) {
  const ctx = this.audioCtx;
  const f = freq / 4;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = f;
  const sub = ctx.createOscillator();
  sub.type = "triangle";
  sub.frequency.value = f * 0.5;
  const subg = ctx.createGain();
  subg.gain.value = 0.5;
  sub.connect(subg);

  const shaper = makeShaper(ctx, 6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.4);

  osc.connect(shaper);
  subg.connect(shaper);
  shaper.connect(env);
  env.connect(this.master);
  osc.start(time);
  osc.stop(time + 1.5);
  sub.start(time);
  sub.stop(time + 1.5);
}

function voiceSawLead(freq, intensity, time) {
  const ctx = this.audioCtx;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(freq * 8, time);
  filter.frequency.exponentialRampToValueAtTime(freq * 3, time + 0.6);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.35 * intensity, time + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.1);

  filter.connect(env);
  env.connect(this.master);
  for (const d of [-7, 0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = d;
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + 1.2);
  }
}

function voiceSquareLead(freq, intensity, time) {
  const ctx = this.audioCtx;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq * 6;
  filter.Q.value = 2;

  // PWM-like wobble via two slightly-detuned squares
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.30 * intensity, time + 0.01);
  env.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.3);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.0);

  filter.connect(env);
  env.connect(this.master);

  const a = ctx.createOscillator();
  a.type = "square";
  a.frequency.value = freq;
  const b = ctx.createOscillator();
  b.type = "square";
  b.frequency.value = freq;
  b.detune.value = 8;
  a.connect(filter);
  b.connect(filter);
  a.start(time);
  a.stop(time + 1.1);
  b.start(time);
  b.stop(time + 1.1);
}

// FM Bell: true 2-operator FM synthesis (sine modulating sine's frequency).
function voiceFMBell(freq, intensity, time) {
  const ctx = this.audioCtx;
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;
  const modulator = ctx.createOscillator();
  modulator.type = "sine";
  modulator.frequency.value = freq * 3.5;
  const modDepth = ctx.createGain();
  modDepth.gain.setValueAtTime(freq * 4, time);
  modDepth.gain.exponentialRampToValueAtTime(freq * 0.2, time + 1.5);
  modulator.connect(modDepth);
  modDepth.connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, time + 2.5);
  carrier.connect(env);
  env.connect(this.master);

  modulator.start(time);
  modulator.stop(time + 2.6);
  carrier.start(time);
  carrier.stop(time + 2.6);
}

// Analog Pad: alternate take — slow attack, chorus-y from detune+phase offset.
function voiceAnalogPad(freq, intensity, time) {
  const ctx = this.audioCtx;
  const detunes = [-20, -12, -5, 5, 12, 20];

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500;
  filter.Q.value = 1.5;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.3;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 600;
  lfo.connect(lfoDepth);
  lfoDepth.connect(filter.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.5);
  env.gain.linearRampToValueAtTime(0.16 * intensity, time + 1.8);
  env.gain.exponentialRampToValueAtTime(0.001, time + 3.2);
  filter.connect(env);
  env.connect(this.master);

  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = d;
    const g = ctx.createGain();
    g.gain.value = 1 / detunes.length;
    osc.connect(g);
    g.connect(filter);
    osc.start(time);
    osc.stop(time + 3.3);
  }
  lfo.start(time);
  lfo.stop(time + 3.3);
}

function voiceChime(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.5 },
    { mult: 2.5, gain: 0.35 },
    { mult: 4.7, gain: 0.25 },
    { mult: 7.1, gain: 0.18 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.28 * intensity, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, time + 3.5);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 3.6);
  }
}

// Clap: three quick bandpassed noise bursts staggered for the classic
// 808-clap "ch-ch-chk" texture.
function voiceClap(freq, intensity, time) {
  const ctx = this.audioCtx;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1500;
  bp.Q.value = 2;
  bp.connect(this.master);

  for (let i = 0; i < 3; i++) {
    const t = time + i * 0.012;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.45 * intensity, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(env);
    env.connect(bp);
    n.start(t);
    n.stop(t + 0.05);
  }
  // Body tail
  const tail = ctx.createBufferSource();
  tail.buffer = noiseBuffer(ctx);
  const tailEnv = ctx.createGain();
  tailEnv.gain.setValueAtTime(0.22 * intensity, time + 0.036);
  tailEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  tail.connect(tailEnv);
  tailEnv.connect(bp);
  tail.start(time + 0.036);
  tail.stop(time + 0.26);
}

// =================================================================
//  MIX 4 — World
// =================================================================

function voiceSitar(freq, intensity, time) {
  const ctx = this.audioCtx;
  const src = ctx.createBufferSource();
  src.buffer = karplusBuffer(ctx, freq, 1.8, 0.997);

  // Resonant body bandpass for sitar shimmer
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 3;
  bp.Q.value = 4;
  const bpGain = ctx.createGain();
  bpGain.gain.value = 0.5;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.45 * intensity, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.8);

  src.connect(bp);
  bp.connect(bpGain);
  bpGain.connect(env);
  src.connect(env);
  env.connect(this.master);
  src.start(time);
}

function voiceKoto(freq, intensity, time) {
  const ctx = this.audioCtx;
  const src = ctx.createBufferSource();
  src.buffer = karplusBuffer(ctx, freq, 1.4, 0.991);

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = freq * 0.8;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.4 * intensity, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.4);

  src.connect(hp);
  hp.connect(env);
  env.connect(this.master);
  src.start(time);
}

// Bansuri: bamboo flute — strong breath component, soft body.
function voiceBansuri(freq, intensity, time) {
  const ctx = this.audioCtx;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = freq;
  const osc2g = ctx.createGain();
  osc2g.gain.value = 0.25;
  osc2.connect(osc2g);

  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx);
  breath.loop = true;
  const bbp = ctx.createBiquadFilter();
  bbp.type = "bandpass";
  bbp.frequency.value = freq * 3;
  bbp.Q.value = 0.7;
  const bg = ctx.createGain();
  bg.gain.value = 0.14;
  breath.connect(bbp);
  bbp.connect(bg);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 4.5;
  const vDepth = ctx.createGain();
  vDepth.gain.setValueAtTime(0, time);
  vDepth.gain.linearRampToValueAtTime(20, time + 0.5);
  vibrato.connect(vDepth);
  vDepth.connect(osc.detune);
  vDepth.connect(osc2.detune);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.28 * intensity, time + 0.14);
  env.gain.linearRampToValueAtTime(0.20 * intensity, time + 0.6);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.6);

  osc.connect(env);
  osc2g.connect(env);
  bg.connect(env);
  env.connect(this.master);

  osc.start(time);
  osc.stop(time + 1.7);
  osc2.start(time);
  osc2.stop(time + 1.7);
  breath.start(time);
  breath.stop(time + 1.7);
  vibrato.start(time);
  vibrato.stop(time + 1.7);
}

function voiceKalimba(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.6 },
    { mult: 2, gain: 0.25 },
    { mult: 4, gain: 0.12 },
    { mult: 6.3, gain: 0.08 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.38 * intensity, time + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 1.2);
  }
}

// Tanpura: drone — sustained, layered octaves with very slow envelope.
function voiceTanpura(freq, intensity, time) {
  const ctx = this.audioCtx;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.Q.value = 1;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.24 * intensity, time + 0.4);
  env.gain.linearRampToValueAtTime(0.18 * intensity, time + 2.0);
  env.gain.exponentialRampToValueAtTime(0.001, time + 4.0);
  filter.connect(env);
  env.connect(this.master);

  const partials = [
    { mult: 0.5, type: "sawtooth", detune: 0, gain: 0.5 },
    { mult: 1, type: "sawtooth", detune: -6, gain: 0.4 },
    { mult: 1, type: "sawtooth", detune: 6, gain: 0.4 },
    { mult: 1.5, type: "sine", detune: 0, gain: 0.3 }, // fifth shimmer
    { mult: 2, type: "triangle", detune: 0, gain: 0.25 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = freq * p.mult;
    osc.detune.value = p.detune;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g);
    g.connect(filter);
    osc.start(time);
    osc.stop(time + 4.1);
  }
}

// Marimba: warm sine + 4th harmonic, fast exponential decay.
function voiceMarimba(freq, intensity, time) {
  const ctx = this.audioCtx;
  const harmonics = [
    { mult: 1, gain: 0.75 },
    { mult: 4, gain: 0.30 },
    { mult: 9.2, gain: 0.10 },
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.42 * intensity, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
  env.connect(this.master);
  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * h.mult;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(env);
    osc.start(time);
    osc.stop(time + 1.2);
  }
}

// Tabla: pitched skin hit — bandpassed noise tuned to the note.
function voiceTabla(freq, intensity, time) {
  const ctx = this.audioCtx;

  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(freq * 2, time);
  bp.frequency.exponentialRampToValueAtTime(freq * 1.2, time + 0.18);
  bp.Q.value = 8;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(0.55 * intensity, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

  n.connect(bp);
  bp.connect(env);
  env.connect(this.master);
  n.start(time);
  n.stop(time + 0.6);

  // Pitched body underneath for warmth
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 0.5, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.35, time + 0.2);
  const oenv = ctx.createGain();
  oenv.gain.setValueAtTime(0.30 * intensity, time);
  oenv.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
  osc.connect(oenv);
  oenv.connect(this.master);
  osc.start(time);
  osc.stop(time + 0.55);
}

// =================================================================
//  THE MIXES
// =================================================================
// Order: bass — mid — mid — high — high — sustained — percussive.
// Keeping the position roles consistent across mixes makes A/B swapping
// feel coherent (the second slot always sings, the last always pings).

const INSTRUMENT_MIXES = [
  {
    name: "Classic",
    emoji: "🎵",
    instruments: [
      { name: "Trumpet",     emoji: "🎺", voice: voiceTrumpetClassic },
      { name: "Bass Guitar", emoji: "🎸", voice: voiceBassGuitar },
      { name: "Piano",       emoji: "🎹", voice: voicePiano },
      { name: "Harpsichord", emoji: "🎼", voice: voiceHarpsichord },
      { name: "Bell",        emoji: "🔔", voice: voiceBell },
      { name: "Pad",         emoji: "☁️", voice: voicePadClassic },
      { name: "Pluck",       emoji: "🪕", voice: voicePluck },
    ],
  },
  {
    name: "Orchestra",
    emoji: "🎻",
    instruments: [
      { name: "Cello",         emoji: "🎻", voice: voiceCello },
      { name: "Violin",        emoji: "🎶", voice: voiceViolin },
      { name: "Oboe",          emoji: "🪈", voice: voiceOboe },
      { name: "Flute",         emoji: "🌬️", voice: voiceFlute },
      { name: "Glockenspiel",  emoji: "✨", voice: voiceGlockenspiel },
      { name: "String Pad",    emoji: "🎼", voice: voiceStringPad },
      { name: "Timpani",       emoji: "🥁", voice: voiceTimpani },
    ],
  },
  {
    name: "Synthwave",
    emoji: "🌌",
    instruments: [
      { name: "Sub Bass",    emoji: "🔉", voice: voiceSubBass },
      { name: "Saw Lead",    emoji: "🪚", voice: voiceSawLead },
      { name: "Square Lead", emoji: "🔲", voice: voiceSquareLead },
      { name: "FM Bell",     emoji: "🛎️", voice: voiceFMBell },
      { name: "Chime",       emoji: "💫", voice: voiceChime },
      { name: "Analog Pad",  emoji: "🌠", voice: voiceAnalogPad },
      { name: "Clap",        emoji: "👏", voice: voiceClap },
    ],
  },
  {
    name: "World",
    emoji: "🪕",
    instruments: [
      { name: "Tabla",     emoji: "🪘", voice: voiceTabla },
      { name: "Sitar",     emoji: "🪕", voice: voiceSitar },
      { name: "Koto",      emoji: "🎴", voice: voiceKoto },
      { name: "Bansuri",   emoji: "🎐", voice: voiceBansuri },
      { name: "Kalimba",   emoji: "🪵", voice: voiceKalimba },
      { name: "Tanpura",   emoji: "🕉️", voice: voiceTanpura },
      { name: "Marimba",   emoji: "🌳", voice: voiceMarimba },
    ],
  },
];
