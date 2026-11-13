const iconBg = document.querySelector(".icon-bg")

document.addEventListener("DOMContentLoaded", async () => {
  const rows = [...document.querySelectorAll("color-row")];

  const entries = rows.map(row => ({
    name: row.id,
    input: row.querySelector(".color-input")
  }));

  // disable inputs during initialization.
  entries.forEach(({ input }) => {
    input.disabled = true;
  });

  try {
    // get the active tab.
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      throw new Error("No active tab");
    }

    // request the current CSS variables from content.js.
    const colors = await chrome.tabs.sendMessage(tab.id, {
      type: "getTheme",
      names: entries.map(({ name }) => name)
    });

    // initialize Coloris.
    Coloris({
      el: ".color-input",
      wrap: true,
      format: "hex",
      alpha: true
    });

    // synchronize both text inputs and color previews.
    for (const { name, input } of entries) {
      input.value = colors[name] ?? "";

      input.dispatchEvent(new Event("input", {
        bubbles: true
      }));

      input.disabled = false;
    }

    // Listen for user changes only after initialization.
    for (const { name, input } of entries) {
      input.addEventListener("input", () => {
        chrome.tabs.sendMessage(tab.id, {
          type: "updateTheme",
          name,
          value: input.value
        }).catch(console.error);

        if (name == "--theme-accent") {
            iconBg.style.cssText = `
                fill: ${input.value};
            `;
        }
      });
    }

  } catch (error) {
    console.error("Failed to initialize theme:", error);

    const main = document.querySelector(".main");

    main.innerHTML = `
        <h2 style="width: 300px; text-align: center; font-weight: 500">
            OpenTheme doesn't support this website yet.
        </h2>
    `;

    main.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
    `;
  }
});
