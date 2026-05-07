// layout.js
class Layout {
  constructor() {
    this.buttonEmojis = ["👽", "🥚", "✨", "🌀", "🔊", "🏓", null];
    this.buttons = document.querySelectorAll(".button");
    this.init();
  }

  init() {
    this.initializeButtons();
    this.scaleContainer();
    window.addEventListener("resize", () => this.scaleContainer());
  }

  // Scale the hex container down so it fits the viewport on small screens.
  // CSS zoom affects layout (unlike transform:scale), so the flexbox centering
  // continues to work correctly without any margin compensation.
  scaleContainer() {
    const el = document.querySelector(".container");
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // On phones, cap the hex at 72% of viewport width so there's open canvas
    // above/below/around it for touch-to-music interaction.
    // On wider screens, just subtract 16px of edge padding.
    const maxWidth = vw < 600 ? vw * 0.72 : vw - 16;
    const available = Math.min(maxWidth, vh - 70);
    const scale = Math.min(1, available / 500);
    el.style.zoom = scale;
  }

  initializeButtons() {
    this.buttons.forEach((button, index) => {
      if (this.buttonEmojis[index] !== null) {
        button.textContent = this.buttonEmojis[index];
      }
    });
  }

  getButtons() {
    return this.buttons;
  }

  getButtonEmojis() {
    return this.buttonEmojis;
  }
}
