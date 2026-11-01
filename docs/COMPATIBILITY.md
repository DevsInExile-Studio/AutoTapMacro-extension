# Userscript compatibility

This is an expanded Tampermonkey-compatible subset, not a drop-in replacement for every userscript. Imported scripts remain disabled until you choose to run or enable them.

## APIs

| API | Support and practical limits |
| --- | --- |
| GM_getValue / setValue / deleteValue / listValues | Persistent JSON storage per script. Legacy reads use a run snapshot; modern GM.getValue fetches current values. 128 KB / 500 keys per script. |
| GM_getValues / setValues / deleteValues | Batch JSON operations. Writes are ordered per running instance. Cross-tab read-modify-write is not atomic. |
| GM_addValueChangeListener / removeValueChangeListener | Local and cross-tab updates, including editor changes; callback receives key, oldValue, newValue, remote. Up to 100 subscriptions per script. |
| GM_addStyle / addElement | CSS and DOM helpers, including an initially missing document root. |
| GM_info / GM.info | Handler/version, script metadata, scriptMetaStr, resources and noframes information. Read-only information is also available without an explicit GM_info grant. The handler honestly identifies as AutoTap. |
| GM_log | Page console and bounded local Activity journal. |
| GM_registerMenuCommand / unregisterMenuCommand | Popup commands, including commands registered from authorized frames. |
| GM_openInTab | HTTP(S) tabs; script may close only its own tabs. Returned handle has ready and close(). |
| GM_xmlhttpRequest / GM.xmlHttpRequest | GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS; string, URLSearchParams, string-only FormData, Blob/ArrayBuffer/typed-array bodies; text/json/document/blob/arraybuffer responses. |
| GM_getResourceText / GM_getResourceURL | Attached UTF-8 text and Blob resource URLs; modern getResourceUrl alias also supported. |
| GM_notification | Native Chrome notifications with text/title, click/done callbacks and removal. Uses the bundled app icon. Timeout is best-effort and capped at 25 seconds. |
| GM_setClipboard | Plain-text writes only. No clipboard reading or HTML clipboard payloads. |
| GM_download | Local data/Blob files, or HTTP(S) files fetched under @connect. Completion/error callbacks, modern Promise and abort handle. Data/Blob inputs up to 2 MB, network files up to 4 MB. |

GM methods have modern asynchronous aliases. GM.xmlHttpRequest returns an abortable Promise; the legacy method returns an abort handle and uses callbacks. Most legacy writes also return a Promise in this implementation, while ordinary scripts may ignore it.

## Network behavior

Declare GM_xmlhttpRequest or GM_download and @connect entries. Acceptable entries: self, a hostname, hostname:port, *.example.com or *. Domain entries include subdomains. Browser site permissions are also required. The editor requests them before Run or enabling auto-run.

Requests are anonymous by default. Set anonymous:false to request browser credentials, subject to Chrome's cookie rules. Authorization and ordinary headers are supported; browser-controlled Cookie, Origin, Referer, Host, User-Agent and similar headers cannot be overridden.

Timeout defaults to 15 seconds and is bounded to 100 ms–30 seconds. Bodies are limited to 1 MB, responses to 4 MB. Up to 8 requests per run capability / 16 total. Redirects fail rather than bypass @connect checks; use the final endpoint URL. Progress is reported once on completion. Streaming responses, multipart file uploads, cookie injection/partitions and full XHR ready-state streaming are not implemented.

## Metadata and files

Supported metadata includes name, namespace, version, description, match, include, exclude-match, exclude, connect, grant, run-at, noframes and tag.

- Match rules accept HTTP(S) wildcard hosts, including *://*/*. <all_urls> is normalized to HTTP(S); file and browser pages are outside scope.
- @include uses HTTP(S) URL globs with * and ?; match/include rules form a union. Exclusions apply afterward. Regular-expression rules are not supported.
- @noframes limits auto-run to the top frame. Imported userscripts without it allow matching frames; each frame still needs site permission and a matching URL. Existing 1.1 scripts keep their previous top-frame default. Manual Run targets the top document.
- @require declarations can be filled with local JavaScript files, or fetched explicitly into the editor with Fetch declared files for review. Classic libraries execute in listed order before the script. Native ES modules are not bundled/transformed.
- @resource declarations can be filled with local files or explicitly fetched. Files stay inside the saved script and JSON backup. Source .user.js exports keep their declarations; use JSON to transfer actual attachments.
- Fetching uses granted HTTP(S) sources, no credentials, no redirects, bounded sizes and four concurrent jobs. SHA-256/384/512 URL-fragment hashes are checked when supplied. Fetching never saves, registers or executes the result: the user reviews a draft first.
- Library limits: 12 files, 200 KB each / 500 KB total. Resources: 16 named files / about 512 KB total.

There are no automatic remote updates or silent dependency downloads during auto-run.

## Isolation and browser limits

GM APIs run in a named USER_SCRIPT world with per-script capabilities. MAIN/Page context is available for ordinary JavaScript without GM grants. unsafeWindow, exportFunction, cloneInto, cookie APIs and privileged webRequest APIs are not emulated.

Chrome limits named worlds active on one document. AutoTap detects fallback into an unconfigured shared world before constructing capabilities or running user code. Manual Run explains that a page reload or fewer distinct scripts is required. Old unused world configurations are cleaned when configuration capacity is approached. Reloading a page clears its active worlds. This deliberately preserves isolation rather than silently weakening it.

Other remaining limits: no arbitrary regex URL rules, cross-frame DOM macro recording, continued multi-page macro playback, script auto-updater or general userscript store installer. Macro Stop does not terminate arbitrary JavaScript timers or synchronous loops; reload the page to clear them.

## Checked

Chrome for Testing 151 / Playwright 1.62.1 in disposable profiles: real HTTP responses, POST form values, legacy and modern callbacks, binary/document data, timeout/abort, redirect denial, grant isolation, local libraries/resources, integrity mismatch, explicit draft-only dependency fetching, cross-tab value listeners, matching iframe commands, native notification create/remove, clipboard write bridge, completed downloads and page extraction.

Native desktop notification visibility and every third-party userscript have not been certified. Chrome/OS settings can affect display and clipboard behavior.

Primary references: [Tampermonkey API](https://www.tampermonkey.net/documentation.php), [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts), [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [offscreen clipboard helper](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [Chromium named-world limit](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/renderer/script_injection.cc).
