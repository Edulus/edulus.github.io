// layout.js
export class Layout {
  constructor() {
    this.buttonEmojis = ["👽", "🥚", "✨", "🌀", "🔊"];
    this.buttons = document.querySelectorAll(".button");
    this.init();
  }

  init() {
    this.initializeButtons();
  }

  initializeButtons() {
    this.buttons.forEach((button, index) => {
      button.textContent = this.buttonEmojis[index];
    });
  }

  getButtons() {
    return this.buttons;
  }

  getButtonEmojis() {
    return this.buttonEmojis;
  }
}
