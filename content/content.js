const theme = {
  "--theme-bg": "#f7f3ee",
  "--theme-surface": "#eee8f4",
  "--theme-surface-hover": "#e5dded",
  "--theme-surface-press": "#d1c2e8",
  "--theme-search-active": "#f7f1ff",
  "--theme-menu": "#fffaf7",

  "--theme-text": "#272136",
  "--theme-text-subdued": "#706580",
  "--theme-link": "#503d87",
  "--theme-muted": "#8a8095",
  "--theme-playlist-type": "#776a8e",
  "--theme-playlist-meta": "#55476c",
  "--theme-playlist-description": "#8c7c96",
  "--theme-column-label": "#887e98",
  "--theme-home-icon": "#6d5b8b",
  "--theme-on-image": "#ffffff",
  "--theme-black": "#000000",

  "--theme-accent": "#8154ce",
  "--theme-accent-hover": "#6d42b8",
  "--theme-accent-soft": "#dcd0f0",
  "--theme-on-accent": "#ffffff",
  "--theme-play-icon": "#fff4e8",
  "--theme-slider-handle": "#ffffff",
  "--theme-topbar": "#e9e0f5",
  "--theme-playlist-topbar": "#e4d5ee",

  "--theme-lyrics-bg": "#634293",
  "--theme-lyrics-active": "#fff9ef",
  "--theme-lyrics-inactive": "#d4c4e8",
  "--theme-lyrics-passed": "#b4a1ce",
  "--theme-lyrics-message": "#fff9ef",
  "--theme-footer-bg": "#e8e0ef",
  "--theme-footer-heading": "#342548",
  "--theme-footer-text": "#655772",
  "--theme-search-border": "#7650ad33",

  "--theme-equalizer-filter":
    "brightness(0) saturate(100%) invert(34%) sepia(30%) saturate(1800%) hue-rotate(220deg) brightness(100%) contrast(95%)"
};


Object.entries(theme).forEach(([key, value]) => {
  document.documentElement.style.setProperty(key, value);
});
