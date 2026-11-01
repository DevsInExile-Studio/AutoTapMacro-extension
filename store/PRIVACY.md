# AutoTap Macro — Browser Edition: Privacy Policy

Effective date: November 1, 2026. Applies to version 1.4.2.

AutoTap Macro has no account system, analytics SDK, advertising SDK, telemetry endpoint or extension-operated server. It does not sell your automation collection or transmit it to the developer.

## Data in your browser

Local extension storage contains macros, website URLs, selectors, action labels, ordinary typed values, selections, keys, mouse buttons, click counts, pointer paths/coordinates/timing/button states, page selectors for pointer targets, relative pointer positions, wheel deltas/modifiers and observed scroll targets, scroll positions, timing, settings, favorites/tags, JavaScript code, script metadata/grants, attached libraries/resources, per-script GM values, auto-run controls and the last 100 activity entries. GM_log messages contain whatever the script chooses to log and may contain personal data.

The interaction-effects preference is stored locally. A temporary carousel holds up to three recent action summaries, plus one departing summary during its short fade, only in page memory and hides typed values. Old summaries are removed as new actions arrive; the carousel also disappears automatically. Visual highlights are temporary; they do not collect screenshots or send interaction data to the developer.

During active playback, middle-click HTTP(S) links may create a background tab; Back/Forward may navigate the connected tab’s history when the page does not cancel the mouse action.

Session storage holds active sessions, temporary capabilities, menu commands, listener metadata, notification/download callback information and identifiers of tabs created by scripts. Capabilities are not included in exported library backups.

Recognized password, file, hidden, payment and one-time-code inputs are excluded from recording and ordinary replay. Text assertions and the page extractor exclude recognized private inputs. Ordinary fields or visible text can still contain sensitive information. Pause before entering information you do not want saved.

The page extractor reads elements you explicitly select through CSS rules and keeps results in a preview until download. It does not automatically add the extracted table to the library. JSON backups include macro values, script code/metadata, GM values and attached files. Exported activity contains the displayed entries. Downloaded files remain on your device.

## Network requests and dependencies

User scripts can read/change permitted page content and make network requests. GM network requests and network file downloads must satisfy the script's @connect rules and Chrome host permissions. Requests omit credentials by default; user code may explicitly set anonymous:false to request browser credentials under Chrome's rules. User-provided request URLs, headers and bodies go to the servers selected by that code.

The extension can fetch HTTP(S) @require/@resource files only after you use Fetch declared files for review and grant source access. These fetches omit credentials, reject redirects, enforce size limits and verify supported declared integrity hashes. Results are returned to an unsaved editor draft; fetching alone does not register or execute code. Files are stored if you save the script. There is no automatic remote dependency download during auto-run and no automatic script updater.

This policy cannot promise that arbitrary code you install stays offline. Review code and attached dependencies before running them.

## Chrome permissions

- activeTab and scripting inject the packaged recorder/player/extractor into a page you activate.
- storage keeps the local collection, journal and sessions.
- userScripts executes your code through Chrome's userscript API after Allow user scripts is enabled.
- offscreen provides the packaged hidden clipboard helper. It has no independent browsing purpose.
- Optional HTTP(S) access is requested for selected script sites, @connect targets and dependency sources. All-host access is possible only if your rules explicitly request it and you approve Chrome's prompt; it is not granted by default.
- Optional notifications lets granted scripts show local Chrome/OS notifications.
- Optional downloads lets granted scripts save files on your device.
- Optional clipboardWrite lets granted scripts replace clipboard text. Clipboard reading is not requested.

## Scripts and frames

Each script has separate GM values and capabilities. Automatic scripts may run in embedded frames when allowed by the script's settings; each frame URL is matched and requires site access. Manual Run targets the top document. Scripts can open HTTP(S) tabs and close tabs they created. Native features run only with their corresponding grants and Chrome permissions.

## External link

The optional Google Play link opens the separate AutoTap Macro Android listing under Google's policies. The Android app is optional and has separate storage and privacy information. The collections do not sync.

## Your controls

Delete items, edit GM values, clear Activity, disable scripts, pause future auto-run or block sites. Revoke website/native-feature access and disable user scripts in Chrome settings. Reload a page to clear timers/listeners already created by script code.

Deleting a script removes its GM values and extension-side capabilities/subscriptions. Closing a tab cleans its extension-side subscriptions and aborts pending GM network requests. Uninstalling removes local extension data from that browser profile. Completed downloads, JSON backups and activity exports remain until you delete them.

## Contact

Devs in Exile Studio: DevsInExileStudio@outlook.com
