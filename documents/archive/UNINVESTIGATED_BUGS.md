# Uninvestigated Bugs — Suspected Issues Log

This document tracks suspected bugs that were observed during development but could not be reliably reproduced. The goal is to preserve as much context as possible (recent changes, observed behavior, environment) so that future investigation has a strong starting point.

---

## Bug 1: Properties Panel Not Updating for Selected Shape

**Status:** 🟡 Suspected — observed once, could not reproduce
**First observed:** 2026-09-11 (immediately after implementing Lock Aspect Ratio feature)
**Reproducibility:** Unknown (could not reproduce in subsequent testing)

### Description

After the "Lock Aspect Ratio & Preserve SVG Aspect Ratio" implementation, the properties panel sometimes failed to reflect the properties of the currently selected shape. The panel appeared to show stale values from a previously selected shape (or potentially default/empty values).

Specifically:
- The W (width) and H (height) fields showed incorrect values for the selected shape
- Other property fields (fill, stroke, opacity) may also have been stale
- The lock aspect ratio checkbox (prop-lock-ar) and preserve SVG checkbox (prop-preserve-svg-ar) may not have reflected the selected shape's state
- Switching selection away and back to the same shape did not fix it (panel stayed stale)
- A full re-render (e.g., pressing Escape to deselect then re-selecting) eventually fixed it

### When It Happened

The user observed this exactly once, immediately after the implementation change was applied and tested. The exact sequence that triggered it is unknown. Attempts to reproduce by:
- Rapidly clicking between different shapes
- Resizing with AR lock on/off
- Toggling checkboxes
- Loading old documents

... did not reproduce the issue.

### Recent Changes (Immediately Prior)

The following changes were made to `app.js` and `index.html` just before the bug was observed:

#### `app.js` Changes

1. **DOM refs added** (~line 170)
   - Added `propLockAr` and `propPreserveSvgAr` element queries

2. **`addShape()` defaults** (~line 854)
   - Added `lockAspectRatio: false` to every new shape
   - Added `preserveSvgAspectRatio: false` to new custom shapes

3. **`shapeSVG()` custom case** (~line 1065)
   - Changed from hardcoded `preserveAspectRatio="none"` to:
     ```js
     var par = .preserveSgAspectRatio ? 'xMidYMid meet' : 'none';
     ```

4. **`renderProps()` panel sync** (~line 1449)
   - Added sync of `propLockAr.checked` and `propPreserveSvgAr.checked` from shape properties
   - Added `propPreserveSvgAr.style.display` toggle based on `s.type === 'custom'`

5. **Resize logic in `pointermove`** (~line 1900)
   - Added complete aspect-ratio-constrained resize block inside `if (s.lockAspectRatio && rs.sh > 0 && rs.sw > 0)`
   - Added `minShapeSize` enforcement with ratio preservation

6. **Event listeners for checkboxes** (~line 2630)
   - Added `propLockAr.addEventListener('change', ...)`
   - Added `propPreserveSvgAr.addEventListener('change', ...)` — couples `lockAspectRatio` and auto-adjusts shape dimensions

7. **`propWidth`/`propHeight` listeners** (~line 2730)
   - **Split** from shared `[propX, propY, propWidth, propHeight].forEach(...)` loop into **four individual listeners**
   - Added aspect-ratio constraint in width/height handlers:
     ```js
     if (s.lockAspectRatio && s.height > 0 && s.width > 0) {
         var ratio = s.width / s.height;
         s.width = v;
         s.height = s.width / ratio;
     }
     ```

8. **Custom SVG input handler** (~line 2640)
   - Added auto-adjustment of shape dimensions when `preserveSvgAspectRatio` is on

9. **Migration backfill** (3 locations)
   - `init()` — shapes from localStorage
   - `loadFromLocalStorage()` — cross-tab sync
   - File-load handler — imported `.json` files

#### `index.html` Changes

1. Added `prop-lock-ar` checkbox in Geometry section
2. Added `prop-preserve-svg-ar` checkbox in Custom SVG section

### Suspected Root Causes

#### Theory A: Missing guard in `renderProps()` for null checkbox elements

If `propLockAr` or `propPreserveSvgAr` is not found by `document.getElementById()` (e.g., due to a race condition, partial DOM, or the elements not being present in the HTML at query time), accessing `.checked` would throw a `TypeError`. This would abort `renderProps()` mid-way, leaving the panel in a partially-updated state.

**Code path:**
```js
// In renderProps():
if (propLockAr) propLockAr.checked = s.lockAspectRatio || false;    // Guarded
if (propPreserveSvgAr) {                                              // Guarded
    propPreserveSvgAr.checked = s.preserveSvgAspectRatio || false;
    propPreserveSvgAr.style.display = s.type === 'custom' ? '' : 'none';
}
```

Both are guarded with `if (propLockAr)` / `if (propPreserveSvgAr)`, so `null` refs would not throw. However, this means the checkboxes would silently not sync. **Low confidence** — wouldn't cause the entire panel to be stale.

#### Theory B: `renderProps()` called before checkbox DOM exists

If `render()` is called during initialization before the DOM is fully parsed, the checkbox elements might not exist. But the `<script>` tag is at the bottom of `<body>`, so all elements above it should be parsed. **Low confidence.**

#### Theory C: `propWidth`/`propHeight` handler split introduced an error

The original code used:
```js
[propX, propY, propWidth, propHeight].forEach(function(input) {
    input.addEventListener('change', ...);
});
```

This was split into four individual calls:
```js
propX.addEventListener('change', ...);
propY.addEventListener('change', ...);
propWidth.addEventListener('change', ...);
propHeight.addEventListener('change', ...);
```

If `propWidth` or `propHeight` is `null` (DOM not found), the original `.forEach` would simply skip it (the loop wouldn't iterate over a null reference... actually, `[null, null, null, null].forEach(...)` WOULD iterate and call the callback with `null` as `input`, which would throw `input.addEventListener is not a function`).

Wait — the original code used `[propX, propY, propWidth, propHeight]` as an array. If any of these were null, `input.addEventListener` would throw. So this is actually a pre-existing vulnerability. My change doesn't make it worse.

But there IS a difference: in the original code, if `propWidth === null` threw, **all four** inputs would fail to have their listener attached (because the `forEach` throws before reaching `propHeight`). In my new code, if `propWidth === null`, only `propWidth`'s listener fails; `propX`, `propY`, and `propHeight` still get their listeners. So my change is actually **more resilient**, not less. **Low confidence.**

#### Theory D: Race condition with undo/redo restoring shapes without backfill

The `undo()` and `redo()` functions restore shapes directly:
```js
var d = JSON.parse(S.undoStack.pop());
S.shapes = d.shapes;
S.connections = d.connections;
```

If an undo stack entry was created **before** the new properties (`lockAspectRatio`, `preserveSvgAspectRatio`) were added to the shape objects, the restored shapes would lack these properties. When `renderProps()` then reads `s.lockAspectRatio`, it would get `undefined` (falsy, so the checkbox would be unchecked — not a crash). When the resize code reads `s.lockAspectRatio`, it would also get `undefined`. **No crash, no stale panel.**

However! If a shape object is **missing** these properties, and the resize logic does:
```js
if (s.lockAspectRatio && rs.sh > 0 && rs.sw > 0) {
    var ratio = rs.sw / rs.sh;
    // ... complex resize math
}
```
With `s.lockAspectRatio === undefined`, the condition is `false`, so the old resize path runs. **No crash.** **Low confidence.**

#### Theory E: `syncStyleControlsToShape()` is called but `renderProps()` returns early

No. `syncStyleControlsToShape()` is called at the end of the single-shape branch in `renderProps()`. There's no early return before it.

#### Theory F: The `propPreserveSvgAr.style.display` assignment throws

If `propPreserveSvgAr` is a valid element but `.style` throws for some reason... this is extremely unlikely. **Very low confidence.**

#### Theory G: The `propLockAr` or `propPreserveSvgAr` listener fires during `renderProps()` causing recursive or partial update

If setting `propLockAr.checked` or `propPreserveSvgAr.checked` in `renderProps()` triggers the `change` event on those checkboxes, the event listener would fire mid-render, causing a recursive `render()` call. However, `checked` assignment via JavaScript does NOT fire the `change` event — only user interaction does. **Low confidence.**

### What to Check Next Time

1. **Check the console for errors** — Any `TypeError` or `ReferenceError` during `render()` or `renderProps()` would indicate the root cause.

2. **Reproduce the stale state** — If the panel is stale again:
   - Open DevTools and run `render()` in the console to force a full re-render
   - If that fixes it, the issue is in `renderProps()` sync, not in the underlying data
   - Inspect `S.selection` and `s.lockAspectRatio` / `s.width` / `s.height` for the selected shape

3. **Check if the checkbox elements exist** — Run `console.log(document.getElementById('prop-lock-ar'), document.getElementById('prop-preserve-svg-ar'))` to verify the DOM elements are present.

4. **Check undo/redo history** — If the stale state occurred after an undo, inspect the undo stack entry's shapes for missing properties.

5. **Test with a fresh localStorage** — Clear `localStorage` and reload. If the issue only happens with saved/restored documents, it's a migration backfill gap.

### Workaround (If Reproduced)

1. Deselect all (click empty canvas or press Escape), then re-select the shape — forces a full `render()` cycle
2. If that fails, run `render()` in the console
3. If that fails, save and reload the page

---

## Bug 2: Line Tool Appears Active When Not Selected

**Status:** 🔴 Uninvestigated — suspected
**First observed:** 2026-09-17
**Reproducibility:** Intermittent ("sometimes")

### Description

The line/connection tool sometimes appears to be active when it has not been selected. The user can draw or start a line even though the line tool button does not look engaged.

### Suspected Cause

Unknown. Could be a stuck interaction mode (e.g. a line-draw mode flag not cleared after a previous action, an Escape/deselect not resetting it, or a keyboard shortcut/toolbar state desync). Compare the state flag that gates line drawing against the toolbar button's active class to find where they can diverge.

### Next Steps

1. Identify the state flag(s) that enable line drawing and the toolbar button's `.active` class logic.
2. Reproduce after: drawing a line, pressing Escape mid-draw, switching tools quickly, and using keyboard shortcuts.
3. Log the flag and button class after each action to find the desync point.

---

## Bug 3: Line Snaps to a Shape Other Than the Highlighted One

**Status:** 🔴 Uninvestigated — suspected
**First observed:** 2026-09-17
**Reproducibility:** Intermittent

### Description

When drawing a line, it sometimes snaps to a shape that is not the highlighted (candidate) shape. The user suspects the cursor is slightly outside the highlighted shape's bounds, yet the snap should still attach to the highlighted shape while it is highlighted.

### Suspected Cause

The snap/highlight resolution likely has a mismatch: the highlight ring is drawn for shape A (nearest by one metric), but the endpoint projection/snap picks shape B (nearest by a different metric, e.g. raw centre distance vs. true outline distance, or a stale candidate). A cursor just outside the highlighted outline can then land closer to a different shape's snap region.

### Next Steps

1. Check the order of operations: highlight candidate selection vs. endpoint snap target selection — they should use the same candidate.
2. Verify the snap region (tolerance) around the highlighted shape's true outline is generous enough that "just outside" still attaches to it.
3. Reproduce with two shapes close together and move the cursor across the boundary, logging which shape is highlighted vs. which shape receives the snap.

---

## Bug 4: Exported Image/PDF Does Not Include Lines

**Status:** 🔴 Uninvestigated — suspected (not yet reproduced)
**First observed:** 2026-09-17
**Reproducibility:** Unknown

### Description

Exports (PNG/PDF via html2canvas) sometimes omit connection lines entirely. The user suspects it is related to z-heights, but has not been able to recreate it.

### Suspected Cause

Possibly the unified z-order changes (v1.1.6) causing connections to render at an unexpected `z-index`, or the export path reading/render the connection layer differently from the on-screen canvas. Since html2canvas 1.4.1 parses `display` and positioning but has limited layout support, a z-index/stacking or stacking-context difference could drop the lines.

### Next Steps

1. Attempt to reproduce: export a diagram containing connections and inspect the output.
2. Compare the on-screen DOM (z-index values, SVG/canvas layers) with what html2canvas captures.
3. Temporarily pin connection z-index to a fixed high value and re-export to test the z-height hypothesis.

---

## Bug 5: Saved State Sometimes Completely Empty

**Status:** 🔴 Uninvestigated — suspected
**First observed:** 2026-09-17
**Reproducibility:** Intermittent

### Description

Sometimes a save is completely empty — the saved diagram contains no shapes/connections when reloaded (or the saved payload is empty). The user suspects this may be incognito/private browsing mode, where `localStorage` is unavailable or ephemeral.

### Suspected Cause

Most likely `localStorage` being blocked, cleared, or per-session in private/incognito mode, causing the app to fall back to an empty state. Could also be a `saveState()` error swallowed silently, or a save racing an initialization/reset that writes an empty document.

### Next Steps

1. Detect `localStorage` availability/failure and surface a warning instead of silently saving nothing.
2. Log the serialized payload size at save time to confirm whether an empty document is being written.
3. Test in incognito/private mode (and with storage disabled) to confirm the suspicion.
4. Check for a save/first-run race that could overwrite a good save with an empty one.

---

*Document version 1.1 — bugs 2–5 added 2026-09-17.*