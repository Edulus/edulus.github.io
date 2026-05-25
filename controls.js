// controls.js — invisible-until-hover slot bars hugging the left and
// right edges of the page. Each slot mirrors the bottom InstrumentSelector
// pattern: hidden by default, faint white tint on hover, persistent tint
// when active. The seed-music panel is registered alongside the tuner
// panels so the "only one panel open" rule applies uniformly.
//
// LEFT bar (audio):
//   1. Sound toggle — the page loads muted; this slot breathes in and
//      out to invite the first click. Click it to turn sound on/off.
//   2. Sound tuner toggle      (active = sound panel open)
//   3. Tonal tuner toggle      (active = tonal panel open)
//   4. Instrument tuner toggle (active = instrument panel open)
//   5. Seed-music panel toggle (active = seed panel open)
//
// RIGHT bar (visual):
//   1. Halo tuner toggle  (active = halo panel open)
//   2. Pip tuner toggle   (active = pip panel open)
//   3. Color tuner toggle (active = color panel open)

class ControlBar {
  constructor({ mesh, tuners, side = "left" }) {
    this.mesh = mesh;
    this.tuners = tuners; // shared dict — both bars close each other's panels
    this.side = side;
    this.slots = [];

    if (side === "left") {
      this.controls = [
        {
          id: "mute",
          // 🔊 = "click for sound" (shown while muted), 🔇 = "click to
          // mute" (shown while sound is on). While muted the slot counts
          // as active, and pulseWhenActive makes it breathe in and out
          // to invite the first click — the page loads muted.
          emoji: () => (this.mesh.enabled ? "🔇" : "🔊"),
          isActive: () => !this.mesh.enabled,
          pulseWhenActive: true,
          onClick: () => this.toggleMute(),
        },
        {
          id: "sound",
          emoji: () => "🎚️",
          isActive: () => !!(this.tuners.sound && this.tuners.sound.isVisible()),
          onClick: () => this.openTuner("sound"),
        },
        {
          id: "tonal",
          emoji: () => "🎶",
          isActive: () => !!(this.tuners.tonal && this.tuners.tonal.isVisible()),
          onClick: () => this.openTuner("tonal"),
        },
        {
          id: "instrument",
          emoji: () => "🎻",
          isActive: () => !!(this.tuners.instrument && this.tuners.instrument.isVisible()),
          onClick: () => this.openTuner("instrument"),
        },
        {
          id: "seed",
          emoji: () => "🌱",
          // Stay lit whenever the panel is open OR the melody is playing
          // — mirrors the InstrumentSelector's behavior of keeping the
          // active instrument's emoji visible, so the user can find the
          // stop control even after closing the panel.
          isActive: () =>
            !!(this.tuners.seed && (this.tuners.seed.isVisible() || this.tuners.seed.playing)),
          onClick: () => this.openTuner("seed"),
        },
      ];
    } else {
      this.controls = [
        {
          id: "halo",
          emoji: () => "☄️",
          isActive: () => !!(this.tuners.halo && this.tuners.halo.isVisible()),
          onClick: () => this.openTuner("halo"),
        },
        {
          id: "pip",
          emoji: () => "🟣",
          isActive: () => !!(this.tuners.pip && this.tuners.pip.isVisible()),
          onClick: () => this.openTuner("pip"),
        },
        {
          id: "color",
          emoji: () => "🎨",
          isActive: () => !!(this.tuners.color && this.tuners.color.isVisible()),
          onClick: () => this.openTuner("color"),
        },
      ];
    }

    this.build();
    this.refresh();
  }

  build() {
    const bar = document.createElement("div");
    const edgeStyle = this.side === "right" ? { right: "0" } : { left: "0" };
    Object.assign(bar.style, {
      position: "fixed",
      top: "0",
      bottom: "60px", // leave the bottom corner to the instrument bar
      width: "60px",
      display: "flex",
      flexDirection: "column",
      // z-index 0 keeps it below the project buttons (z:1) on overlap,
      // matching the bottom InstrumentSelector bar.
      zIndex: "0",
      ...edgeStyle,
    });

    this.controls.forEach((ctrl) => {
      const slot = document.createElement("div");
      slot.className = "control-slot";
      slot.dataset.id = ctrl.id;
      Object.assign(slot.style, {
        flex: "1",
        cursor: ctrl.onClick ? "pointer" : "default",
        backgroundColor: "transparent",
        transition: "background-color 0.25s",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      });

      const emojiEl = document.createElement("div");
      Object.assign(emojiEl.style, {
        fontSize: "32px",
        lineHeight: "1",
        opacity: "0",
        transition: "opacity 0.3s",
        pointerEvents: "none",
      });
      slot.appendChild(emojiEl);

      if (ctrl.onClick) {
        slot.addEventListener("mouseenter", () => {
          slot.style.backgroundColor = "rgba(255,255,255,0.04)";
          // Hovering pauses any invite-pulse so the icon holds steady
          // under the cursor.
          emojiEl.style.animation = "none";
          emojiEl.style.opacity = "0.85";
          emojiEl.textContent = ctrl.emoji();
        });
        slot.addEventListener("mouseleave", () => {
          this.applyActiveState(slot, emojiEl, ctrl);
        });
        slot.addEventListener("click", (e) => {
          // Don't let the click bubble to document — it would retune the
          // musical mesh and emit a wave from the bar position.
          e.stopPropagation();
          ctrl.onClick();
          // Both bars share the same tuners dict, so notify the other bar
          // too. The opposite-side bar's refresh is a no-op for clicks
          // that don't change any panel it owns.
          ControlBar.refreshAll();
        });
      }

      bar.appendChild(slot);
      this.slots.push({ slot, emojiEl, ctrl });
    });

    document.body.appendChild(bar);
    ControlBar._instances = ControlBar._instances || [];
    ControlBar._instances.push(this);
  }

  static refreshAll() {
    for (const inst of (ControlBar._instances || [])) inst.refresh();
  }

  applyActiveState(slot, emojiEl, ctrl) {
    if (ctrl.isActive()) {
      emojiEl.textContent = ctrl.emoji();
      if (ctrl.pulseWhenActive) {
        // The breathing pulse (controlPulse keyframes in animation.css)
        // drives opacity itself; leave the slot untinted so only the
        // icon draws the eye.
        slot.style.backgroundColor = "transparent";
        emojiEl.style.animation = "controlPulse 3s ease-in-out infinite";
      } else {
        slot.style.backgroundColor = "rgba(255,255,255,0.04)";
        emojiEl.style.animation = "none";
        emojiEl.style.opacity = "1";
      }
    } else {
      slot.style.backgroundColor = "transparent";
      emojiEl.style.animation = "none";
      emojiEl.style.opacity = "0";
      emojiEl.textContent = "";
    }
  }

  refresh() {
    for (const { slot, emojiEl, ctrl } of this.slots) {
      this.applyActiveState(slot, emojiEl, ctrl);
    }
  }

  toggleMute() {
    if (this.mesh.enabled) {
      this.mesh.enabled = false;
      // Cancel pending wave-trigger timers so they don't blast out at
      // once when audio resumes.
      if (this.mesh._waveTimers && this.mesh._waveTimers.length) {
        for (const id of this.mesh._waveTimers) clearTimeout(id);
        this.mesh._waveTimers = [];
      }
      if (this.mesh.audioCtx) this.mesh.audioCtx.suspend();
    } else {
      // First-time unmute creates the AudioContext; subsequent unmutes
      // just resume it. Either path leaves us in a state where clicks
      // can ring notes again.
      this.mesh.start();
      this.mesh.enabled = true;
      if (this.mesh.audioCtx && this.mesh.audioCtx.state === "suspended") {
        this.mesh.audioCtx.resume();
      }
    }
  }

  // Toggles the named panel and hides every other registered panel. Both
  // bars share the same tuners dict, so this closes panels owned by the
  // opposite-side bar too — only one panel is ever visible at a time.
  openTuner(id) {
    for (const [tid, tuner] of Object.entries(this.tuners)) {
      if (!tuner) continue;
      if (tid === id) tuner.toggle();
      else tuner.hide();
    }
  }
}
