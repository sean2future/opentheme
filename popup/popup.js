const SITE = "spotify";
const STORAGE_KEY = "themeOverrides";
const DEFAULTS_PATH = "themes/spotify.css";
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

const rows = [...document.querySelectorAll("color-row")];
const entries = rows.map(row => ({
  name: row.id,
  input: row.querySelector(".color-input")
}));

const exportButton = document.querySelector("#export-button");
const importButton = document.querySelector("#import-button");
const resetButton = document.querySelector("#reset-button");
const importFile = document.querySelector("#import-file");
const status = document.querySelector("#status");

let tabId;
let defaults = {};
let overrides = {};
let writeQueue = Promise.resolve();
let syncingUi = false;

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function enabled(ready) {
  for (const { input } of entries) input.disabled = !ready;

  for (const button of [
    exportButton,
    importButton,
    resetButton
  ]) {
    button.disabled = !ready;
  }
}

function unsupported(
  message = "OpenTheme doesn't support this website yet."
) {
  const main = document.querySelector(".main");
  main.replaceChildren();

  const label = document.createElement("h2");
  label.textContent = message;
  label.style.cssText =
    "font-size:16px;font-weight:500;text-align:center;padding:24px";

  main.append(label);
  main.style.cssText =
    "display:flex;justify-content:center;align-items:center;";

  document.querySelector(".footer").hidden = true;
}

const isHexColor = color =>
  typeof color === "string" && HEX_COLOR.test(color);

async function loadDefaults() {
  const response = await fetch(
    chrome.runtime.getURL(DEFAULTS_PATH)
  );

  if (!response.ok) {
    throw new Error(
      "Could not read the Spotify theme stylesheet."
    );
  }

  const css = await response.text();
  const root = css.match(/:root\s*\{([^}]*)\}/);

  if (!root) {
    throw new Error(
      "Missing :root defaults in Spotify stylesheet."
    );
  }

  const colors = Object.fromEntries(
    [...root[1].matchAll(
      /(--theme-[\w-]+)\s*:\s*(#[\da-f]{3,8})\s*;/gi
    )]
      .filter(([, , color]) => isHexColor(color))
      .map(([, name, color]) => [name, color])
  );

  for (const { name } of entries) {
    if (!Object.hasOwn(colors, name)) {
      throw new Error(
        `Missing default color for ${name}.`
      );
    }
  }

  return Object.fromEntries(
    entries.map(({ name }) => [name, colors[name]])
  );
}

function cleanOverrides(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return {};
  }

  const next = {};

  for (const [name, color] of Object.entries(raw)) {
    if (
      !Object.hasOwn(defaults, name) ||
      !isHexColor(color)
    ) {
      continue;
    }

    if (
      color.toLowerCase() !==
      defaults[name].toLowerCase()
    ) {
      next[name] = color;
    }
  }

  return next;
}

function currentColors() {
  return { ...defaults, ...overrides };
}

function applyAccent(hex) {
  document.documentElement.style.setProperty(
    "--user-accent",
    hex
  );

  let value = hex.slice(1);

  if (value.length === 3 || value.length === 4) {
    value = [...value]
      .map(char => char + char)
      .join("");
  }

  const [r, g, b] = [0, 2, 4].map(i =>
    parseInt(value.slice(i, i + 2), 16)
  );

  const alpha = value.length === 8
    ? parseInt(value.slice(6, 8), 16) / 255
    : 1;

  const channels = [r, g, b].map(channel => {
    const adjusted =
      (channel * alpha + (1 - alpha) * 255) / 255;

    return adjusted <= .04045
      ? adjusted / 12.92
      : ((adjusted + .055) / 1.055) ** 2.4;
  });

  const luminance =
    .2126 * channels[0] +
    .7152 * channels[1] +
    .0722 * channels[2];

  document.documentElement.style.setProperty(
    "--user-accent-text",
    luminance > .179 ? "#171717" : "#ffffff"
  );
}

function displayTheme() {
  const colors = currentColors();

  syncingUi = true;

  try {
    for (const { name, input } of entries) {
      input.value = colors[name];

      // Refresh Coloris preview squares.
      input.dispatchEvent(
        new Event("input", { bubbles: true })
      );
    }
  } finally {
    syncingUi = false;
  }

  applyAccent(colors["--theme-accent"]);
}

function previewTheme() {
  chrome.tabs.sendMessage(tabId, {
    type: "openTheme:apply",
    overrides: { ...overrides }
  }).catch(error => {
    console.warn(
      "OpenTheme: preview couldn't reach Spotify",
      error
    );
  });
}

function saveOverrides(next) {
  const snapshot = { ...next };

  writeQueue = writeQueue
    .catch(() => {})
    .then(() =>
      Object.keys(snapshot).length
        ? chrome.storage.local.set({
            [STORAGE_KEY]: snapshot
          })
        : chrome.storage.local.remove(STORAGE_KEY)
    );

  return writeQueue;
}

function exportTheme() {
  const data = {
    format: "OpenTheme",
    version: 1,
    site: SITE,
    colors: currentColors()
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2) + "\n"],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "opentheme-spotify.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showStatus("Theme exported.");
}

function parseImport(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Theme file must contain a JSON object."
    );
  }

  if (data.site && data.site !== SITE) {
    throw new Error(
      "This theme was made for a different website."
    );
  }

  const colors = data.colors ?? data.theme ?? data;

  if (
    !colors ||
    typeof colors !== "object" ||
    Array.isArray(colors)
  ) {
    throw new Error(
      "Theme colors must be a JSON object."
    );
  }

  const next = { ...defaults };
  let count = 0;

  for (const [name, color] of Object.entries(colors)) {
    if (!Object.hasOwn(defaults, name)) continue;

    if (!isHexColor(color)) {
      throw new Error(
        `Invalid hex color for ${name}.`
      );
    }

    next[name] = color;
    count++;
  }

  if (!count) {
    throw new Error(
      "No supported colors found in this file."
    );
  }

  return {
    overrides: cleanOverrides(next),
    count
  };
}

async function importTheme(file) {
  if (!file) return;

  if (file.size > 100_000) {
    showStatus("Theme file is too large.", true);
    return;
  }

  try {
    const data = JSON.parse(await file.text());
    const result = parseImport(data);

    await saveOverrides(result.overrides);

    overrides = result.overrides;

    displayTheme();
    previewTheme();

    showStatus(`Imported ${result.count} colors.`);
  } catch (error) {
    console.error("OpenTheme: import failed", error);

    showStatus(
      `Import failed: ${error.message}`,
      true
    );
  }
}

async function resetTheme() {
  if (!confirm(
    "Reset all Spotify theme colors to their defaults?"
  )) {
    return;
  }

  try {
    await saveOverrides({});

    overrides = {};

    displayTheme();
    previewTheme();

    showStatus("Theme restored to defaults.");
  } catch (error) {
    console.error("OpenTheme: reset failed", error);

    showStatus("Could not reset the theme.", true);
  }
}

async function initialize() {
  enabled(false);

  try {
    // Only initialize for supported websites.
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (
      !tab?.id ||
      !tab.url?.startsWith("https://open.spotify.com/")
    ) {
      unsupported();
      return;
    }

    tabId = tab.id;

    // Verify that the content script is available.
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: "openTheme:ping" }
      );

      if (response?.site !== SITE) {
        throw new Error("Wrong content script");
      }
    } catch {
      unsupported(
        "Refresh Spotify, then reopen OpenTheme."
      );
      return;
    }

    if (!chrome.storage?.local) {
      throw new Error(
        "Storage permission missing. Add 'storage' to manifest.json and reload the extension."
      );
    }

    defaults = await loadDefaults();

    const saved = await chrome.storage.local.get(
      STORAGE_KEY
    );

    overrides = cleanOverrides(saved[STORAGE_KEY]);

    Coloris({
      el: ".color-input",
      wrap: true,
      format: "hex",
      alpha: true
    });

    displayTheme();

    for (const { name, input } of entries) {
      input.addEventListener("input", () => {
        if (syncingUi) return;

        const color = input.value.trim();

        if (!isHexColor(color)) return;

        if (
          color.toLowerCase() ===
          defaults[name].toLowerCase()
        ) {
          delete overrides[name];
        } else {
          overrides[name] = color;
        }

        if (name === "--theme-accent") {
          applyAccent(color);
        }

        previewTheme();
        showStatus("");

        saveOverrides(overrides).catch(error => {
          console.error(
            "OpenTheme: couldn't save theme",
            error
          );

          showStatus(
            "Could not save theme settings.",
            true
          );
        });
      });
    }

    exportButton.addEventListener(
      "click",
      exportTheme
    );

    importButton.addEventListener("click", () => {
      importFile.click();
    });

    importFile.addEventListener("change", () => {
      void importTheme(importFile.files[0]);
      importFile.value = "";
    });

    resetButton.addEventListener("click", () => {
      void resetTheme();
    });

    enabled(true);
  } catch (error) {
    console.error(
      "OpenTheme: failed to initialize",
      error
    );

    showStatus(
      `Failed to load theme: ${error.message}`,
      true
    );
  }
}

void initialize();
