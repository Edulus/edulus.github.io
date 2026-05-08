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
    // pink targets the complementary hue of cyan so the two layers always read
    // as a coordinated pair. Each color eases toward its target each frame.
    this.pinkColor = [240, 60, 159];
    this.cyanColor = [8, 177, 243];
    this.targetCyanColor = [8, 177, 243];
    this.targetPinkColor = [240, 60, 159];

    // Pre-render the cyan halo as a sprite so each dot is a true soft gradient,
    // not a flat-alpha arc. drawImage of a sprite is also faster than per-dot gradient.
    this.haloSprite = this.buildHaloSprite();
    this.haloSpriteRadius = this.haloSprite.width / 2;

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

  buildHaloSprite() {
    const r = 16;
    const size = r * 2;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const cctx = c.getContext("2d");
    const [cr, cg, cb] = this.cyanColor;
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
      d.excitement *= 0.93;
    }
  }

  // Sound→color mapping called from the grid click handler.
  // keyOffset (0..11 semitones) walks the hue around the color wheel;
  // octaveOffset (-1..+1) brightens or darkens the dot.
  setKeyColor(keyOffset, octaveOffset) {
    const hue = (195 + keyOffset * 30) % 360;
    const lightness = 50 + octaveOffset * 12;
    this.targetCyanColor = this.hslToRgb(hue, 92, lightness);
    // Pink tracks the complementary hue (180° opposite) at the original
    // pink saturation/lightness so it stays a "small structural" accent.
    this.targetPinkColor = this.hslToRgb((hue + 180) % 360, 86, 59);
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

    // Ease cyanColor toward the target (set on each grid click) and rebuild
    // the halo sprite when it actually shifted. Converges in ~0.5s at 60fps.
    let colorChanged = false;
    for (let i = 0; i < 3; i++) {
      const diff = this.targetCyanColor[i] - this.cyanColor[i];
      if (Math.abs(diff) > 0.5) {
        this.cyanColor[i] += diff * 0.08;
        colorChanged = true;
      } else if (this.cyanColor[i] !== this.targetCyanColor[i]) {
        this.cyanColor[i] = this.targetCyanColor[i];
        colorChanged = true;
      }
    }
    if (colorChanged) this.haloSprite = this.buildHaloSprite();

    // Pink also eases toward its target — no sprite to rebuild since the pink
    // dots are drawn directly with fillStyle each frame.
    for (let i = 0; i < 3; i++) {
      const diff = this.targetPinkColor[i] - this.pinkColor[i];
      if (Math.abs(diff) > 0.5) {
        this.pinkColor[i] += diff * 0.08;
      } else if (this.pinkColor[i] !== this.targetPinkColor[i]) {
        this.pinkColor[i] = this.targetPinkColor[i];
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
    const sprite = this.haloSprite;
    const sr = this.haloSpriteRadius;
    for (let i = 0; i < this.cyanDots.length; i++) {
      const d = this.cyanDots[i];
      const e = d.excitement;
      // Big growth on excitement: ~6 at rest → ~30 at full excitement
      const haloR = 6 + breathe * 2 + e * 24;
      const scale = haloR / sr;
      const drawSize = sr * 2 * scale;
      // Strong opacity boost when excited so the blue really pops
      ctx.globalAlpha = Math.min(1, 0.7 + e * 1.2);
      ctx.drawImage(
        sprite,
        d.x - drawSize / 2,
        d.y - drawSize / 2,
        drawSize,
        drawSize
      );
    }
    ctx.globalAlpha = 1;

    // --- Pink dot layer (drawn on top) — stays subtle, just the breathing pulse ---
    const [cr1, cg1, cb1] = this.pinkColor;
    for (let i = 0; i < this.pinkDots.length; i++) {
      const d = this.pinkDots[i];
      // Minimal mouse reaction — let the blue do the work
      const e = d.excitement * 0.15;
      const size = 0.5 + breathe * 0.3 + e * 1.5;
      const alpha = 0.4 + breathe * 0.15 + e * 0.15;

      ctx.fillStyle = `rgba(${cr1},${cg1},${cb1},${alpha})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(this.animate);
  }
}
