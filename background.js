// background.js — interactive dot field with two layers:
//   - small sharp pink/magenta dots on a tight grid
//   - soft cyan halos on a wider, offset grid (pre-rendered as a radial gradient sprite)
// Both layers pulse together (3s breath cycle) and brighten near the cursor.

class BackgroundField {
  constructor(opts = {}) {
    this.musicalMesh = opts.musicalMesh || null;
    this.canvas = document.createElement("canvas");
    this.canvas.id = "bg-canvas";
    Object.assign(this.canvas.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      zIndex: "-1",
      pointerEvents: "none",
    });
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.mouse = { x: -9999, y: -9999 };
    this.startTime = performance.now();

    // Layer geometry — ~12% denser than the original 17/34 spacing
    this.pinkSpacing = 15;
    this.cyanSpacing = 30;
    this.influenceRadius = 140;

    // Colors lifted from the original CSS palette.
    // Both layers shift on grid clicks to mirror the musical key/octave change.
    // The shift is propagated as an outward wavefront from the click point
    // (see this.wave below), not as a global ease.
    this.pinkColor = [240, 60, 159];
    this.cyanColor = [8, 177, 243];
    this.targetPinkColor = [240, 60, 159];
    this.targetCyanColor = [8, 177, 243];

    // Pre-render the cyan halo as a sprite so each dot is a true soft gradient,
    // not a flat-alpha arc. drawImage of a sprite is also faster than per-dot gradient.
    this.haloSprite = this.buildHaloSprite(this.cyanColor);
    this.targetHaloSprite = this.haloSprite;
    this.haloSpriteRadius = this.haloSprite.width / 2;

    // Wavefront state — set when setKeyColor is called with an origin.
    // The front expands at waveSpeed px/sec; waveBand sets the soft transition
    // width at the leading edge so dots cross from old→new color over a band
    // rather than a hard ring.
    this.wave = null;
    this.waveSpeed = 900;
    this.waveBand = 140;

    this.resize();

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
      }
    });

    // Mirror touch position to the same mouse slot so the dot field and
    // musical mesh react to finger movement exactly like mouse hover.
    window.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (t) {
        this.mouse.x = t.clientX;
        this.mouse.y = t.clientY;
      }
    }, { passive: true });
    window.addEventListener("touchend", () => {
      this.mouse.x = -9999;
      this.mouse.y = -9999;
    }, { passive: true });

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildHaloSprite(color) {
    const r = 16;
    const size = r * 2;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const cctx = c.getContext("2d");
    const [cr, cg, cb] = color;
    const grad = cctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.65)`);
    grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.25)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, size, size);
    return c;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.pinkDots = this.makeGrid(w, h, this.pinkSpacing, 0);
    // Cyan layer offset diagonally by half its spacing so the two grids interleave
    this.cyanDots = this.makeGrid(w, h, this.cyanSpacing, this.cyanSpacing / 2);
  }

  makeGrid(w, h, spacing, offset) {
    const dots = [];
    const start = spacing / 2 + offset;
    for (let x = start; x < w + spacing; x += spacing) {
      for (let y = start; y < h + spacing; y += spacing) {
        dots.push({ x, y, excitement: 0 });
      }
    }
    return dots;
  }

  // Boost excitement for dots within a larger radius — used as visual
  // feedback when the user clicks to change the mesh's key.
  // Pink dots get an amplified boost since their render dampens excitement by 0.15.
  flashAt(x, y, radius = 240) {
    const rSq = radius * radius;

    // Cyan layer — standard intensity (already prominent in render)
    for (let i = 0; i < this.cyanDots.length; i++) {
      const d = this.cyanDots[i];
      const dx = d.x - x;
      const dy = d.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < rSq) {
        const intensity = 1 - Math.sqrt(distSq) / radius;
        if (intensity > d.excitement) d.excitement = intensity;
      }
    }

    // Pink layer — amplified intensity to overcome the 0.15 damping in render
    const pinkBoost = 6;
    for (let i = 0; i < this.pinkDots.length; i++) {
      const d = this.pinkDots[i];
      const dx = d.x - x;
      const dy = d.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < rSq) {
        const intensity = (1 - Math.sqrt(distSq) / radius) * pinkBoost;
        if (intensity > d.excitement) d.excitement = intensity;
      }
    }
  }

  exciteDots(dots, mx, my, rSq, r) {
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const dx = d.x - mx;
      const dy = d.y - my;
      const distSq = dx * dx + dy * dy;
      if (distSq < rSq) {
        const intensity = 1 - Math.sqrt(distSq) / r;
        const eased = intensity * intensity;
        if (eased > d.excitement) d.excitement = eased;
      }
      d.excitement *= 0.97;
    }
  }

  // Sound→color mapping called from the grid click handler.
  // Palette is drawn from the *iridescent* spectrum (nacreous cloud / cloud
  // iridescence) — pastel mint, cyan, lavender, pink, peach — rather than
  // the saturated rainbow wheel. keyOffset (0..11 semitones) walks the hue
  // through that cycle; octaveOffset (-1..+1) shifts pastel lightness.
  // (originX, originY) — when supplied, the new color expands outward from
  // that point as a visible wavefront. Without an origin, the change is
  // applied instantly (used at startup).
  setKeyColor(keyOffset, octaveOffset, originX, originY) {
    // If a previous wave is still in flight, snap it to its target so the
    // new wave starts from a clean uniform baseline.
    if (this.wave) {
      this.cyanColor = this.targetCyanColor.slice();
      this.pinkColor = this.targetPinkColor.slice();
      this.haloSprite = this.targetHaloSprite;
      this.wave = null;
    }

    // Start at pink (~315°) and walk forward 30°/semitone so consecutive
    // keys land on adjacent iridescent bands: pink → peach → soft yellow →
    // mint → cyan → lavender → back to pink.
    const hue = (315 + keyOffset * 30) % 360;
    const lightness = 62 + octaveOffset * 8;
    this.targetCyanColor = this.hslToRgb(hue, 88, lightness);
    // Pink layer tracks an *analogous* neighbor (+60°) on the same iridescent
    // ring — adjacent bands in real iridescence sit next to each other, not
    // across the wheel — so the two layers read as one coordinated pearly arc.
    this.targetPinkColor = this.hslToRgb((hue + 60) % 360, 86, 64);
    this.targetHaloSprite = this.buildHaloSprite(this.targetCyanColor);

    if (originX !== undefined && originY !== undefined) {
      this.wave = { x: originX, y: originY, startTime: performance.now() };
    } else {
      this.cyanColor = this.targetCyanColor.slice();
      this.pinkColor = this.targetPinkColor.slice();
      this.haloSprite = this.targetHaloSprite;
    }
  }

  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [
      Math.round(255 * f(0)),
      Math.round(255 * f(8)),
      Math.round(255 * f(4)),
    ];
  }

  animate() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const mx = this.mouse.x;
    const my = this.mouse.y;
    const r = this.influenceRadius;
    const rSq = r * r;

    // 3-second breath cycle, value in [0, 1]
    const t = (performance.now() - this.startTime) / 1000;
    const breathe = (Math.sin(t * 2.094) + 1) / 2;

    // Wavefront state for this frame. waveRadius grows linearly from the
    // click point; per-dot progress p = clamp((waveRadius - dist)/band, 0, 1)
    // — old color at p=0, new color at p=1, soft band in between.
    let waveRadius = 0;
    if (this.wave) {
      waveRadius =
        ((performance.now() - this.wave.startTime) / 1000) * this.waveSpeed;
      // Once the front has cleared the farthest corner + the band, the entire
      // grid is on the new color — adopt the target and end the wave.
      const corners = [[0, 0], [w, 0], [0, h], [w, h]];
      let maxD = 0;
      for (let i = 0; i < 4; i++) {
        const dx = corners[i][0] - this.wave.x;
        const dy = corners[i][1] - this.wave.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxD) maxD = d;
      }
      if (waveRadius > maxD + this.waveBand) {
        this.cyanColor = this.targetCyanColor.slice();
        this.pinkColor = this.targetPinkColor.slice();
        this.haloSprite = this.targetHaloSprite;
        this.wave = null;
      }
    }

    // Update excitement for both layers
    this.exciteDots(this.pinkDots, mx, my, rSq, r);
    this.exciteDots(this.cyanDots, mx, my, rSq, r);

    // Feed excitement updates to the musical mesh — cyan dots are the "keys"
    if (this.musicalMesh) {
      this.musicalMesh.update(this.cyanDots, w, h);
    }

    // --- Cyan halo layer (drawn first, behind) — this layer carries the mouse reaction ---
    const oldSprite = this.haloSprite;
    const newSprite = this.targetHaloSprite;
    const sr = this.haloSpriteRadius;
    const wave = this.wave;
    const band = this.waveBand;
    for (let i = 0; i < this.cyanDots.length; i++) {
      const d = this.cyanDots[i];

      // If a wave is sweeping over this dot, the band itself acts like a
      // bow wave: dots in the middle of their old→new transition (p≈0.5)
      // get a bell-curve excitement boost so the front visibly glows.
      let p = 0;
      let waveGlow = 0;
      if (wave) {
        const wdx = d.x - wave.x;
        const wdy = d.y - wave.y;
        const dist = Math.sqrt(wdx * wdx + wdy * wdy);
        p = Math.max(0, Math.min(1, (waveRadius - dist) / band));
        if (p > 0 && p < 1) waveGlow = Math.sin(p * Math.PI);
      }

      // Combine pointer excitement with wavefront glow (capped near 1).
      const eFinal = Math.min(1.4, d.excitement + waveGlow);
      // Big growth on excitement: ~6 at rest → ~30 at full excitement
      const haloR = 6 + breathe * 2 + eFinal * 24;
      const scale = haloR / sr;
      const drawSize = sr * 2 * scale;
      const baseAlpha = Math.min(1, 0.7 + eFinal * 1.2);
      const dx = d.x - drawSize / 2;
      const dy = d.y - drawSize / 2;

      if (wave) {
        if (p < 1) {
          ctx.globalAlpha = baseAlpha * (1 - p);
          ctx.drawImage(oldSprite, dx, dy, drawSize, drawSize);
        }
        if (p > 0) {
          ctx.globalAlpha = baseAlpha * p;
          ctx.drawImage(newSprite, dx, dy, drawSize, drawSize);
        }
      } else {
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(oldSprite, dx, dy, drawSize, drawSize);
      }
    }
    ctx.globalAlpha = 1;

    // --- Pink dot layer (drawn on top) — stays subtle, just the breathing pulse ---
    const op = this.pinkColor;
    const np = this.targetPinkColor;
    for (let i = 0; i < this.pinkDots.length; i++) {
      const d = this.pinkDots[i];

      let p = 0;
      let waveGlow = 0;
      if (wave) {
        const wdx = d.x - wave.x;
        const wdy = d.y - wave.y;
        const dist = Math.sqrt(wdx * wdx + wdy * wdy);
        p = Math.max(0, Math.min(1, (waveRadius - dist) / band));
        if (p > 0 && p < 1) waveGlow = Math.sin(p * Math.PI);
      }

      // Pink only weakly responds to the pointer (×0.15) but fully to the
      // wavefront — so the bow wave reads strongly on the small pink dots.
      const e = d.excitement * 0.15 + waveGlow;
      const size = 0.5 + breathe * 0.3 + e * 1.8;
      const alpha = Math.min(1, 0.4 + breathe * 0.15 + e * 0.45);

      let cr1 = op[0], cg1 = op[1], cb1 = op[2];
      if (wave) {
        cr1 = (op[0] + (np[0] - op[0]) * p) | 0;
        cg1 = (op[1] + (np[1] - op[1]) * p) | 0;
        cb1 = (op[2] + (np[2] - op[2]) * p) | 0;
      }

      ctx.fillStyle = `rgba(${cr1},${cg1},${cb1},${alpha})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(this.animate);
  }
}
