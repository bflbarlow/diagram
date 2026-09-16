# Arrow-Key Shape Movement — Implementation Plan

## 1. Goal

When one or more shapes are selected (highlighted), pressing the arrow keys
(`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) should nudge all selected
shapes by a fixed step in that direction. Holding `Shift` should move by a
larger "big step" (e.g. jump by the grid size instead of 1px, or a
multiple of it). The behavior should integrate cleanly with the existing
undo/redo, autosave, snap-to-grid, and read-only systems.

This mirrors standard editor conventions (Figma, Illustrator, Sketch):
arrow key = 1px nudge, Shift+arrow = larger nudge, repeated key-down events
while holding the key continue to move the shape, and a single undo entry
is created per "gesture" (i.e., per contiguous hold, not per individual
pixel step).

---

## 2. Current State — Relevant Code

### 2.1 Selection model

`app.js` line 34 / 161–176:

```js
selection: [],  // unified: shape ids ('s...') and conn ids ('c...')
...
function shapeSel() { return S.selection.filter(isShapeId); }
function connSel()  { return S.selection.filter(isConnId); }
```

`shapeSel()` is the canonical way to get the currently-selected shape ids;
it is already used everywhere (duplicate, delete, z-order, lock/unlock).
Arrow-move should use the exact same accessor.

### 2.2 Shape geometry & mutation

Shapes are plain objects with `x`, `y`, `width`, `height` (see
`clampShape()`, line 186–194, and the drag-move code at line 1794–1801):

```js
function clampShape(s) {
    if (s.x < 0) s.x = 0;
    if (s.y < 0) s.y = 0;
    if (s.x + s.width > S.canvasW) s.x = S.canvasW - s.width;
    if (s.y + s.height > S.canvasH) s.y = S.canvasH - s.height;
    if (s.width > S.canvasW) { s.width = S.canvasW; s.x = 0; }
    if (s.height > S.canvasH) { s.height = S.canvasH; s.y = 0; }
}
```

Mouse-drag move (pointermove handler, `S.isDragging` branch, line
~1794–1801):

```js
if (S.isDragging) {
    var dx2 = pos.x - S.dragStart.x, dy2 = pos.y - S.dragStart.y;
    shapeSel().forEach(function(id, i) {
        var s = findShape(id);
        if (!s || !S.dragOrigin[i]) return;
        s.x = snap(S.dragOrigin[i].x + dx2);
        s.y = snap(S.dragOrigin[i].y + dy2);
        clampShape(s);
    });
    render();
    return;
}
```

Note this snaps to grid **during** the drag, and calls `clampShape` per
shape but does **not** call `pushUndo()` per-frame — undo is pushed once on
`pointerup` (line ~1884: `logAction('Moved '+...)`, followed later by
`pushUndo()`). Arrow-move must follow the same "one undo entry per
gesture" pattern, not one per keydown.

### 2.3 Locked shapes

Locked shapes are excluded from drag-move and resize:

```js
if (S.selection.includes(s.id) && !s.locked) { ... }   // line 1196, 1447
if (!hit.locked) { ... }                                // line 1533
```

Arrow-move must also skip locked shapes.

### 2.4 Connections attached to shapes

Connections (`S.connections`) reference shapes by id (`c.from`, `c.to`) and
are recomputed live from shape position via `connEndpoints(c)` (line
1046–1063), which calls `getShapeOutlinePoint` / port lookups. Because
connections are derived from shape `x`/`y` at render time, **no additional
connection-update code is needed** — moving a shape's `x`/`y` and calling
`render()` is sufficient for attached connections to follow, exactly as
happens during mouse drag.

Anchor shapes (`s.isAnchor`) are also just shapes with `x`/`y`, so if an
anchor happens to be selected (rare, since anchors are normally hidden
selection targets only reachable via connection-endpoint dragging) it will
be moved the same way. No special-case needed.

### 2.5 Existing keyboard handler

`app.js` line 2808 (`document.addEventListener('keydown', ...)`):

```js
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var isMutationKey = (e.key === 'Delete' || e.key === 'Backspace' ||
        (e.ctrlKey || e.metaKey) && (...));
    if (S.readOnly && isMutationKey) return;

    if (e.key === 'Delete' || e.key === 'Backspace') { ... }
    if (e.key === 'Escape') { ... }
    var keys = { v:'select', l:'line', t:'text' };
    if (keys[e.key] && !e.ctrlKey && !e.metaKey) { ... return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { ... }
    ...
});
```

This is a single global listener with no keyup counterpart and no repeat
suppression logic. `e.repeat` (native `KeyboardEvent.repeat`, true while a
key is held) is not currently used anywhere in the codebase.

There is no existing `keyup` listener on `document` for canvas editing —
only `textInput.addEventListener('keydown', ...)` for the inline text
editor (line 2147), which is scoped to that input and irrelevant here.

### 2.6 Undo / autosave

```js
function pushUndo() {
    S.undoStack.push(JSON.stringify({ shapes: S.shapes, connections: S.connections }));
    if (S.undoStack.length > CONFIG.maxUndo) S.undoStack.shift();
    S.redoStack = [];
    scheduleSave();
}
```

`pushUndo()` serializes the **entire** shapes+connections array. Calling it
on every single keydown while a user holds an arrow key (which fires
keydown repeatedly, often 20-30 times/sec) would flood `S.undoStack` with
near-duplicate entries and blow through `CONFIG.maxUndo` (50) almost
immediately, making undo useless for anything else the user did before the
move. This must be avoided — see §3.4.

`scheduleSave()` (referenced by `pushUndo`) debounces the actual disk/
autosave write (see `saveState`/`_saveTimer`, line 362-364), so it is fine
to keep calling indirectly through `pushUndo`, but we still want to avoid
calling `pushUndo` on every intermediate step regardless, purely for undo
history correctness.

### 2.7 Read-only mode

`S.readOnly` gates mutation keys already (line 2811-2813). Arrow-move must
be added to the `isMutationKey` check so read-only tabs (multi-tab editing
lock, see `logAction('Switched to read-only...')`) cannot move shapes.

---

## 3. Design

### 3.1 Step sizes

Add to `CONFIG` (near `gridSize`, `snapToGrid`, line 48):

```js
arrowStep: 1,        // px per arrow-key press (no modifier)
arrowStepBig: null,  // computed from gridSize if null; see below
```

Behavior:
- Plain arrow key → move by `CONFIG.arrowStep` (1px), **ignoring**
  snap-to-grid (matches Figma/Sketch convention: fine nudge is
  independent of the grid).
- `Shift` + arrow key → move by the grid size (`S.gridSize`, default 20px)
  if `S.snapToGrid` is on, otherwise a fixed larger step (e.g. 10px). This
  gives a natural "snap to next grid line" feel when grid snapping is
  enabled, and a plain bigger nudge otherwise.
- `Alt`/`Option` + arrow key: not implemented in v1 (reserved for a
  possible future "move by 1 grid cell always" modifier); explicitly
  documented as unsupported so it's not confused with browser/OS shortcuts
  (Alt+Arrow is used for history navigation in some browsers when focus is
  on the page body, so avoid colliding with it).

### 3.2 Direction mapping

```js
var ARROW_DELTA = {
    ArrowUp:    { dx: 0,  dy: -1 },
    ArrowDown:  { dx: 0,  dy: 1  },
    ArrowLeft:  { dx: -1, dy: 0  },
    ArrowRight: { dx: 1,  dy: 0  }
};
```

### 3.3 Where to hook in

Add a new block inside the existing `document.addEventListener('keydown', ...)`
handler in `app.js`, near the `Delete`/`Backspace` block (so it shares the
same guard clauses for input-focus and read-only mode). Do **not** create a
second global listener — consistency with the rest of the file's single-
listener pattern, and avoids double-handling/order-of-operations bugs.

```js
if (ARROW_DELTA[e.key] && shapeSel().length && !textEditor.classList.contains('visible')) {
    e.preventDefault(); // stop page/canvas scroll
    var delta = ARROW_DELTA[e.key];
    var step = e.shiftKey
        ? (S.snapToGrid ? S.gridSize : CONFIG.arrowStepBig)
        : CONFIG.arrowStep;
    var moved = false;
    shapeSel().forEach(function(id) {
        var s = findShape(id);
        if (!s || s.locked) return;
        s.x += delta.dx * step;
        s.y += delta.dy * step;
        clampShape(s);
        moved = true;
    });
    if (moved) {
        render();
        scheduleArrowUndo();   // debounced, see §3.4
    }
}
```

Key points:
- Guard on `shapeSel().length` so the handler is a no-op (and does not
  call `e.preventDefault()`) when nothing is selected — this preserves
  default browser behavior (e.g. arrow keys scrolling the page) when the
  canvas has no selection, matching how `Delete`/`Backspace` already only
  acts when something is selected.
- Guard on `!textEditor.classList.contains('visible')` so arrow keys still
  move the text caret when the inline text editor is open, instead of
  moving the shape underneath it. (The existing `Enter` handler at line
  2854 uses the same pattern.)
- `s.locked` is checked per-shape (not just `shapeSel()` filtering) to
  match the existing lock behavior used by drag/resize.
- Reuse `clampShape(s)` so shapes can't be pushed off-canvas, identical to
  mouse-drag behavior.
- Deliberately **do not** call `snap()` on the new `x`/`y` for the
  1px-step case — snapping every 1px step to a 20px grid would make plain
  arrow presses feel broken (nothing would move until you'd pressed 20
  times). Only the Shift+arrow "big step" aligns with the grid, and since
  it moves by exactly `S.gridSize` from whatever the current position is,
  it does not need `snap()` unless the shape started off-grid — see §3.6
  for that edge case.

### 3.4 Undo batching strategy

Goal: one undo entry per contiguous "hold", not one per repeated keydown
event, mirroring how mouse-drag only pushes undo once on `pointerup`.

Approach: debounce `pushUndo()` using `keyup` as the natural end-of-gesture
signal, with a timer fallback in case `keyup` is missed (e.g. focus loss
mid-press, which happens if a browser dialog steals focus).

```js
var _arrowMoveActive = false;
var _arrowMoveTimer = null;

function scheduleArrowUndo() {
    if (!_arrowMoveActive) {
        _arrowMoveActive = true;
        logAction('Moved '+shapeSel().length+' shape(s) (arrow key)', 'move');
    }
    // Safety fallback: if keyup never fires (focus loss), commit after a pause.
    clearTimeout(_arrowMoveTimer);
    _arrowMoveTimer = setTimeout(commitArrowMove, 500);
}

function commitArrowMove() {
    if (!_arrowMoveActive) return;
    _arrowMoveActive = false;
    clearTimeout(_arrowMoveTimer);
    pushUndo();
}

document.addEventListener('keyup', function(e) {
    if (ARROW_DELTA[e.key]) commitArrowMove();
});
```

This means:
- The **live position** update happens immediately on every keydown/repeat
  (so the shape visibly moves smoothly while the key is held).
- The **undo snapshot** is captured lazily: the first arrow-keydown of a
  gesture logs the action once; the undo push itself is deferred until
  `keyup` (i.e., after all movement for that gesture is done), so the
  single undo entry captures the *final* position, and undo reverts the
  whole gesture in one step — exactly matching mouse-drag semantics where
  `pushUndo()` is called once on `pointerup` with the final shape state.
- If the user holds and moves diagonally by pressing two arrow keys in
  quick succession without releasing either, `_arrowMoveActive` stays true
  across both, and both keyups will each try to commit — the second
  `commitArrowMove()` call is a safe no-op because `_arrowMoveActive` is
  already false after the first.
- The 500ms fallback timer guards against a stuck-active state if `keyup`
  is somehow swallowed (alt-tab, devtools focus steal, etc.), so the user
  never loses more than 500ms worth of arrow-nudges as "uncommitted" (they
  are already applied to `S.shapes`, only the undo snapshot is delayed).

Note: this is a deliberate deviation from the one-`pushUndo()`-per-mutation
convention used elsewhere in the file (e.g. `deleteShape` calls `pushUndo()`
internally). Arrow-move needs the batching behavior described above, so it
must **not** call `pushUndo()` directly inside the per-shape loop or on
every keydown — that would defeat the purpose. This should be called out
in a code comment at the call site to avoid future confusion/regression.

### 3.5 Read-only mode

Add arrow keys to the existing `isMutationKey` check so a read-only tab
(the multi-tab "another tab is editor" lock, `S.readOnly`) cannot move
shapes:

```js
var isMutationKey = (e.key === 'Delete' || e.key === 'Backspace' ||
    ARROW_DELTA[e.key] ||
    (e.ctrlKey || e.metaKey) && (...));
if (S.readOnly && isMutationKey) return;
```

### 3.6 Interplay with snap-to-grid for off-grid shapes

If a shape's current `x`/`y` is not a multiple of `S.gridSize` (e.g. it was
placed with snap-to-grid off, or resized to an odd value), a Shift+arrow
big-step should still move it by exactly `S.gridSize`, preserving its
offset from the grid rather than snapping it onto the grid. This matches
user expectation that Shift+arrow is "move by one grid unit," not
"snap to grid." No `snap()` call is needed for this — simple arithmetic
(`s.x += delta.dx * step`) already does the right thing.

If product wants "snap onto the grid line" semantics instead, that would
require calling `snap(s.x + delta.dx*step)`, but this plan recommends the
offset-preserving version as it's less surprising and matches the drag
behavior (drag also does `snap(origin + delta)`, which similarly preserves
relative offset rather than forcing onto absolute grid lines — actually
drag re-snaps every frame from `dragOrigin`, so if `dragOrigin` was
off-grid to begin with, drag *does* pull it onto the grid immediately.
For consistency with drag, an alternative simpler design is documented in
§3.7 below).

### 3.7 Alternative: always snap when snap-to-grid is enabled

For maximum consistency with mouse-drag (which always calls `snap()`
during a drag when `S.snapToGrid` is on — see `snap()`, line 186), an
alternative and arguably simpler implementation is:

```js
if (S.snapToGrid && e.shiftKey) {
    s.x = snap(s.x + delta.dx * step);
    s.y = snap(s.y + delta.dy * step);
} else {
    s.x += delta.dx * step;
    s.y += delta.dy * step;
}
```

This is the **recommended final implementation** (simpler than §3.6's
manual offset reasoning, and reuses the existing `snap()` helper instead of
introducing new grid-alignment logic). Plain arrows (no Shift) never snap,
regardless of `S.snapToGrid` state, so fine 1px nudging always works even
with snap-to-grid on — this matches Figma's convention where arrow keys
nudge by 1px unconditionally and only the "move to next grid cell"
modifier respects the grid.

### 3.8 Multi-shape selection

`shapeSel().forEach(...)` already moves every selected shape by the same
delta, exactly like the mouse-drag case (which iterates `shapeSel()` in
lockstep with `S.dragOrigin`). No special multi-select code is required —
each shape is moved independently by the same `dx`/`dy`, preserving
relative positions. Locked shapes inside a multi-selection are skipped
individually (per-shape `if (s.locked) return;`), matching existing
lock semantics elsewhere (drag/resize skip locked shapes too, but do not
remove them from the visual selection).

### 3.9 Connections and other selection kinds

If the selection contains connection ids (`connSel()`) rather than shape
ids, arrow keys should simply do nothing for those ids — connections don't
have their own `x`/`y`; they're derived from the shapes/anchors they
connect. This is naturally satisfied since the plan only reads
`shapeSel()`, ignoring `connSel()` entirely. No explicit code needed, but
worth a test case (select a connection only, press arrow key, confirm
nothing moves and no console errors).

If a user has both shapes and a connection selected (mixed selection is
disallowed by `select()`'s cross-kind-clearing logic at line 167-172,
so this can't actually happen in the current selection model — confirmed
by reading `select()`), this is a non-issue, but the plan should still be
robust to it via `shapeSel()` filtering, in case that invariant changes
later.

---

## 4. Implementation Steps

1. **Add `ARROW_DELTA` constant** near the top of `app.js`, alongside other
   module-level constants (e.g. near `CONFIG`, around line 20-50).
2. **Add `CONFIG.arrowStep` and `CONFIG.arrowStepBig`** to the `CONFIG`
   object (line ~21-48). Suggested values: `arrowStep: 1`,
   `arrowStepBig: 10` (used only when `S.snapToGrid` is off; when on, the
   big step is `S.gridSize`).
3. **Add `_arrowMoveActive` / `_arrowMoveTimer` module-level state** and
   the `scheduleArrowUndo()` / `commitArrowMove()` helper functions, placed
   near `pushUndo()`/`undo()`/`redo()` (around line 780-805) since they are
   part of the same undo-management concern.
4. **Extend the existing `keydown` listener** (line 2808) with the new
   arrow-key block, placed after the `Delete`/`Backspace` block and before
   the tool-switch (`v`/`l`/`t`) block, so it's grouped with other
   selection-mutating actions.
5. **Extend `isMutationKey`** in the same listener to include arrow keys,
   for read-only gating.
6. **Add a new `document.addEventListener('keyup', ...)`** listener (new,
   since none currently exists for canvas-level keys) that calls
   `commitArrowMove()` when an arrow key is released. Place it directly
   after the `keydown` listener block for locality.
7. **Update `README.md` keyboard shortcuts table** (line 94-113) to add:
   ```
   | Arrow keys | Move selected shape(s) by 1px |
   | Shift+Arrow | Move selected shape(s) by grid size |
   ```
8. **Manual test pass** — see §6 checklist.

No changes are needed to:
- `renderShapes()` / `renderConns()` — they already read `s.x`/`s.y` and
  `connEndpoints()` live on every `render()` call.
- `saveState()` / autosave — already wired through `pushUndo()` →
  `scheduleSave()`.
- Properties panel (`renderProps()`, which shows `propX`/`propY` fields for
  the selected shape) — since it re-renders on every `render()` call, it
  will automatically reflect the new position after each arrow-key nudge.

---

## 5. Edge Cases & Risks

| Case | Handling |
|---|---|
| No shape selected | Handler no-ops (guarded by `shapeSel().length` check); arrow keys retain default browser behavior (e.g. scroll) |
| Text editor open (`textEditor` visible) | Arrow keys pass through to caret movement inside the contenteditable/input, not shape movement (guarded by visibility check) |
| Shape is locked | Skipped per-shape inside the `forEach`; other selected unlocked shapes still move |
| All selected shapes are locked | `moved` stays `false`; no `render()`/undo call occurs (avoids polluting undo stack with no-op entries) |
| Read-only tab (`S.readOnly`) | Blocked via `isMutationKey` check, same as Delete/Backspace |
| Shape at canvas edge | `clampShape(s)` prevents moving past `S.canvasW`/`S.canvasH` bounds, identical to drag behavior |
| Rapid key-repeat (holding key down) | Each `keydown` (including OS auto-repeat events) applies one step; only one throttled undo push occurs at `keyup` |
| Two arrow keys held simultaneously (diagonal) | Both keydowns apply their own delta independently; `_arrowMoveActive` guards against double-logging; final `keyup` of either key correctly commits once |
| Browser back/forward on Alt+Arrow | Not intercepted (Alt modifier intentionally unhandled in v1), so OS/browser default behavior for Alt+Arrow, if any, is preserved |
| Focus lost mid-hold (e.g. alt-tab) | 500ms fallback timer in `scheduleArrowUndo()` commits the undo snapshot even without `keyup` |
| Connection selected only (no shapes) | No-op — `shapeSel()` is empty, so `shapeSel().length` guard fails and handler exits immediately |
| Arrow key used while a shape is mid-text-edit via double-click / Enter | Already covered by the `textEditor.classList.contains('visible')` guard |
| Undo after arrow-move | Reverts the entire gesture (all steps since the key was first pressed) in a single undo step, consistent with mouse-drag undo granularity |
| Multiple shapes at different z-order all selected | Each moves independently by the same delta; z-order/`connZ` unaffected since arrow-move never touches z-index fields |

---

## 6. Testing Checklist

- [ ] Select one shape, press each arrow key once → moves 1px in the
      correct direction
- [ ] Select one shape, hold an arrow key → smooth continuous movement,
      single undo entry created on release (`Ctrl/Cmd+Z` once fully
      reverts to start position)
- [ ] Select one shape, hold Shift+Arrow → moves by grid size (20px
      default) when snap-to-grid is on
- [ ] Toggle snap-to-grid off, hold Shift+Arrow → moves by
      `CONFIG.arrowStepBig` (10px) per step
- [ ] Select multiple shapes, press arrow key → all move together,
      relative positions preserved
- [ ] Select a shape with a connection attached to another shape → the
      connection visually follows during arrow-move, same as mouse drag
- [ ] Lock a shape, select it (and another unlocked shape), press arrow
      key → only the unlocked shape moves
- [ ] Select only locked shape(s), press arrow key → nothing moves, no
      undo entry created
- [ ] Select nothing, press arrow key → page/canvas does not move shapes;
      default browser scroll behavior (if any) is not blocked
- [ ] Double-click a shape to enter text-edit mode, press arrow keys →
      caret moves inside the text editor, shape does not move
- [ ] Open a second browser tab to trigger read-only mode, select a
      shape, press arrow key → shape does not move, no console errors
- [ ] Move a shape to the canvas edge, keep pressing arrow key toward the
      edge → shape stops at the boundary (`clampShape`), no negative
      coordinates
- [ ] Select only a connection (no shapes), press arrow key → no error,
      nothing moves
- [ ] Press and hold two different arrow keys together (diagonal) →
      shape moves diagonally, releasing either key still results in a
      single correct undo entry
- [ ] Verify autosave triggers after arrow-move (check `scheduleSave`
      debounce fires within its configured delay after `keyup`)
- [ ] Verify Properties panel X/Y fields update live while holding an
      arrow key

---

## 7. Files To Change

| File | Change |
|---|---|
| `app.js` | Add `ARROW_DELTA` constant, `CONFIG.arrowStep`/`arrowStepBig`, arrow-key block in `keydown` listener, new `keyup` listener, `scheduleArrowUndo`/`commitArrowMove` helpers, extend `isMutationKey` |
| `README.md` | Add arrow-key entries to the Keyboard Shortcuts table |
| `documents/ARROW_MOVE.md` | This plan (already written) |

No changes required to `index.html`, `styles.css`, or `about.html`.
