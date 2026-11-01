<p align="center">
  <img src="docs/assets/github-banner.png" alt="AutoTap Macro — Record. Replay. Make it yours." width="100%">
</p>

<p align="center"><strong>A little workshop for browser routines, your JavaScript and useful page tools.</strong></p>

<!-- Replace the Chrome Web Store homepage URL below with your extension listing URL. -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro"><img src="docs/assets/google-play-badge.svg" alt="Get the Android app on Google Play" width="220" height="64"></a>
  <a href="https://chromewebstore.google.com/"><img src="docs/assets/chrome-web-store-badge.svg" alt="Install from Chrome Web Store" width="220" height="64"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.2-6c9a3e?style=flat-square" alt="Version 1.4.2">
  <img src="https://img.shields.io/badge/Chrome-138%2B-67563e?style=flat-square" alt="Chrome 138 or newer">
  <img src="https://img.shields.io/badge/Manifest-V3-67563e?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/storage-local-6c9a3e?style=flat-square" alt="Local storage">
</p>

<p align="center"><strong>English</strong> · <a href="i18n/README.es.md">Español</a> · <a href="i18n/README.zh-CN.md">简体中文</a> · <a href="i18n/README.hi.md">हिन्दी</a> · <a href="i18n/README.ar.md">العربية</a> · <a href="i18n/README.fr.md">Français</a></p>

Install from Chrome Web Store, or load the extension locally. The interface is in English.

## One workspace, three ways to automate

| Macros | Userscripts | Page tools |
| --- | --- | --- |
| Record clicks, all five standard mouse buttons, pointer movement, holds, HTML drag-and-drop, wheel gestures, typing and scrolling. | Write or import `.js` / `.user.js`. Run once or automatically on chosen sites with a supported set of GM APIs. | Extract repeated elements with CSS selectors, preview a table, and export CSV or JSON. |
| Edit actions, selectors and timing. Set cycles, speed, waits, text checks and error handling. | Use per-script values, network requests, resources, commands, notifications, downloads and clipboard writing. | Keep favorites and tags, try editable recipes, inspect Activity and export JSON backups. |

During recording, subtle highlights and a one-row action carousel sit above a compact, movable Pause/Stop bar. Reduced-motion preferences are respected. Everything stays in your browser profile unless you export it or your script sends a request.

<p align="center"><img src="store/screenshot-macros-1280x800.png" alt="The macro editor with a saved routine, timing settings and editable actions" width="100%"></p>

<details>
<summary><strong>See the other four screenshots</strong></summary>

| Live recording | JavaScript editor |
| --- | --- |
| ![Recording feedback on an example website](store/screenshot-recording-1280x800.png) | ![Userscript editor](store/screenshot-javascript-1280x800.png) |
| Script access and compatibility | Page data export |
| ![Network and attached-file settings](store/screenshot-compatibility-1280x800.png) | ![Page extraction preview](store/screenshot-toolbox-1280x800.png) |

</details>

## Install locally

1. Download or clone this repository. Use **Chrome 138+**.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's **`chrome/`** folder.
4. Open a regular HTTP(S) website → AutoTap icon → **Record this tab**. Interact, then **Stop**. Choose **Open workshop** to edit or replay.

To update an existing installation, keep its folder, replace its files and click **Reload** on the extension card. Refresh website tabs. No build step or Android installation is required.

Shortcuts: **Alt+Shift+R** records; **Alt+Shift+X** stops. Change them at `chrome://extensions/shortcuts`.

## Bring your JavaScript

Enable **Allow user scripts** in Chrome's details for AutoTap. In the workshop, open **JavaScript**, create or import a script, review its permissions and use **Run once**. For automatic execution, set site rules, enable it and save. Imported scripts start with auto-run off.

Tampermonkey compatibility is **partial**: both legacy `GM_*` and modern `GM.*` forms are available for the implemented APIs. Declared `@require` / `@resource` files can be attached locally or explicitly fetched into a draft for review. They do not download or update silently. See the [compatibility matrix](docs/COMPATIBILITY.md).

## Privacy and practical limits

- No account, built-in analytics or extension-operated server. Site and native-feature permissions are requested when needed. Scripts can contact the endpoints you authorize.
- Password, file and recognized payment/one-time-code fields are skipped. Ordinary text, scripts, logs and backups can still contain personal data.
- Macro recording and extraction use the top-level web page. Navigation ends a macro session. Chrome pages, Chrome Web Store, shadow DOM and sites requiring trusted hardware events are outside the supported scope.
- `unsafeWindow`, cookie APIs, streaming responses and automatic script updates are unsupported. **Stop** stops macros; reload the page to clear arbitrary script timers or listeners.

[Extension privacy policy](store/PRIVACY.md) · [Developer website](https://devs-in-exile.pages.dev/) · [Input and performance notes](docs/PERFORMANCE.md)

## Also on Android

[AutoTap Macro on Google Play](https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro) records and replays taps in Android apps. The browser extension and Android app have separate collections and formats; there is no synchronization.

## Development and assets

The runtime lives in `chrome/`; translations in `i18n/`; the banner and badges in `docs/assets/`. Five **1280 × 800** screenshots and **440 × 280 / 1400 × 560** promotional tiles are in `store/`.

```sh
npm install
npm test
npm run test:browser
npm run assets
```

[Build, browser checks and packaging](docs/DEVELOPMENT.md) · [Report an issue](https://github.com/DevsInExile-Studio/AutoTapMacro-extension/issues) · [Contact](mailto:DevsInExileStudio@outlook.com)
