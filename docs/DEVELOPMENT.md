# Development and store assets

The repository root is the extension directory. `chrome/` is the complete, dependency-free unpacked extension. The Android/Godot application lives outside this directory and is not changed by these tools.

## Repository layout

```text
chrome/        Extension runtime, icons and bundled fonts
docs/          Developer notes, banner and README badges
i18n/          Seven README translations
store/         Five screenshots, promotional tiles and store copy
tests/         Unit and isolated browser checks
tools/         Artwork, previews and release packaging
dist/          Release ZIPs and checksums (ignored)
```

Only source, documentation and intentional publishing assets belong in Git. The hidden `.gdignore` keeps Godot from importing the extension when it sits beside the Android project.

## Local checks

Use a current Node.js installation, then install the development dependency:

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
npm run test:compatibility
npm run test:feedback
npm run test:mouse
npm run test:pointer
```

Browser checks use disposable profiles and local fixture pages. They do not use your personal Chrome profile. Diagnostic screenshots and previews are saved in `autotap-macro-previews/` inside the operating system's temporary directory (`%TEMP%` on Windows), outside this repository. [Input behavior and performance](PERFORMANCE.md) documents the boundaries and measured results; [compatibility](COMPATIBILITY.md) lists the implemented APIs.

## Rebuild the artwork

```sh
npm run assets
```

The tool captures the actual extension in an isolated Chromium profile. It updates five English screenshots, both store promotional tiles, and the GitHub banner. Popup previews go into the temporary directory described above. The recording screenshot starts a real recording on the bundled example page and stops it after capture. It does not grant additional permissions to the distributed extension.

| Output | Size | Use |
| --- | --- | --- |
| `store/screenshot-*.png` | 1280 × 800 | Five Chrome Web Store screenshots |
| `store/promo-440x280.png` | 440 × 280 | Small promotional tile |
| `store/promo-1400x560.png` | 1400 × 560 | Marquee promotional tile |
| `docs/assets/github-banner.png` | 1600 × 640 | Repository README banner |

[screenshots.json](../store/screenshots.json) defines the five screenshots and their upload order. The source layouts are [banner.html](banner.html), [promo.html](../store/promo.html), [screenshot-frame.html](../store/screenshot-frame.html), and [recording-demo.html](../store/recording-demo.html). README badges are local SVG files in `docs/assets/`.

To regenerate the optional animated recording demonstration:

```sh
npm run preview:recording
```

Its PNG/GIF output goes into the temporary directory described above. This separate command also needs Python with Pillow. Set `PYTHON_PATH` if your interpreter is not on PATH.

## Package a release

On Windows, from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/package.ps1
```

Release files go into the ignored dist/ directory. The script reads the version from `chrome/manifest.json`, packages the contents of `chrome/` at the ZIP root, writes a SHA-256 file, and creates `AutoTap-Macro-Store-Assets.zip` with eight files: five screenshots, two promotional tiles, and the icon. README, translations, tests, and banner source stay outside the runtime ZIP.

No publishing is performed by these commands. Store copy and submission notes are in [STORE_LISTING.md](../store/STORE_LISTING.md). The Chrome Web Store badge in each README currently points to the store homepage as a placeholder; replace those eight links with the real listing when available.

## Documentation

- [English README](../README.md), with seven translated versions in `i18n/`: Spanish, Simplified Chinese, Hindi, Arabic, French, Russian and Brazilian Portuguese.
- [Extension privacy policy](../store/PRIVACY.md).

UI language remains English. The README translations do not add interface localization. The extension bundles Inter and Pangolin fonts; their license files are retained in `chrome/assets/`.
