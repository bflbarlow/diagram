# Canvas Pan Clamp — Specification

## 1. Goal

Prevent the user from panning the canvas so far off-screen that the content is
completely lost. Keep at least a configurable margin of the canvas bounding box
visible at all times.

## 2. Current State

### 2.1 Pan mechanism
- Canvas transform: `translate(panX, panY) scale(zoom)` applied via `applyTransform()` (app.js:1514)
- `panX`/`panY` are in **container (screen) coordinates**, not canvas-local
- Canvas screen size: `cw = canvasW * zoom`, `ch = canvasH * zoom`

### 2.2 Pan sources (all call `applyTransform()` after mutating pan)
| Source | Location | Notes |
|--------|----------|-------|
| Pointer drag (middle/right-click) | ~app.js:1937 | `panX += e.clientX - panStart.x` |
| Wheel pan (plain scroll) | ~app.js:2392 | `panX -= e.deltaX` (trackpad two-finger) |
| Pinch pan | ~app.js:1927 | `panX += cx - icx` |
| Zoom at cursor (Ctrl/Cmd+wheel) | ~app.js:2386 | Same handler as plain-scroll pan, different `if` branch — changes panX to preserve cursor anchor |
| Pinch zoom | ~app.js:1923 | Changes panX to preserve midpoint anchor |
| Zoom buttons (`btn-zoom-in`/`out`) | ~app.js:2541, 2546 | Changes `S.zoom` only, **never touches panX/Y**. `transform-origin` is `0 0` (styles.css:361), not centered, so `cw`/`ch` change without pan being adjusted — can push pan out of range with no compensating anchor logic at all |
| Keyboard `+`/`-` zoom | ~app.js:3281–3282 | Same issue as zoom buttons — `S.zoom` changes, pan does not |
| New canvas (btn-new) | ~app.js:3060 | Centers canvas: `panX = r.width/2 - 400` |
| Init without saved state | ~app.js:3486 | Same intent: `panX = r.width/2 - 500` |

### 2.3 Pan restore on load (three paths)
| Path | Location | Notes |
|------|----------|-------|
| `loadFromLocalStorage()` | ~app.js:500 | Runs on `storage` event for read-only tabs |
| `btnLoadFile` import | ~app.js:3166 | User drags in a `.json` file |
| `init()` startup load | ~app.js:3396 | Initial read from localStorage on page load |

### 2.4 Container resize triggers (viewport changes)
| Trigger | Location | Notes |
|---------|----------|-------|
| Window resize | ~app.js (existing listener) | Viewport dimensions change |
| Panel collapse/expand | ~app.js:2590 | `propsPanel.classList.toggle('collapsed')` — changes container width |
| Panel resize drag | ~app.js:2598+ | User drags the panel resize handle — changes container width |

### 2.5 Known past bug (layout project) — root cause
A naive `Math.max/min` clamp inside `applyTransform()` broke two-finger macOS
trackpad wheel panning. The layout project's own notes (`SMALL_REQUESTS.md`)
only diagnosed the symptom ("interfered with trackpad wheel during leftward
panning") — the actual mechanism is almost certainly one of these:

1. **Clamping ran on every `applyTransform()` call, including render-only
   calls that never intended to move pan.** If any code path called
   `applyTransform()` without first updating panX/Y for a *new* pointer
   position (e.g. a re-render triggered by something unrelated), the clamp
   would silently snap panX/Y back to the boundary every frame, fighting the
   trackpad's real-time deltas and producing visible jitter/rubber-banding.
2. **Trackpad `wheel` events fire many times per gesture** (not one event
   per "scroll tick" like a mouse wheel). Each event applies a small delta.
   If each one is immediately hard-clamped, and the cursor is already at/near
   the boundary, every subsequent delta in the same direction is silently
   swallowed — but deltas in the *opposite* direction are not, producing an
   asymmetric, sticky feel that reads as "broken panning," specifically
   noticeable when panning left back from a rightward clamp (matches the
   reported "leftward panning" symptom).

**Lesson:** clamp at explicit mutation sites only, never inside
`applyTransform()` (a pure render function called from many places), and
never hard-clamp on every individual trackpad `wheel` tick — defer it (§3.4).

**This spec is a repeat of the same mechanism the layout project hit.** The
riskiest lines in this design are exactly the ones layout got wrong: the
wheel handler and the zoom-at-cursor handler. §3.4 and §3.7 below are
non-negotiable for that reason — see §7 for a pre-flight checklist before
implementation.

Also note **zoom buttons and keyboard +/- currently never touch pan at all**
(see §2.2) — they are a second, independent way for pan to drift out of range
that has nothing to do with wheel/trackpad. They must not be forgotten just
because they weren't the source of the original bug.

## 3. Design

### 3.1 Clamp formula

Let `vw` = container width, `vh` = container height, `cw` = canvasW × zoom,
`ch` = canvasH × zoom, `M` = margin in px.

```
panX_min = M - cw
panX_max = vw - M
panY_min = M - ch
panY_max = vh - M
```

Clamp: `panX = clamp(panX, panX_min, panX_max)`

**Why this works when canvas < viewport:**
If `cw < vw`, then `panX_min = M - cw` is negative and `panX_max = vw - M` is
positive. The range width is `vw - 2M`. When `cw > vw`, the range is
`vw + cw - 2M`, which is larger — correct because the larger canvas can
legitimately extend further off-screen.

When `cw ≤ vw - 2M`, the canvas fits entirely inside the viewport with room to
center. The clamp still works: it allows the canvas to be positioned anywhere
within the margin bounds.

**Edge case: `panX_min > panX_max`** — can occur when `cw + vw < 2M` (e.g.,
tiny viewport plus very small canvas at low zoom). The `clamp()` function
(`Math.max(lo, Math.min(hi, val))`) resolves to `lo`, which is the less
restrictive bound. In practice this is acceptable — the canvas stays at
the right edge within the margin.

### 3.2 Margin value

Default: `M = 100` px. Configurable in `CONFIG.panMargin`.

Rationale: 100px is enough to give a natural "overshoot" feel without letting
the user lose the canvas entirely. Can be adjusted per user preference later.

### 3.3 Where to apply (NOT inside applyTransform)

Apply `clampPan()` at each mutation site:

| Mutation site | Where to clamp |
|---------------|----------------|
| Pointer drag (isPanning) | After `panX += ...` (hard clamp) |
| Wheel pan (plain scroll) | After delta application, before `applyTransform()` (hard clamp) |
| Pinch pan | After `panX += cx - icx` (hard clamp) |
| Zoom at cursor | **Before** zoom computation + **after** (two-pass clamp) |
| Pinch zoom | **Before** zoom computation + **after** (two-pass clamp) |
| Zoom buttons / keyboard +/- | **After** `S.zoom` is set (single-pass — no anchor to preserve) |
| Load path #1 (`loadFromLocalStorage`) | After restoring panX/Y |
| Load path #2 (`btnLoadFile` import) | After restoring panX/Y |
| Load path #3 (`init()` startup) | After restoring panX/Y |
| New canvas (`btnNew`) | After setting panX/Y (defensive; values are safe by construction) |
| Init without saved state | After setting panX/Y (defensive) |
| Window resize | Re-clamp immediately |
| Panel collapse/expand | Re-clamp immediately |
| Panel resize drag (pointerup) | Re-clamp after width set |

### 3.4 Hard clamp everywhere — no deferred approach

Every mutation site applies a **synchronous hard clamp** after modifying
panX/panY. There is no deferred / debounced path.

Trackpad wheel events are clamped on every tick, just like every other input
source. The past bug (layout project) was caused by clamping *inside
`applyTransform()`*, not by clamping per wheel event at the mutation site.
As long as `applyTransform()` itself is never modified, clamping at the
mutation site after every delta is safe.

The two-pass pattern (before + after) is only used where the zoom
computation itself modifies panX/Y to preserve a cursor/midpoint anchor
(ctrl+wheel zoom, pinch zoom). Plain pan operations use a single pass.

### 3.5 Container resize triggers

On window resize, panel collapse, or panel resize drag: re-clamp immediately
(same logic as hard clamp).

```js
function reClampPan() {
    var r = container.getBoundingClientRect();
    var cw = S.canvasW * S.zoom, ch = S.canvasH * S.zoom;
    var m = CONFIG.panMargin;
    S.panX = clamp(S.panX, m - cw, r.width - m);
    S.panY = clamp(S.panY, m - ch, r.height - m);
    applyTransform();
}
```

Bind this to `window.resize` plus wire it into `togglePanel()` and the panel
resize `pointerup` handler.

### 3.6 Constants

Add to `CONFIG`:
```js
CONFIG.panMargin: 100,  // px margin before clamping triggers
```

### 3.7 Zoom-at-cursor order of operations

Naively clamping after zoom-at-cursor breaks the cursor-anchor effect.
The correct order:

1. **Clamp before zoom** — ensure the zoom math works from a valid panX/Y
2. **Run zoom computation** — computes new panX/Y that preserves cursor anchor
3. **Clamp after zoom** — the result may still overshoot; trim it

```
clampPan();              // #1 — start from valid position
// zoom computation: panX = cursorPoint - (cursorPoint - panX) * (nz / zoom)
clampPan();              // #3 — final result stays in bounds
```

The cursor anchor may shift slightly when the user zooms at the viewport
boundary. This is unavoidable and matches the behavior of Google Maps / Figma
— zooming near the edge naturally stops at the boundary.

Same two-pass applies to pinch zoom.

### 3.8 Helper function

```js
function clampPan() {
    var r = container.getBoundingClientRect();
    var cw = S.canvasW * S.zoom, ch = S.canvasH * S.zoom;
    var m = CONFIG.panMargin;
    S.panX = clamp(S.panX, m - cw, r.width - m);
    S.panY = clamp(S.panY, m - ch, r.height - m);
}
```

This is a pure function of container dimensions, canvas content size, and
`S.panX`/`S.panY`. It must never be called inside `applyTransform()`.

## 4. Edge Cases

| Case | Behavior |
|------|----------|
| Canvas smaller than viewport | Clamp range shrinks; canvas can be centered within margin bounds |
| Zoom changes content size | Clamp range updates; two-pass clamp before and after zoom |
| Window shrinks below canvas size | Clamp range tightens; clamp on resize + panel changes |
| Import file with out-of-range pan | Clamp in all three load paths after panX/Y restored |
| Read-only tab receives state | Clamp in `loadFromLocalStorage()` after panX/Y restored |
| Touch pinch pan | Hard clamp after pinch pan delta applied |
| Trackpad wheel inertia | Hard clamped every tick — no deferred window |
| Pan exactly at boundary | No-op clamp; no visual jump |
| `panX_min > panX_max` (tiny content) | `clamp()` resolves to `lo`; stays within margin |
| Panel collapse while panned far | Re-clamp immediately — container just got wider so range expands safely |

## 5. Test Plan

### Manual tests
1. Pan canvas fully left → right edge of canvas should be visible (within margin)
2. Pan canvas fully right → left edge of canvas should be visible (within margin)
3. Same for up/down
4. Zoom in while at clamp boundary → cursor anchor preserved, no flicker
5. Zoom out while at clamp boundary → cursor anchor preserved, no flicker
6. Two-finger trackpad wheel pan → smooth inertia, no jitter at boundary
7. Window resize while panned → pan stays within bounds
8. Collapse/expand properties panel → pan re-clamped to new container width
9. Import a saved state with extreme pan → clamp to valid range on load (all 3 paths)
10. Pinch pan on touch device → clamp applies correctly
11. New canvas → pan centered and valid

### No-regression
- Existing pan behavior unchanged when not at boundary
- No performance regression (clamp is 4 comparisons, called at mutation sites only)
- `applyTransform()` never mutated — no rendering surprises
- Wheel clamp runs per event, at the mutation site, *not* inside `applyTransform()` — this is the key distinction from the layout project's bug

## 6. Implementation Notes

- `clamp()` function already exists (app.js:201: `function clamp(v, lo, hi)`)
- `applyTransform()` must NOT be modified to clamp — it is a pure render function
- All three load paths (500, 3166, 3396) need a `clampPan()` call after panX/Y
- Panel resize `pointerup` handler (~app.js:2600+): add `reClampPan()` after width
- `togglePanel()` (~app.js:2590): add `reClampPan()` after DOM update
- Zoom handlers (lines 2386, 1923): two-pass — `clampPan()` before and after the
  zoom-pan computation
- Zoom buttons (2541, 2546) and keyboard +/- (3281, 3282): single `clampPan()`
  call after each zoom change (no anchor to preserve)

## 7. Pre-Flight Checklist (do these before writing any clamp code)

This feature has broken panning once already on a sibling project. Before
implementing, verify each of these explicitly — do not assume:

1. **Confirm `applyTransform()` has zero side effects beyond setting
   `canvas.style.transform`.** Grep all call sites of `applyTransform` and
   confirm none of them expect it to also clamp/validate state. If clamping
   is ever added inside it "just to be safe," stop — that is the exact
   regression.
2. **Manually test leftward panning specifically** — the original bug report
   called out "leftward panning" by name. Confirm both pan directions (and
   both axes) are symmetric after implementation; an off-by-one in
   `panX_min`/`panX_max` or a sign error in `e.deltaX` handling can produce a
   direction-specific bug that's easy to miss if only one direction is tested.
3. **Test with the properties panel both expanded and collapsed**, and at
   multiple zoom levels, since `cw`/`ch`/`vw` all vary independently and the
   clamp range depends on all three.
4. **Keep `CONFIG.panMargin` easy to set to a very large number (e.g. 100000)
   as a kill switch** — this effectively disables clamping without removing
   code, useful for quickly confirming the clamp (and not something else) is
   the cause of any reported panning issue.

## 8. Rollback Plan

If panning regresses after this ships:
1. Set `CONFIG.panMargin` to a very large value first (fast, no code change)
   to confirm the clamp is the cause.
2. If confirmed, the most likely source of jitter is the wheel handler's
   per-event hard clamp — revert to no clamping in that branch only, or
   reduce `panMargin` to 0 for a softer boundary.
3. Hard-clamp sites (pointer drag, pinch, zoom, resize triggers) are all
   independent and can be removed selectively.
4. All of this should be implemented as small, separately-committable
   changes (per mutation site) specifically so a partial revert is possible.