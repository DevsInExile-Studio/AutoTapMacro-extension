# Input capture and performance

Measurements were taken with AutoTap 1.4.0.

The tests use isolated Chromium profiles and local pages, without the user's Chrome profile.

- The motion benchmark delivered 521 movements to the page. All 521 were retained in order, in five bounded segments, with five writes of the active macro record. Compact representation: 11,509 bytes; expanded representation: 76,532 bytes (about 85% less). Timings, coordinates and input state remain represented. Exact timings and byte counts can vary between runs.
- Cursor segments have at most 128 events and 32 target selectors. Coordinates use five decimal places relative to the viewport. Consecutive motion events with exactly the same position, element and buttons are ignored. Browser-delivered motion points at different positions are not sampled away.
- Wheel bursts are batched, preserve direction changes and keep at most eight observed scroll targets. Pointer, wheel and text changes flush before later interactions and Stop. Typing scrolls are distinguished from deliberate wheel scrolling.
- Storage still updates only the active macro record. The existing typing benchmark captures 80 characters with fewer than 40 writes (typically 7–10), and does not rewrite other library records. Pointer steps use dictionary-backed numeric tuples instead of repeating selector and property names for every point.
- The carousel keeps three active cards and at most one departing card. Interaction highlights are capped at eight nodes, throttled for input/scrolling and removed on Stop. Timers, listeners owned by the current panel, animations and held playback input are cleaned up. Reduced-motion preferences are honored.
- Tests cover five mouse buttons, modifiers, relative click coordinates, double clicks, vertical/horizontal wheel, editable/nested scroll areas, custom wheel handlers, browser history and middle-click links. Pointer tests cover cursor paths, held-button drags, HTML drag/drop, Pause and Stop. Dialog tests cover Cancel/Escape, safe focus, deletion and unsaved-change decisions.

## Practical boundaries

Capture is limited to input delivered to the top-level web document. Chrome's toolbar, system menus, OS gestures, closed shadow roots and cross-document frame input are outside the recorder. Private fields are excluded. Native file dragging is not captured. The browser may coalesce hardware samples before delivering pointer events. Coordinates scale with the viewport, but major layout changes can still affect a recording.

Playback dispatches DOM input events; they are not hardware-trusted events. Websites that require `isTrusted`, native pointer-lock behavior or other browser-only activation can reject them. HTML drag/drop recreates the event lifecycle and allows the source page to construct its own DataTransfer data; it does not collect arbitrary file or clipboard payloads. Middle-click HTTP(S) links and Back/Forward use narrowly scoped Chrome tab operations only during an active playback run. Browser navigation ends the current session.

These checks establish behavior on the tested pages; they are not a guarantee of compatibility with every website. Chrome storage quotas still apply. A storage failure stops recording with a message while retaining the previously saved actions.
