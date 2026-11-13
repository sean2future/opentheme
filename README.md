# OpenTheme

A Chrome/Chromium Manifest V3 extension for customizing websites.

## Install locally

Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and
select the `opentheme` folder containing `manifest.json`.

## Theme settings

- `themes/spotify.css` defines the default colors in its `:root` block.
- `popup/popup.js` reads those defaults and displays the current theme.
- Edits are saved as **differences from the defaults** in `chrome.storage.local`
  under the key `themeOverrides`.
- `content/content.js` applies those saved differences to Spotify on page load and
  reacts to changes while Spotify is open. No popup-to-tab messaging is required.
- Changing the Accent color also updates the popup's icon background and buttons.
- **Export theme** downloads a JSON file with all 34 current colors.
- **Import theme** accepts that exported JSON or a plain object mapping
  `--theme-*` variables to hex colors. Missing colors reset to stylesheet defaults.
- **Reset to defaults** clears custom overrides, restoring the stylesheet palette.

Imported colors must be hex values (`#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA`).
Changes to default colors in `spotify.css` automatically reach users who haven't
customized those particular variables.
