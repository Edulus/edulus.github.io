# Project Summary: edulus.github.io

This project is a personal launch page for Edward Kasimir. It serves as a central hub to navigate to various other projects hosted on `edulus.github.io`.

## File Functionality:

### `index.html`
This is the main HTML file that defines the structure of the web page. It includes:
- Five buttons, each intended to link to a different project.
- Tooltips associated with each button, which become visible on hover to provide a short description of the linked project.
- Links to the `styles.css` file for styling and the `script.js` file for dynamic behavior.

### `script.js`
This JavaScript file handles the interactive elements of the page:
- It dynamically assigns emoji icons to each of the five buttons.
- It attaches event listeners to each button. On click, it triggers a visual animation: the button's emoji appears to expand and fade out from the button's position.
- After the animation completes, the script redirects the user to the URL associated with the clicked button.

### `styles.css`
This CSS file is responsible for the visual presentation of the page:
- It defines the overall layout, centering the content on the page.
- It includes a dynamic background animation featuring pulsing dots.
- It styles the buttons, including their size, color, borders, and hover effects (slight scaling and background color change).
- It styles the tooltips, controlling their appearance, positioning (below the respective button), and visibility (appearing on button hover).
- It arranges the buttons in a specific pentagonal-like layout using CSS `order` and `margin` properties for the button wrapper elements.

### `README.md`
The `README.md` file is currently minimal and only contains the title of the repository: `edulus.github.io`.

---
