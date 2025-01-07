document.addEventListener("DOMContentLoaded", () => {
  const buttonEmojis = ["👽", "🥚", "✨", "🌀", "🔊"];
  const buttons = document.querySelectorAll(".button");

  buttons.forEach((button, index) => {
    button.textContent = buttonEmojis[index];
    button.addEventListener("click", (e) => {
      e.preventDefault();
      animateButton(button, buttonEmojis[index], button.href);
    });
  });
});

function animateButton(button, emoji, url) {
  const animatedEmoji = document.createElement("div");
  animatedEmoji.textContent = emoji;
  animatedEmoji.style.position = "fixed";
  animatedEmoji.style.fontSize = "48px";
  animatedEmoji.style.zIndex = "1000";

  const rect = button.getBoundingClientRect();
  animatedEmoji.style.left = `${rect.left + rect.width / 2}px`;
  animatedEmoji.style.top = `${rect.top + rect.height / 2}px`;

  document.body.appendChild(animatedEmoji);

  const animation = animatedEmoji.animate(
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
    animatedEmoji.remove();
    window.location.href = url;
  };
}
