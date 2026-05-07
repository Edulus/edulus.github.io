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
    // Leave 16px horizontal padding and 70px vertical for the instrument bar.
    const available = Math.min(window.innerWidth - 16, window.innerHeight - 70);
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
