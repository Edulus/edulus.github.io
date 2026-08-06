// tuner.js — live tuning UI for the dot-field cursor effect.
// Instantiation is driven by index.html, which reads ?tune from the URL:
//   ?tune=1   → halo panel only (cursor-reactive big dots)
//   ?tune=2   → pip panel only (small fixed dots around each halo)
//   ?tune=all → both panels, stacked
// End users browsing the bare URL see no panel.
//
// Each panel opens in a Simple view (a few plain-language controls) and
// can be switched to a Detailed view (every dial) with the toggle that
// sits to the left of the panel title.

class Tuner {
  static SETS = {
    halo: {
      title: "Halo dials",
      accent: "#08b1f3",
      side: "right",
      description:
        "The large glowing dot that tracks your cursor, plus the comet trail that follows it. Adjust how concentrated the kernel is, how long the trail lingers behind the cursor, the shape of the falloff, how each individual dot's halo is rendered, and the separate comet-tail overlay's length, size, and brightness.",
      dials: [
        { key: "influenceRadius",  label: "Influence radius",   min: 40,   max: 250,  step: 5,     fixed: 0, tooltip: "Radius (px) around the cursor where halos start glowing. Smaller = tight spotlight; larger = wider illuminated zone." },
        { key: "decayFactor",      label: "Trail decay",        min: 0.85, max: 0.99, step: 0.005, fixed: 3, tooltip: "How slowly excited halos fade after the cursor passes. Higher = longer-lingering trail; lower = trail snaps off quickly." },
        { key: "haloGrowth",       label: "Halo growth",        min: 5,    max: 40,   step: 1,     fixed: 0, tooltip: "How much each halo grows at peak excitement. Higher = big blobs around the cursor; lower = halos stay subtle." },
        { key: "falloffPower",     label: "Falloff power",      min: 1.0,  max: 5.0,  step: 0.1,   fixed: 1, tooltip: "Shape of the excitement curve. Higher = sharper concentration at the center; lower = broader, softer kernel." },
        { key: "haloCenterAlpha",  label: "Sprite center α",    min: 0.3,  max: 1.0,  step: 0.02,  fixed: 2, tooltip: "Opacity at the very center of each halo's gradient sprite. Higher = denser cores; lower = wispy translucent halos." },
        { key: "haloMidstopPos",   label: "Sprite midstop pos", min: 0.10, max: 0.60, step: 0.02,  fixed: 2, tooltip: "Where the halo gradient transitions from bright to soft. Higher = wider bright core, sharper edge; lower = tight core, long soft tail." },
        { key: "haloMidstopAlpha", label: "Sprite midstop α",   min: 0.0,  max: 0.5,  step: 0.02,  fixed: 2, tooltip: "Opacity at the midpoint of each halo's gradient — controls how brightness fades from center to edge." },
        { key: "trailMaxAge",      label: "Comet tail length",  min: 4,    max: 40,   step: 1,     fixed: 0, tooltip: "How many frames a comet-tail bead survives before vanishing. Higher = longer trailing tail; lower = short, tight tail." },
        { key: "trailMinSpacing",  label: "Comet bead spacing", min: 1,    max: 15,   step: 1,     fixed: 0, tooltip: "Minimum distance (px) the cursor must move before a new comet-tail bead is recorded. Lower = smoother, denser tail; higher = sparser beads." },
        { key: "trailBeadRadius",  label: "Comet bead size",    min: 2,    max: 20,   step: 1,     fixed: 0, tooltip: "Radius (px) of a freshly recorded comet-tail bead, before it shrinks with age." },
        { key: "trailBeadAlpha",   label: "Comet bead α",       min: 0.0,  max: 1.0,  step: 0.05,  fixed: 2, tooltip: "Opacity of a freshly recorded comet-tail bead, before it fades with age." },
        { key: "trailHeadRadius",  label: "Comet head size",    min: 0,    max: 12,   step: 1,     fixed: 0, tooltip: "Radius (px) of the bright white dot marking the live cursor position at the head of the comet tail. 0 hides it." },
      ],
      simpleDials: [
        { key: "influenceRadius", label: "Glow size",     min: 40,   max: 250,  step: 5,     fixed: 0, tooltip: "How wide the glowing area around your cursor reaches." },
        { key: "decayFactor",     label: "Trail length",  min: 0.85, max: 0.99, step: 0.005, fixed: 3, tooltip: "How long the glow lingers behind your cursor as you move." },
        { key: "haloGrowth",      label: "Glow strength", min: 5,    max: 40,   step: 1,     fixed: 0, tooltip: "How much the dots swell and brighten right under your cursor." },
        { key: "falloffPower",    label: "Focus",         min: 1.0,  max: 5.0,  step: 0.1,   fixed: 1, tooltip: "Low = a soft, spread-out glow. High = a tight, concentrated spotlight." },
      ],
    },
    pip: {
      title: "Pip dials",
      accent: "#f03c9f",
      side: "right",
      description:
        "The smaller satellite dots scattered between halos. Adjust their density across the screen, how strongly they react to the cursor, their resting size and opacity, and their color relative to the halos.",
      dials: [
        { key: "pinkSpacing",     label: "Pip grid spacing", min: 8,    max: 30,   step: 1,    fixed: 0, tooltip: "Distance (px) between pips. Smaller = many tiny dots filling space; larger = sparser, more architectural pattern." },
        { key: "pipHueOffset",    label: "Hue offset (°)",   min: 0,    max: 360,  step: 5,    fixed: 0, tooltip: "Color rotation between pips and halos on the color wheel. 180° = true complement; 60° = analogous; 0° = matching hue." },
        { key: "pipResponse",     label: "Cursor response",  min: 0.0,  max: 2.0,  step: 0.05, fixed: 2, tooltip: "How strongly pips react to the cursor. 0 = static; 1 = full response; >1 = exaggerated response." },
        { key: "pipRestSize",     label: "Resting size",     min: 0.0,  max: 3.0,  step: 0.1,  fixed: 1, tooltip: "Radius (px) of each pip when idle, far from the cursor." },
        { key: "pipExcitedSize",  label: "Excited size",     min: 0.0,  max: 5.0,  step: 0.1,  fixed: 1, tooltip: "Additional size pips grow to when the cursor passes over them." },
        { key: "pipRestAlpha",    label: "Resting α",        min: 0.0,  max: 1.0,  step: 0.02, fixed: 2, tooltip: "Opacity of pips when idle. Lower = pips fade into the background; higher = always crisply visible." },
        { key: "pipExcitedAlpha", label: "Excited α",        min: 0.0,  max: 1.0,  step: 0.02, fixed: 2, tooltip: "Extra opacity added to pips when the cursor excites them." },
      ],
      simpleDials: [
        { key: "pinkSpacing",  label: "Dot spacing",     min: 8,   max: 30,  step: 1,    fixed: 0, tooltip: "How far apart the small background dots sit." },
        { key: "pipResponse",  label: "Cursor reaction", min: 0.0, max: 2.0, step: 0.05, fixed: 2, tooltip: "How strongly the small dots respond when your cursor passes." },
        { key: "pipRestSize",  label: "Dot size",        min: 0.0, max: 3.0, step: 0.1,  fixed: 1, tooltip: "How large the small dots are when resting." },
        { key: "pipRestAlpha", label: "Dot visibility",  min: 0.0, max: 1.0, step: 0.02, fixed: 2, tooltip: "How clearly the small dots show against the background." },
        { key: "pipHueOffset", label: "Dot color shift", min: 0,   max: 360, step: 5,    fixed: 0, tooltip: "Shifts the small dots' color away from the glow's color." },
      ],
    },
    tonal: {
      title: "Tonal dials",
      accent: "#a366f1",
      description:
        "The musical system the page plays in. Pick a scale (Western, gamelan, maqam, Japanese, etc.), a root note, a reference tuning, and how the screen maps to pitch and octaves. Cross-cultural — float-valued scales are microtonal, not snapped to 12-TET.",
      dials: [
        { key: "scaleIndex",     label: "Scale",            min: 0,   max: (typeof MusicalMesh !== "undefined" ? MusicalMesh.SCALES.length - 1 : 9), step: 1,  fixed: 0, displayValues: (typeof MusicalMesh !== "undefined" ? MusicalMesh.SCALES.map(s => s.name) : []), tooltip: "Tonal system / scale shape. Major Pent (China gōng, blues), Slendro and Pelog (Java), Hirajoshi (Japan), Maqam Rast (Middle East), plus Western diatonic, chromatic, and whole tone." },
        { key: "rootKey",        label: "Root key",         min: 0,   max: 11,    step: 1,  fixed: 0, displayValues: (typeof MusicalMesh !== "undefined" ? MusicalMesh.KEY_NAMES : []),                       tooltip: "Starting note of the scale. Shifts every pitch by this many semitones — combines with the click-driven key offset." },
        { key: "tuningA4",       label: "Tuning A4 (Hz)",   min: 380, max: 480,   step: 1,  fixed: 0, tooltip: "Reference frequency for the note A4. 440 is the modern standard; 432 is a popular 'natural' alternative; 415 was common in Baroque music." },
        { key: "baseOctave",     label: "Top octave",       min: 2,   max: 9,     step: 1,  fixed: 0, tooltip: "Octave number that plays at the top edge of the screen. Higher = the whole field plays higher; lower = lower." },
        { key: "octaveSpan",     label: "Octave span",      min: 1,   max: 7,     step: 1,  fixed: 0, tooltip: "How many octaves the screen height covers. 1 = single octave from top to bottom; 7 = a very wide pitch range." },
        { key: "notesPerScreen", label: "Notes across",     min: 5,   max: 24,    step: 1,  fixed: 0, tooltip: "How many distinct pitches the screen width is divided into. More = finer pitch control but smaller buckets; fewer = clearer steps." },
        { key: "toneStride",     label: "Interval stride",  min: 0,   max: 5,     step: 1,  fixed: 0, tooltip: "How many scale degrees separate adjacent x-positions. 0 = unison (all dots in a row play the same pitch); 1 = neighbors (densest, often dissonant); 2+ = wider intervals (thirds, fifths) that ring more consonantly when two dots fire at once." },
        { key: "keyLocked",      label: "Click locks key",  min: 0,   max: 1,     step: 1,  fixed: 0, displayValues: ["Free", "Locked"], tooltip: "Free = clicks on the grid retune the key based on position (current behavior). Locked = clicks still emanate a wave but don't change the key." },
      ],
      simpleDials: [
        { key: "scaleIndex",     label: "Scale",           min: 0, max: (typeof MusicalMesh !== "undefined" ? MusicalMesh.SCALES.length - 1 : 9), step: 1, fixed: 0, displayValues: (typeof MusicalMesh !== "undefined" ? MusicalMesh.SCALES.map(s => s.name) : []), tooltip: "The musical scale — sets the overall mood and flavor." },
        { key: "rootKey",        label: "Key",             min: 0, max: 11, step: 1, fixed: 0, displayValues: (typeof MusicalMesh !== "undefined" ? MusicalMesh.KEY_NAMES : []), tooltip: "The home note everything is centered around." },
        { key: "baseOctave",     label: "Pitch height",    min: 2, max: 9,  step: 1, fixed: 0, tooltip: "How high or low the whole page sounds." },
        { key: "notesPerScreen", label: "Notes across",    min: 5, max: 24, step: 1, fixed: 0, tooltip: "How many separate pitches the screen width is divided into." },
        { key: "keyLocked",      label: "Click locks key", min: 0, max: 1,  step: 1, fixed: 0, displayValues: ["Free", "Locked"], tooltip: "Free = clicking the screen retunes the key. Locked = clicking keeps the key fixed." },
      ],
    },
    color: {
      title: "Color dials",
      accent: "#ff7a59",
      side: "right",
      description:
        "The palette and how it shifts with clicks. Adjust where the color wheel starts, how fast colors rotate as you click horizontally, how brightness shifts vertically, and the saturation/lightness of the halo and pip layers.",
      dials: [
        { key: "colorStartHue",     label: "Starting hue (°)",     min: 0,   max: 360, step: 5, fixed: 0, tooltip: "Where on the color wheel the palette begins, before any key shift. 0° = red, 60° = yellow, 120° = green, 180° = cyan, 240° = blue, 300° = magenta." },
        { key: "colorHueStep",      label: "Hue step / key (°)",   min: 1,   max: 60,  step: 1, fixed: 0, tooltip: "How far the hue rotates with each horizontal click step. 15° × 24 keys = the full wheel wraps once across the screen; 30° = wraps twice." },
        { key: "haloSaturation",    label: "Halo saturation",      min: 0,   max: 100, step: 1, fixed: 0, tooltip: "How colorful the halos are. 0 = gray; 100 = fully saturated." },
        { key: "haloBaseLightness", label: "Halo lightness",       min: 20,  max: 90,  step: 1, fixed: 0, tooltip: "Brightness of the halo color at middle Y. Combined with the per-octave step below to vary between top and bottom of the screen." },
        { key: "lightnessStep",     label: "Lightness / octave",   min: 0,   max: 20,  step: 1, fixed: 0, tooltip: "How much halo brightness shifts with each vertical click step. 0 = uniform brightness; higher values make top noticeably brighter and bottom dimmer." },
        { key: "pipSaturation",     label: "Pip saturation",       min: 0,   max: 100, step: 1, fixed: 0, tooltip: "How colorful the pips are. 0 = gray; 100 = fully saturated." },
        { key: "pipLightness",      label: "Pip lightness",        min: 20,  max: 90,  step: 1, fixed: 0, tooltip: "Brightness of the pip color. Doesn't shift with octave like the halos do." },
      ],
      simpleDials: [
        { key: "colorStartHue",     label: "Base color",     min: 0,  max: 360, step: 5, fixed: 0, tooltip: "Where the palette starts on the color wheel — 0 red, 120 green, 240 blue." },
        { key: "colorHueStep",      label: "Color variety",  min: 1,  max: 60,  step: 1, fixed: 0, tooltip: "How much the color shifts as you click across the screen." },
        { key: "haloSaturation",    label: "Color richness", min: 0,  max: 100, step: 1, fixed: 0, tooltip: "Low = washed-out grays. High = vivid, saturated color." },
        { key: "haloBaseLightness", label: "Brightness",     min: 20, max: 90,  step: 1, fixed: 0, tooltip: "How light or dark the glow colors are." },
      ],
    },
    instrument: {
      title: "Instrument dials",
      accent: "#7ce0a2",
      // No Simple/Detailed split for this panel — there's only one dial,
      // which renders as a radio group rather than a slider (kind: "radio").
      noModeToggle: true,
      description:
        "Pick the curated voice set the bottom bar plays. Each mix is 7 synthesized instruments spanning bass to bell to percussion — Classic (the original Trumpet/Bass/Piano lineup, with improved Trumpet and Pad), Orchestra (strings, winds, glockenspiel, timpani), Synthwave (sub bass, FM bell, super-saw pad, clap), and World (sitar, koto, tabla, tanpura).",
      dials: [
        {
          key: "currentMix",
          label: "Mix",
          kind: "radio",
          min: 0,
          max: (typeof INSTRUMENT_MIXES !== "undefined" ? INSTRUMENT_MIXES.length - 1 : 3),
          step: 1,
          fixed: 0,
          displayValues: (typeof INSTRUMENT_MIXES !== "undefined"
            ? INSTRUMENT_MIXES.map((m) => `${m.emoji} ${m.name}`)
            : []),
          tooltip:
            "Curated 7-voice instrument set. Pick one to swap the whole bottom bar at once — emojis, names, and synthesis all change together.",
        },
      ],
    },
    sound: {
      title: "Sound dials",
      accent: "#f3c308",
      description:
        "The audio produced by the page. Adjust overall loudness, the global lowpass filter, how easily hovering near the cursor triggers tones, and the speed, density, and edge softness of the ripple that emanates from each grid click.",
      dials: [
        { key: "masterVolume",        label: "Master volume",       min: 0.0,  max: 0.5,   step: 0.01, fixed: 2, tooltip: "Overall loudness of all audio. Applied immediately to the master gain." },
        { key: "filterCutoff",        label: "Lowpass cutoff (Hz)", min: 200,  max: 12000, step: 100,  fixed: 0, tooltip: "Frequency above which the global lowpass filter rolls off. Lower = muffled, warmer; higher = bright, sharp." },
        { key: "filterQ",             label: "Filter resonance",    min: 0.1,  max: 5.0,   step: 0.1,  fixed: 1, tooltip: "Resonance (Q) of the lowpass filter. Higher values cause pronounced ringing around the cutoff frequency." },
        { key: "excitementThreshold", label: "Hover sensitivity",   min: 0.10, max: 0.90,  step: 0.05, fixed: 2, tooltip: "Excitement level a dot must reach before it pings on cursor hover. Lower = audio fires constantly; higher = only deliberate sweeps trigger sound." },
        { key: "waveSpeed",           label: "Wave speed (px/s)",   min: 200,  max: 2000,  step: 50,   fixed: 0, tooltip: "Speed of the click ripple in pixels per second. Audio and visual stay locked together." },
        { key: "waveNoteDensity",     label: "Notes per second",    min: 10,   max: 100,   step: 5,    fixed: 0, tooltip: "Maximum notes per second triggered by a click wave. Higher = dense ripple; lower = sparser melodic stream." },
        { key: "waveIntensityFloor",  label: "Edge softness",       min: 0.0,  max: 0.5,   step: 0.02, fixed: 2, tooltip: "Minimum loudness of the farthest notes in the wave. Higher = stays loud to the edges; lower = fades out at the edge." },
      ],
      simpleDials: [
        { key: "masterVolume",        label: "Volume",            min: 0.0,  max: 0.5,   step: 0.01, fixed: 2, tooltip: "Overall loudness of everything you hear." },
        { key: "filterCutoff",        label: "Tone brightness",   min: 200,  max: 12000, step: 100,  fixed: 0, tooltip: "Low = warm and muffled. High = bright and sharp." },
        { key: "excitementThreshold", label: "Hover sensitivity", min: 0.10, max: 0.90,  step: 0.05, fixed: 2, tooltip: "How easily moving near a dot plays a note. Low = very chatty." },
        { key: "waveSpeed",           label: "Ripple speed",      min: 200,  max: 2000,  step: 50,   fixed: 0, tooltip: "How fast the sound ripple spreads out from a click." },
        { key: "waveNoteDensity",     label: "Ripple fullness",   min: 10,   max: 100,   step: 5,    fixed: 0, tooltip: "How many notes the click ripple plays as it spreads." },
      ],
    },
  };

  // Dials that need a side-effect call after their value is written.
  // Halo sprite dials rebuild the sprite; pip grid-spacing reflows the grid;
  // pip hue offset recomputes the color from the current halo hue.
  static SIDE_EFFECTS = {
    haloCenterAlpha:  "rebuildHaloSprites",
    haloMidstopPos:   "rebuildHaloSprites",
    haloMidstopAlpha: "rebuildHaloSprites",
    pinkSpacing:      "regridPinks",
    pipHueOffset:     "rebuildPinkColor",
    masterVolume:     "applyMasterVolume",
    filterCutoff:     "applyFilterCutoff",
    filterQ:          "applyFilterQ",
    waveSpeed:        "syncWaveSpeed",
    scaleIndex:       "setScale",
    currentMix:       "applyMix",
    colorStartHue:     "recomputeColors",
    colorHueStep:      "recomputeColors",
    haloSaturation:    "recomputeColors",
    haloBaseLightness: "recomputeColors",
    lightnessStep:     "recomputeColors",
    pipSaturation:     "recomputeColors",
    pipLightness:      "recomputeColors",
  };

  constructor(field, setKey) {
    this.field = field;
    this.setKey = setKey;
    const config = Tuner.SETS[setKey];
    if (!config) {
      console.warn("[tuner] unknown set:", setKey);
      return;
    }
    this.config = config;
    this.complexDials = config.dials;
    // Curated ≤5-control plain-language view; falls back to the full set
    // for any panel that hasn't defined one.
    this.simpleDials = config.simpleDials || config.dials;
    this.mode = "simple"; // panels open in the friendly view
    this.dials = this.simpleDials;

    // Capture defaults across BOTH dial sets so Reset works in either
    // view. The simple set is a subset, but capturing the union is cheap
    // and keeps reset() correct regardless of the active mode.
    this.defaults = {};
    for (const d of this.complexDials) this.defaults[d.key] = field[d.key];
    for (const d of this.simpleDials) this.defaults[d.key] = field[d.key];

    this.build();
  }

  build() {
    const panel = document.createElement("div");
    this.panel = panel;
    panel.className = "tuner-panel";
    panel.dataset.set = this.setKey;

    // Positioned to clear the 60px-wide ControlBar (+20px gap). Audio
    // panels live on the left, visual panels on the right (set via
    // SETS[setKey].side). The accent stripe sits on the edge nearest
    // the bar so it reads as the panel's "spine". Only one panel is
    // ever visible at a time (the bars enforce this), so no stacking
    // logic is needed.
    const side = this.config.side === "right" ? "right" : "left";
    const edgeStyles = side === "right"
      ? ["right:80px", `border-right:3px solid ${this.config.accent}`]
      : ["left:80px",  `border-left:3px solid ${this.config.accent}`];
    panel.style.cssText = [
      "position:fixed",
      "top:12px",
      ...edgeStyles,
      "z-index:9999",
      "background:rgba(18,20,28,0.88)",
      "color:#fff",
      "font:12px/1.4 Montserrat,sans-serif",
      "padding:12px 14px 10px",
      "border-radius:8px",
      "min-width:240px",
      "box-shadow:0 6px 24px rgba(0,0,0,0.45)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "user-select:none",
      "pointer-events:auto",
      "display:none",
    ].join(";");

    // ---- Header: [Simple/Detailed toggle] [title] [collapse] ----
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px";

    // Two-segment mode toggle, sitting to the left of the title. The lit
    // segment is the view you're in; clicking the other segment swaps to
    // it. Panels always open in Simple — see show(). Panels with
    // noModeToggle (e.g. instrument, with just one radio dial) skip this
    // control entirely.
    if (!this.config.noModeToggle) {
      const modeToggle = document.createElement("div");
      this.modeToggle = modeToggle;
      modeToggle.style.cssText = [
        "flex:none",
        "display:flex",
        `border:1px solid ${this.config.accent}`,
        "border-radius:10px",
        "overflow:hidden",
        "font-size:9px",
        "font-weight:700",
        "letter-spacing:0.04em",
        "text-transform:uppercase",
        "position:relative",
      ].join(";");
      this.attachTooltip(
        modeToggle,
        "Switch between Simple (a few plain-language controls) and Detailed (every dial).",
        "below"
      );
      this.modeSegs = {};
      for (const m of ["simple", "detailed"]) {
        const seg = document.createElement("button");
        seg.textContent = m === "simple" ? "Simple" : "Detailed";
        seg.style.cssText = [
          "background:transparent",
          `color:${this.config.accent}`,
          "border:0",
          "font:inherit",
          "padding:3px 7px",
          "cursor:pointer",
          "white-space:nowrap",
        ].join(";");
        seg.addEventListener("click", () => this.setMode(m));
        modeToggle.appendChild(seg);
        this.modeSegs[m] = seg;
      }
      header.appendChild(modeToggle);
    }

    const title = document.createElement("span");
    title.textContent = this.config.title;
    title.style.cssText = `flex:1;font-weight:700;letter-spacing:0.06em;font-size:11px;text-transform:uppercase;color:${this.config.accent};position:relative;cursor:help`;

    // Hover tooltip — plain-English description of what this panel
    // controls. Lives as an absolutely-positioned child of the title so
    // it appears anchored below the label rather than to the panel.
    if (this.config.description) {
      this.attachTooltip(title, this.config.description, "below");
    }

    const collapse = document.createElement("button");
    collapse.textContent = "–";
    collapse.title = "Collapse";
    collapse.style.cssText = `flex:none;background:transparent;color:${this.config.accent};border:0;font-size:18px;line-height:1;cursor:pointer;padding:0 4px`;

    header.appendChild(title);
    header.appendChild(collapse);
    panel.appendChild(header);

    // Body holds the dial rows, action buttons and feedback line. It is
    // rebuilt by renderDials() each time the Simple/Detailed mode flips.
    this.body = document.createElement("div");
    panel.appendChild(this.body);

    collapse.addEventListener("click", () => {
      const hidden = this.body.style.display === "none";
      this.body.style.display = hidden ? "" : "none";
      collapse.textContent = hidden ? "–" : "+";
    });

    this.renderDials();
    document.body.appendChild(panel);
  }

  // (Re)build the dial rows for the active mode into this.body. Called
  // once at construction and again whenever the mode toggle flips. Slider
  // values are seeded from the live field, so switching modes always
  // shows current settings.
  renderDials() {
    this.body.innerHTML = "";
    this.rows = {};

    for (const d of this.dials) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:8px;position:relative";
      if (d.tooltip) this.attachTooltip(row, d.tooltip, "right");

      // Radio-group rendering for discrete pickers (e.g. instrument mix).
      // Skips the slider + right-aligned value readout since the selected
      // radio is its own indicator.
      if (d.kind === "radio") {
        const header = document.createElement("div");
        header.textContent = d.label;
        header.style.cssText = "margin-bottom:6px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:10px;color:#aaa";
        row.appendChild(header);

        const group = document.createElement("div");
        group.style.cssText = "display:flex;flex-direction:column;gap:2px";
        const groupName = `tuner-${this.setKey}-${d.key}`;
        const radios = [];
        for (let i = d.min; i <= d.max; i += (d.step || 1)) {
          const optLabel = document.createElement("label");
          optLabel.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px;border-radius:4px;transition:background 0.15s";
          optLabel.addEventListener("mouseenter", () => { optLabel.style.background = "rgba(255,255,255,0.06)"; });
          optLabel.addEventListener("mouseleave", () => { optLabel.style.background = "transparent"; });
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = groupName;
          radio.value = i;
          radio.style.accentColor = this.config.accent;
          if (Math.round(this.field[d.key]) === i) radio.checked = true;
          const textSpan = document.createElement("span");
          textSpan.textContent = (d.displayValues && d.displayValues[i]) || String(i);
          const val = i;
          radio.addEventListener("change", () => {
            if (!radio.checked) return;
            this.field[d.key] = val;
            const effect = Tuner.SIDE_EFFECTS[d.key];
            if (effect && typeof this.field[effect] === "function") {
              this.field[effect]();
            }
          });
          optLabel.appendChild(radio);
          optLabel.appendChild(textSpan);
          group.appendChild(optLabel);
          radios.push(radio);
        }
        row.appendChild(group);
        this.body.appendChild(row);
        this.rows[d.key] = { radios, isRadio: true };
        continue;
      }

      const labelRow = document.createElement("div");
      labelRow.style.cssText = "display:flex;justify-content:space-between;margin-bottom:2px";
      const label = document.createElement("span");
      label.textContent = d.label;
      const valueEl = document.createElement("span");
      valueEl.style.cssText = `color:${this.config.accent};font-variant-numeric:tabular-nums`;
      labelRow.appendChild(label);
      labelRow.appendChild(valueEl);

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = d.min;
      slider.max = d.max;
      slider.step = d.step;
      slider.value = this.field[d.key];
      slider.style.cssText = `width:100%;accent-color:${this.config.accent};display:block;margin:0`;

      const writeValue = () => {
        valueEl.textContent = this.formatValue(d, parseFloat(slider.value));
      };
      writeValue();

      slider.addEventListener("input", () => {
        const v = parseFloat(slider.value);
        this.field[d.key] = v;
        writeValue();
        const effect = Tuner.SIDE_EFFECTS[d.key];
        if (effect && typeof this.field[effect] === "function") {
          this.field[effect]();
        }
      });

      row.appendChild(labelRow);
      row.appendChild(slider);
      this.body.appendChild(row);
      this.rows[d.key] = { slider, valueEl };
    }

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:6px;margin-top:10px";
    buttonRow.appendChild(this.makeButton("Copy values", this.config.accent, "#001", () => this.copy()));
    buttonRow.appendChild(this.makeButton("Reset", "#444", "#fff", () => this.reset()));
    this.body.appendChild(buttonRow);

    this.feedback = document.createElement("div");
    this.feedback.style.cssText = "font-size:11px;color:#8d7;margin-top:6px;min-height:14px";
    this.body.appendChild(this.feedback);

    this.updateModeToggle();
  }

  // Flip between the curated Simple view and the full Detailed view,
  // then rebuild the dial rows.
  setMode(mode) {
    if (mode !== "simple" && mode !== "detailed") return;
    if (mode === this.mode) return;
    this.mode = mode;
    this.dials = mode === "simple" ? this.simpleDials : this.complexDials;
    this.renderDials();
  }

  // Light up whichever toggle segment matches the active mode.
  updateModeToggle() {
    if (!this.modeSegs) return;
    for (const m of ["simple", "detailed"]) {
      const active = m === this.mode;
      const seg = this.modeSegs[m];
      seg.style.background = active ? this.config.accent : "transparent";
      seg.style.color = active ? "#001" : this.config.accent;
    }
  }

  show() {
    if (!this.panel) return;
    // Panels always open in the friendly Simple view; reopening a panel
    // resets it back to Simple even if it was left on Detailed.
    this.setMode("simple");
    this.panel.style.display = "";
  }
  hide() { if (this.panel) this.panel.style.display = "none"; }
  toggle() { this.isVisible() ? this.hide() : this.show(); }
  isVisible() { return !!(this.panel && this.panel.style.display !== "none"); }

  // Render a dial's current value as either its named label (if the
  // dial declares displayValues, used for discrete scale/key/toggle
  // pickers) or as a numeric readout to d.fixed decimals.
  formatValue(d, v) {
    if (Array.isArray(d.displayValues)) {
      const i = Math.max(0, Math.min(d.displayValues.length - 1, Math.round(v)));
      return d.displayValues[i];
    }
    return v.toFixed(d.fixed);
  }

  // Attach a fade-in hover tooltip to `host`. Anchor "below" positions
  // the tooltip under the host (used for the panel title); anchor
  // "right" positions it to the right (used for dial rows so it doesn't
  // cover adjacent dials). Caller is responsible for setting the host's
  // position:relative so the absolute child anchors correctly.
  attachTooltip(host, text, anchor) {
    const t = document.createElement("div");
    t.textContent = text;
    // On right-side panels the "right" anchor would push tooltips off the
    // edge of the screen; flip to the left of the host in that case so the
    // dial-row tooltip stays on-screen.
    const onRightPanel = this.config.side === "right";
    const pos = anchor === "right"
      ? (onRightPanel ? "top:0;right:calc(100% + 12px)" : "top:0;left:calc(100% + 12px)")
      : "top:calc(100% + 6px);left:0";
    const accentEdge = (anchor === "right" && onRightPanel)
      ? `border-right:2px solid ${this.config.accent}`
      : `border-left:2px solid ${this.config.accent}`;
    t.style.cssText = [
      "position:absolute",
      pos,
      "width:240px",
      "padding:8px 10px",
      "background:rgba(10,12,18,0.95)",
      "color:#cde",
      "font-weight:400",
      "font-size:11px",
      "line-height:1.45",
      "letter-spacing:0",
      "text-transform:none",
      accentEdge,
      "border-radius:6px",
      "opacity:0",
      "pointer-events:none",
      "transition:opacity 0.2s",
      "z-index:10000",
      "box-shadow:0 4px 16px rgba(0,0,0,0.5)",
    ].join(";");
    host.appendChild(t);
    host.addEventListener("mouseenter", () => { t.style.opacity = "1"; });
    host.addEventListener("mouseleave", () => { t.style.opacity = "0"; });
  }

  makeButton(label, bg, fg, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = [
      "flex:1",
      `background:${bg}`,
      `color:${fg}`,
      "border:0",
      "padding:6px 8px",
      "border-radius:4px",
      "font-weight:700",
      "cursor:pointer",
      "font:inherit",
    ].join(";");
    btn.addEventListener("click", onClick);
    return btn;
  }

  copy() {
    const lines = ["{"];
    for (let i = 0; i < this.dials.length; i++) {
      const d = this.dials[i];
      const v = this.field[d.key];
      const formatted = Number.isInteger(v) ? v.toString() : v.toFixed(d.fixed);
      const comma = i < this.dials.length - 1 ? "," : "";
      lines.push(`  ${d.key}: ${formatted}${comma}`);
    }
    lines.push("}");
    const text = lines.join("\n");
    const done = (msg, color) => {
      this.feedback.textContent = msg;
      this.feedback.style.color = color;
      clearTimeout(this._fbTimer);
      this._fbTimer = setTimeout(() => (this.feedback.textContent = ""), 2200);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => done("Copied " + this.dials.length + " values", "#8d7"))
        .catch(() => done("Copy failed — see console", "#f88"));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done("Copied " + this.dials.length + " values", "#8d7");
      } catch (e) {
        done("Copy failed — see console", "#f88");
      }
      ta.remove();
    }
    console.log("[tuner:" + this.setKey + "] values:\n" + text);
  }

  reset() {
    const sideEffectsToRun = new Set();
    for (const d of this.dials) {
      const v = this.defaults[d.key];
      this.field[d.key] = v;
      const row = this.rows[d.key];
      if (row.isRadio) {
        for (const r of row.radios) r.checked = (parseFloat(r.value) === v);
      } else {
        row.slider.value = v;
        row.valueEl.textContent = this.formatValue(d, v);
      }
      const effect = Tuner.SIDE_EFFECTS[d.key];
      if (effect) sideEffectsToRun.add(effect);
    }
    for (const effect of sideEffectsToRun) {
      if (typeof this.field[effect] === "function") this.field[effect]();
    }
    this.feedback.textContent = "Reset to defaults";
    this.feedback.style.color = "#8d7";
    clearTimeout(this._fbTimer);
    this._fbTimer = setTimeout(() => (this.feedback.textContent = ""), 1500);
  }
}
