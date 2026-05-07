// layout.js
class Layout {
  constructor() {
    this.buttonEmojis = ["👽", "🥚", "✨", "🌀", "🔊", "🏓", null];
    this.buttons = document.querySelectorAll(".button");
    this.init();
  }

  init() {
    this.initializeButtons();
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
