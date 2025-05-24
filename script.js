document.addEventListener("DOMContentLoaded", () => {
  const mouseGlow = document.getElementById('mouse-glow');
  let mouseMoved = false; // Flag to check if mouse has moved

  const buttonEmojis = ["👽", "🥚", "✨", "🌀", "🔊"];
  const buttons = document.querySelectorAll(".button");

  if (mouseGlow) { // Ensure mouseGlow element exists
    document.body.addEventListener('mousemove', (e) => {
      if (!mouseMoved) {
        mouseGlow.style.opacity = '1';
        mouseMoved = true;
      }
      mouseGlow.style.left = `${e.clientX}px`;
      mouseGlow.style.top = `${e.clientY}px`;
    });

    document.body.addEventListener('mouseleave', () => {
      if (mouseMoved) { // Only hide if it was made visible
        mouseGlow.style.opacity = '0';
        mouseMoved = false; // Reset flag for next time mouse enters
      }
    });

    // Optional: Re-show if it enters again (or rely on mousemove)
    // document.body.addEventListener('mouseenter', () => {
    //   if (!mouseMoved) {
    //     // mouseGlow.style.opacity = '1'; // Or wait for mousemove
    //   }
    // });
  }

  buttons.forEach((button, index) => {
    button.textContent = buttonEmojis[index];
    button.addEventListener("click", (e) => {
      e.preventDefault();
      animateButton(button, buttonEmojis[index], button.href);
    });

    // Add mouseenter and mouseleave listeners for enhanced glow
    button.addEventListener('mouseenter', () => {
      button.classList.add('button-enhanced-glow');
      if (mouseGlow && mouseMoved) { // Only affect mouseGlow if it's active
        mouseGlow.style.transition = 'opacity 0.1s ease'; // Quicker transition
        mouseGlow.style.opacity = '0.3'; // Dim the general glow
      }
    });

    button.addEventListener('mouseleave', () => {
      button.classList.remove('button-enhanced-glow');
      if (mouseGlow && mouseMoved) { // Only affect mouseGlow if it's active
        mouseGlow.style.transition = 'opacity 0.3s ease'; // Restore original transition
        mouseGlow.style.opacity = '1'; // Restore general glow
      }
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
