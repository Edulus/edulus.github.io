// tuner.js — live tuning UI for the dot-field cursor effect.
// Instantiation is driven by index.html, which reads ?tune from the URL:
//   ?tune=1   → halo panel only (cursor-reactive big dots)
//   ?tune=2   → pip panel only (small fixed dots around each halo)
//   ?tune=all → both panels, stacked
// End users browsing the bare URL see no panel.

class Tuner {
  static SETS = {
    halo: {
      title: "Halo dials",
      accent: "#08b1f3",
      dials: [
        { key: "influenceRadius",  label: "Influence radius",   min: 40,   max: 250,  step: 5,     fixed: 0 },
        { key: "decayFactor",      label: "Trail decay",        min: 0.85, max: 0.99, step: 0.005, fixed: 3 },
        { key: "haloGrowth",       label: "Halo growth",        min: 5,    max: 40,   step: 1,     fixed: 0 },
        { key: "falloffPower",     label: "Falloff power",      min: 1.0,  max: 5.0,  step: 0.1,   fixed: 1 },
        { key: "haloCenterAlpha",  label: "Sprite center α",    min: 0.3,  max: 1.0,  step: 0.02,  fixed: 2 },
        { key: "haloMidstopPos",   label: "Sprite midstop pos", min: 0.10, max: 0.60, step: 0.02,  fixed: 2 },
        { key: "haloMidstopAlpha", label: "Sprite midstop α",   min: 0.0,  max: 0.5,  step: 0.02,  fixed: 2 },
      ],
    },
    pip: {
      title: "Pip dials",
      accent: "#f03c9f",
      dials: [
        { key: "pinkSpacing",     label: "Pip grid spacing", min: 8,    max: 30,   step: 1,    fixed: 0 },
        { key: "pipHueOffset",    label: "Hue offset (°)",   min: 0,    max: 360,  step: 5,    fixed: 0 },
        { key: "pipResponse",     label: "Cursor response",  min: 0.0,  max: 2.0,  step: 0.05, fixed: 2 },
        { key: "pipRestSize",     label: "Resting size",     min: 0.0,  max: 3.0,  step: 0.1,  fixed: 1 },
        { key: "pipExcitedSize",  label: "Excited size",     min: 0.0,  max: 5.0,  step: 0.1,  fixed: 1 },
        { key: "pipRestAlpha",    label: "Resting α",        min: 0.0,  max: 1.0,  step: 0.02, fixed: 2 },
        { key: "pipExcitedAlpha", label: "Excited α",        min: 0.0,  max: 1.0,  step: 0.02, fixed: 2 },
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
    this.dials = config.dials;
    this.defaults = {};
    for (const d of this.dials) this.defaults[d.key] = field[d.key];
    this.build();
  }

  build() {
    const panel = document.createElement("div");
    panel.className = "tuner-panel";
    panel.dataset.set = this.setKey;

    // Stack below any pre-existing tuner panels (for ?tune=all).
    let topOffset = 12;
    for (const p of document.querySelectorAll(".tuner-panel")) {
      topOffset += p.getBoundingClientRect().height + 10;
    }

    panel.style.cssText = [
      "position:fixed",
      `top:${topOffset}px`,
      "left:12px",
      "z-index:9999",
      "background:rgba(18,20,28,0.88)",
      "color:#fff",
      "font:12px/1.4 Montserrat,sans-serif",
      "padding:12px 14px 10px",
      "border-radius:8px",
      `border-left:3px solid ${this.config.accent}`,
      "min-width:240px",
      "box-shadow:0 6px 24px rgba(0,0,0,0.45)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "user-select:none",
      "pointer-events:auto",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px";
    const title = document.createElement("span");
    title.textContent = this.config.title;
    title.style.cssText = `font-weight:700;letter-spacing:0.06em;font-size:11px;text-transform:uppercase;color:${this.config.accent}`;
    const collapse = document.createElement("button");
    collapse.textContent = "–";
    collapse.title = "Collapse";
    collapse.style.cssText = `background:transparent;color:${this.config.accent};border:0;font-size:18px;line-height:1;cursor:pointer;padding:0 4px`;
    header.appendChild(title);
    header.appendChild(collapse);
    panel.appendChild(header);

    const body = document.createElement("div");
    panel.appendChild(body);

    this.rows = {};
    for (const d of this.dials) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:8px";

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
        valueEl.textContent = parseFloat(slider.value).toFixed(d.fixed);
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
      body.appendChild(row);
      this.rows[d.key] = { slider, valueEl };
    }

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:6px;margin-top:10px";
    buttonRow.appendChild(this.makeButton("Copy values", this.config.accent, "#001", () => this.copy()));
    buttonRow.appendChild(this.makeButton("Reset", "#444", "#fff", () => this.reset()));
    body.appendChild(buttonRow);

    this.feedback = document.createElement("div");
    this.feedback.style.cssText = "font-size:11px;color:#8d7;margin-top:6px;min-height:14px";
    body.appendChild(this.feedback);

    collapse.addEventListener("click", () => {
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      collapse.textContent = hidden ? "–" : "+";
    });

    document.body.appendChild(panel);
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
      row.slider.value = v;
      row.valueEl.textContent = v.toFixed(d.fixed);
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
