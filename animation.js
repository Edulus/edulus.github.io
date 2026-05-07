// animation.js
class Animation {
  constructor(layout) {
    this.layout = layout;
    this.init();
  }

  init() {
    this.setupClickAnimations();
  }

  setupClickAnimations() {
    const buttons = this.layout.getButtons();
    const buttonEmojis = this.layout.getButtonEmojis();

    buttons.forEach((button, index) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        this.animateButton(button, buttonEmojis[index], button.href);
      });
    });
  }

  animateButton(button, emoji, url) {
    const img = button.querySelector("img");
    let animatedEl;

    if (img) {
      animatedEl = img.cloneNode(true);
      animatedEl.style.width = "94px";
      animatedEl.style.height = "94px";
      animatedEl.style.objectFit = "contain";
    } else {
      animatedEl = document.createElement("div");
      animatedEl.textContent = emoji;
      animatedEl.style.fontSize = "64px";
      animatedEl.style.lineHeight = "1";
    }

    animatedEl.style.position = "fixed";
    animatedEl.style.zIndex = "1000";
    animatedEl.style.pointerEvents = "none";

    const rect = button.getBoundingClientRect();
    animatedEl.style.left = `${rect.left + rect.width / 2}px`;
    animatedEl.style.top = `${rect.top + rect.height / 2}px`;

    document.body.appendChild(animatedEl);

    const animation = animatedEl.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: "translate(-50%, -50%) scale(8)", opacity: 0 },
      ],
      {
        duration: 350,
        easing: "ease-in",
      }
    );

    animation.onfinish = () => {
      animatedEl.remove();
      window.location.href = url;
    };
  }
}
