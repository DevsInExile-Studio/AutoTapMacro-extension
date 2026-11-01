# Chrome Web Store copy — 1.4.2

**Name:** AutoTap Macro — Recorder & Scripts

**Short description:** Record browser routines, manage JavaScript with GM tools, and export page data in a warm, paper-inspired workspace.

**Language:** English

## Detailed description

Record. Replay. Make it yours.

AutoTap Macro brings browser macros, your JavaScript and practical page tools into one little workshop.

RECORD ROUTINES

Capture cursor trajectories, held-button movement, HTML drag-and-drop, all five standard mouse buttons, double clicks, wheel gestures, ordinary typing, selections, supported keys and scrolling. Wheel gestures retain horizontal/vertical deltas and observed scroll positions, including nested areas and text editors. Custom wheel handlers work even when no scroll event occurs. Edit selectors, values and timing. Set cycles and speed, disable steps, wait for elements, check text, hover and set checkbox states. A floating panel supports pause and stop. Middle-click links can open background tabs, and Back/Forward can use the connected tab’s browser history when the page does not cancel the action. Browser navigation ends the current session. Pick page elements directly or validate selectors before playing.

See subtle interaction highlights and a single-row carousel of up to three recent actions above the stationary Pause/Stop bar. New cards enter from the right while older cards slide left and fade away. The carousel hides after 1.6 seconds without new actions. A session timer pauses with recording. Turn highlights on or off from the bar. Reduced-motion preferences are respected, and typed values stay hidden in the notification.

MANAGE YOUR JAVASCRIPT

Write or import .js/.user.js files. Run once or automatically on chosen sites. Match/include rules, exclusions, @connect and matching embedded frames help scripts fit your workflow.

The expanded GM subset includes persistent single/batch storage, value-change listeners across tabs, CSS/element helpers, metadata, logs, menu commands, opening tabs, HTTP requests, resource text/URLs, notifications, downloads and plain-text clipboard writing. Modern GM.* aliases are available. Native features request optional Chrome permissions.

ATTACH AND REVIEW DEPENDENCIES

Add local @require libraries and @resource files, or explicitly fetch declared HTTP(S) files into a reviewable draft. Supported SHA hashes are checked. Fetching never runs code by itself. There are no silent dependency downloads or automatic script updates.

EXPORT PAGE DATA

Toolbox can extract repeated page elements using CSS rules, preview a table and download CSV or JSON. Use link/article presets or define named columns. Recognized private inputs are skipped and formula-like CSV cells receive a protective prefix.

KEEP THE WORKSHOP ORGANIZED

Favorites, tags, sorting, script commands and seven editable recipes keep useful routines close. Activity shows the last 100 local events. Pause auto-run globally or exclude sites. JSON backups include your scripts, GM values and attached files; imported scripts always start with auto-run off.

There is no account, analytics service or extension-operated server.

ANDROID COMPANION

AutoTap Macro is also available for tap recording and playback in Android apps:
https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro

Android installation is optional. Its format and collection are separate and do not sync.

LIMITS

Macros and extraction use the current top-level page; navigation ends a macro session. Browser pages, Chrome Web Store, shadow DOM and hardware input are unsupported. Some sites reject synthetic events. Ordinary typed or visible text can contain personal information.

This is expanded partial Tampermonkey compatibility. unsafeWindow, GM_cookie/webRequest, regex URL rules, streaming responses, multipart file uploads and automatic script updates remain unsupported. Network requests have bounds and reject redirects. Clipboard writing is plain text only. Isolated contexts are subject to Chrome's limits. Reload pages to clear script effects; macro Stop is not a JavaScript kill switch.

## Publisher permission justifications

**Single purpose:** Create, manage and run user-directed browser automations through macros, userscripts and explicit page extraction.

**activeTab/scripting:** Inject packaged top-level recording, playback and extraction code into a page explicitly activated by the user.

**storage:** Local library, per-script values/attachments, bounded activity and session/callback data.

**userScripts:** Execute user-written/imported code and explicitly reviewed attached libraries through Chrome's API. GM calls use the dedicated message channel, capabilities and declared grants.

**offscreen:** A bundled hidden document writes clipboard text on behalf of a script with GM_setClipboard and optional clipboardWrite permission.

**Optional host access:** User-chosen auto-run rules, @connect endpoints and explicitly selected dependency sources. No all-site access on installation. Broad rules require a user-approved host grant.

**Optional notifications:** Local notifications for explicitly declared GM_notification.

**Optional downloads:** Save user-requested script downloads. File paths are relative and parent traversal is rejected.

**Optional clipboardWrite:** Write plain text; no clipboard reading.

**User-provided code / network sources:** The extension does not fetch code for its own runtime updates. Users may explicitly fetch declarations from their own imported userscript into an unsaved reviewable draft. Fetching has no execution or registration side effect. Saved/approved source runs only through userScripts. There is no automatic remote dependency fetching during auto-run and no script updater.

## Reviewer walkthrough

1. On a normal HTTP(S) website, toolbar → Record this tab → interact → Stop. Open workshop and replay/edit the macro.
2. Enable Allow user scripts in Chrome details and return to Recheck.
3. Toolbox → choose a local recipe. Review its grants and run; native-feature recipes request their Chrome permissions.
4. Use Scripts → Network, frames & attached files to inspect @connect, frame settings and declared files.
5. Fetch declared files for review requests source access and populates only a draft. Inspect library source before Run or Save.
6. Toolbox → Page data → row selector and JSON columns → preview/download CSV/JSON.
7. Inspect Activity and GM storage, export a JSON backup and import it. New IDs are generated and auto-run is off.

## Files

../dist/AutoTap-Macro-Chrome-v1.4.2.zip; promo-440x280.png; promo-1400x560.png; five 1280x800 screenshots: Macros, Recording, JavaScript, Compatibility and Toolbox (ordered in screenshots.json); icon-128.png.

Publish PRIVACY.md at a public HTTPS URL you control and enter it in the dashboard before submission. The separate Android policy is not a substitute unless its text is updated for this product. Support: DevsInExileStudio@outlook.com. No submission/publication has been performed.

References: [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts), [Tampermonkey](https://www.tampermonkey.net/documentation.php), [offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
