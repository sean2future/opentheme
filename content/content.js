
// Loaded only on Spotify.
const STORAGE_KEY = "themeOverrides";
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const root = document.documentElement;

let appliedOverrides = {};
let pendingChanges = null;
let initialized = false;
let previousAccent = null;
let filterTimer = null;

const filterCache = new Map();

function normalizeOverrides(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([name, color]) =>
      /^--theme-[a-z0-9-]+$/.test(name) &&
      typeof color === "string" &&
      HEX_COLOR.test(color)
    )
  );
}

function parseHex(hex) {
  let value = hex.slice(1);

  if (value.length === 3 || value.length === 4) {
    value = [...value]
      .map(char => char + char)
      .join("");
  }

  return {
    rgb: [0, 2, 4].map(i =>
      parseInt(value.slice(i, i + 2), 16)
    ),
    alpha: value.length === 8
      ? parseInt(value.slice(6, 8), 16) / 255
      : 1
  };
}

const clamp = value =>
  Math.max(0, Math.min(255, value));

// Simulate CSS filters on a black pixel.
// The generated CSS starts with brightness(0)
// to normalize the original icon's color.
function filterColor(p) {
  let rgb = [0, 0, 0];

  const map = fn => {
    rgb = rgb.map(fn);
  };

  const matrix = m => {
    const [r, g, b] = rgb;

    rgb = [
      clamp(r * m[0] + g * m[1] + b * m[2]),
      clamp(r * m[3] + g * m[4] + b * m[5]),
      clamp(r * m[6] + g * m[7] + b * m[8])
    ];
  };

  const invert = p[0] / 100;

  map(v =>
    clamp(v * (1 - 2 * invert) + 255 * invert)
  );

  const sepia = p[1] / 100;

  matrix([
    1 - .607 * sepia,
    .769 * sepia,
    .189 * sepia,

    .349 * sepia,
    1 - .314 * sepia,
    .168 * sepia,

    .272 * sepia,
    .534 * sepia,
    1 - .869 * sepia
  ]);

  const sat = p[2] / 100;

  matrix([
    .213 + .787 * sat,
    .715 - .715 * sat,
    .072 - .072 * sat,

    .213 - .213 * sat,
    .715 + .285 * sat,
    .072 - .072 * sat,

    .213 - .213 * sat,
    .715 - .715 * sat,
    .072 + .928 * sat
  ]);

  const radians = p[3] * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  matrix([
    .213 + .787 * cos - .213 * sin,
    .715 - .715 * cos - .715 * sin,
    .072 - .072 * cos + .928 * sin,

    .213 - .213 * cos + .143 * sin,
    .715 + .285 * cos + .140 * sin,
    .072 - .072 * cos - .283 * sin,

    .213 - .213 * cos - .787 * sin,
    .715 - .715 * cos + .715 * sin,
    .072 + .928 * cos + .072 * sin
  ]);

  map(v => clamp(v * p[4] / 100));

  const contrast = p[5] / 100;

  map(v =>
    clamp((v - 127.5) * contrast + 127.5)
  );

  return rgb;
}

function makeAccentFilter(hex) {
  const { rgb: target, alpha } = parseHex(hex);

  function hsl(rgb) {
    const [r, g, b] = rgb.map(v => v / 255);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const light = (max + min) / 2;

    if (!diff) return [0, 0, light];

    const sat =
      diff / (1 - Math.abs(2 * light - 1));

    let hue;

    if (max === r) {
      hue = ((g - b) / diff + 6) % 6;
    } else if (max === g) {
      hue = (b - r) / diff + 2;
    } else {
      hue = (r - g) / diff + 4;
    }

    return [hue / 6, sat, light];
  }

  const targetHsl = hsl(target);

  function loss(params) {
    const color = filterColor(params);
    const colorHsl = hsl(color);

    const rgbError = color.reduce(
      (sum, c, i) =>
        sum + Math.abs(c - target[i]),
      0
    );

    const hueError = Math.abs(
      colorHsl[0] - targetHsl[0]
    );

    return rgbError + 100 * (
      Math.min(hueError, 1 - hueError) +
      Math.abs(colorHsl[1] - targetHsl[1]) +
      Math.abs(colorHsl[2] - targetHsl[2])
    );
  }

  // Seeded random numbers make calculations
  // reproducible for the same accent color.
  let seed =
    target[0] * 65536 +
    target[1] * 256 +
    target[2] + 1;

  const random = () => {
    seed = (
      Math.imul(seed, 1664525) + 1013904223
    ) >>> 0;

    return seed / 4294967296;
  };

  function fix(value, i) {
    if (i === 2) {
      return Math.max(0, Math.min(7500, value));
    }

    if (i === 3) {
      return (
        ((value + 180) % 360 + 360) % 360
      ) - 180;
    }

    return Math.max(
      0,
      Math.min(i >= 4 ? 250 : 100, value)
    );
  }

  // SPSA optimization to approximate the
  // target RGB color using CSS filter parameters.
  function optimize(
    A,
    gains,
    radius,
    initial,
    iterations
  ) {
    let values = [...initial];
    let best = [...initial];
    let bestLoss = loss(initial);

    for (let k = 0; k < iterations; k++) {
      const step =
        radius / Math.pow(k + 1, 1 / 6);

      const signs = values.map(() =>
        random() > .5 ? 1 : -1
      );

      const high = values.map((v, i) =>
        fix(v + step * signs[i], i)
      );

      const low = values.map((v, i) =>
        fix(v - step * signs[i], i)
      );

      const delta =
        (loss(high) - loss(low)) /
        (2 * step);

      values = values.map((v, i) =>
        fix(
          v -
          gains[i] / (A + k + 1) *
          delta * signs[i],
          i
        )
      );

      const error = loss(values);

      if (error < bestLoss) {
        bestLoss = error;
        best = [...values];
      }

      if (bestLoss < .5) break;
    }

    return {
      values: best,
      loss: bestLoss
    };
  }

  let best = { loss: Infinity };

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = optimize(
      5,
      [60, 180, 18000, 600, 1.2, 1.2],
      15,
      [50, 20, 3750, 50, 100, 100],
      1000
    );

    if (result.loss < best.loss) {
      best = result;
    }

    if (best.loss < 1) break;
  }

  const gain = best.loss + 1;

  best = optimize(
    best.loss,
    [
      .25 * gain,
      .25 * gain,
      gain,
      .25 * gain,
      .2 * gain,
      .2 * gain
    ],
    2,
    best.values,
    500
  );

  const [
    invert,
    sepia,
    sat,
    hue,
    brightness,
    contrast
  ] = best.values;

  return (
    `brightness(0) saturate(100%) ` +
    `invert(${invert.toFixed(2)}%) ` +
    `sepia(${sepia.toFixed(2)}%) ` +
    `saturate(${sat.toFixed(2)}%) ` +
    `hue-rotate(${hue.toFixed(2)}deg) ` +
    `brightness(${brightness.toFixed(2)}%) ` +
    `contrast(${contrast.toFixed(2)}%) ` +
    `opacity(${(alpha * 100).toFixed(1)}%)`
  );
}

function updateImageFilters() {
  const accent = getComputedStyle(root)
    .getPropertyValue("--theme-accent")
    .trim();

  if (
    accent.toLowerCase() === previousAccent
  ) {
    return;
  }

  previousAccent = accent.toLowerCase();

  clearTimeout(filterTimer);

  // Restore stylesheet filter defaults when
  // the user has not customized the accent.
  if (
    !Object.hasOwn(
      appliedOverrides,
      "--theme-accent"
    )
  ) {
    root.style.removeProperty(
      "--theme-equalizer-filter"
    );

    root.style.removeProperty(
      "--theme-banner-filter"
    );

    return;
  }

  // Debounce filter recalculation while
  // the color picker is being dragged.
  filterTimer = setTimeout(() => {
    let filter = filterCache.get(
      previousAccent
    );

    if (!filter) {
      filter = makeAccentFilter(accent);

      filterCache.set(
        previousAccent,
        filter
      );
    }

    root.style.setProperty(
      "--theme-equalizer-filter",
      filter
    );

    root.style.setProperty(
      "--theme-banner-filter",
      filter
    );
  }, 100);
}

function applyOverrides(value) {
  const next = normalizeOverrides(value);

  // Remove settings that were reset.
  for (
    const name of Object.keys(appliedOverrides)
  ) {
    if (!(name in next)) {
      root.style.removeProperty(name);
    }
  }

  // Apply current customizations.
  for (
    const [name, color] of Object.entries(next)
  ) {
    root.style.setProperty(name, color);
  }

  appliedOverrides = next;

  updateImageFilters();
}

// Live updates from the popup.
chrome.runtime.onMessage.addListener(
  (message, sender, respond) => {
    if (message?.type === "openTheme:ping") {
      respond({ site: "spotify" });
    }

    if (message?.type === "openTheme:apply") {
      const next = message.overrides;

      if (!initialized) {
        pendingChanges = next;
      }

      applyOverrides(next);

      respond({ ok: true });
    }
  }
);

// Apply changes even when the popup is closed.
chrome.storage.onChanged.addListener(
  (changes, area) => {
    if (
      area !== "local" ||
      !(STORAGE_KEY in changes)
    ) {
      return;
    }

    const next =
      changes[STORAGE_KEY].newValue ?? {};

    if (!initialized) {
      pendingChanges = next;
    } else {
      applyOverrides(next);
    }
  }
);

// Restore saved theme on Spotify load.
chrome.storage.local.get(STORAGE_KEY)
  .then(result => {
    applyOverrides(
      pendingChanges ?? result[STORAGE_KEY]
    );

    initialized = true;
  })
  .catch(error => {
    console.error(
      "OpenTheme: couldn't load saved Spotify theme",
      error
    );

    initialized = true;

    if (pendingChanges !== null) {
      applyOverrides(pendingChanges);
    }
  });
