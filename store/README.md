# Chrome Web Store artwork

Five English screenshots, all **1280 × 800**, in the recommended upload order:

| Order | File | Content |
| --- | --- | --- |
| 1 | [Macros](screenshot-macros-1280x800.png) | Saved routine, playback settings and action editor |
| 2 | [Recording](screenshot-recording-1280x800.png) | Real recording on an example website, floating controls and feedback carousel |
| 3 | [JavaScript](screenshot-javascript-1280x800.png) | Userscript editor and site rules |
| 4 | [Compatibility](screenshot-compatibility-1280x800.png) | Actual network, frame and attached-file settings |
| 5 | [Page tools](screenshot-toolbox-1280x800.png) | Actual page extraction with a populated preview and CSV/JSON controls |

Additional store artwork:

- [Small promotional tile](promo-440x280.png): **440 × 280**.
- [Marquee promotional tile](promo-1400x560.png): **1400 × 560**.
- [Store icon](icon-128.png): **128 × 128**.

The package `dist/AutoTap-Macro-Store-Assets.zip` contains these eight upload files. Development previews and test screenshots are written to `autotap-macro-previews/` in the operating system's temporary directory, outside this repository, and are not included in the store package.

The [GitHub banner](../docs/assets/github-banner.png), **1600 × 640**, is a separate repository asset. The two feature detail screenshots use [screenshot-frame.html](screenshot-frame.html) around captures of the real extension panels. The banner is promotional artwork; it is not an application screenshot.

Regenerate the artwork with `npm run assets` from the extension root. [screenshots.json](screenshots.json) defines the screenshot list used by the packaging script. [Store text](STORE_LISTING.md), [privacy policy](PRIVACY.md), [development instructions](../docs/DEVELOPMENT.md).
