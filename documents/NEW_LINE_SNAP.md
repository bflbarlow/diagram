# New Line Snap: Analysis & Implementation Plan

## Current Behavior Analysis

There are two distinct code paths in `app.js` that handle connection endpoint snapping to shapes:

### Path A: Existing Line End Drag (`S.isDraggingConn`)
Triggered when the user picks up and drags an endpoint of an already-existing connection.

**Pointer-up commit (`pointerup`, lines ~1929–2009):**
1. Uses `findNearestShape({ x: epX, y: epY }, CONFIG.snapPx / S.zoom)` to detect if the dragged endpoint is near any shape
2. If a shape is found, **first checks for port snap** using `nearestPort({ x: epX, y: epY }, snapShape, 14 / S.zoom)` — tests if the cursor is within ~14 canvas-space pixels of one of the 8 named ports (top-left, top-center, top-right, middle-left, middle-right, bottom-left, bottom-center, bottom-right)
3. If a port is within range, attaches the connection to that exact port using `absToRel(snapShape, portSnap.port)` — this locks the attachment to a fixed relative position on the shape edge
4. Falls back to `getShapeOutlinePoint(snapShape, epX, epY)` → `absToRel(snapShape, outlinePt)` if no port is within range — computes the outline intersection dynamically

**Visual feedback during drag (`pointermove`, lines ~1769–1849):**
- Draws a highlight ring around any nearby shape
- **Draws all 8 port indicator dots** (small circles) on the shape
- **Highlights the nearest port** in solid accent color; other ports are semi-transparent
- Shows a dashed preview line from the other endpoint to the cursor position

### Path B: New Line Drawing (`S.isDrawing`)
Triggered when the user clicks+drags with the Line tool active, either from a shape outline or from empty canvas.

**Pointer-up commit (`pointerup`, lines ~2012–2085):**
1. Uses `findNearestShape(S.drawStart, snpPx)` for the start point and `findNearestShape(rawPos, snpPx)` for the end point
2. If a shape is found at either end, **directly uses `getShapeOutlinePoint`** to find the perimeter intersection point — **no port snapping check**
3. Uses `absToRel(shape, { x: fromX, y: fromY })` to lock the attachment, but this is the outline intersection point, not necessarily a port

**Visual feedback during preview (`pointermove`, lines ~1850–1877):**
- Draws a highlight ring around any nearby shape
- **Does NOT draw port indicators** — no 8-port dots or port-snapping visual
- Shows a dashed preview line from start to cursor

> **Note on line numbers:** All line numbers in this document are approximate and will drift as `app.js` is edited. Use the function/branch names (`S.isDraggingConn`, `S.isDrawing`, `startDrawingFromShape`, `nearestPort`, `shapePorts`) as the authoritative anchors when locating code, not the line numbers.

### Key Differences Summary

| Feature | Existing Line End Drag | New Line Drawing |
|---|---|---|
| Port snap detection | ✅ `nearestPort()` with 14px radius | ❌ Missing — uses `getShapeOutlinePoint` directly |
| Port indicator dots on preview | ✅ 8 dots drawn, nearest highlighted | ❌ Missing — only shows shape highlight ring |
| Fallback to outline point | ✅ Yes, after port check fails | ✅ Yes, but always used (no port check) |
| Attachment locked via fromRel/toRel | ✅ Yes | ✅ Yes (but at arbitrary outline point, not port) |

## Desired Behavior

New line drawing should match the existing line end drag behavior:

1. **During preview** (`pointermove`): When the line tool preview detects that the cursor is near a shape, show the 8 port indicators on that shape, highlighting the nearest port (just like endpoint drag does).

2. **On commit** (`pointerup`): When snapping an endpoint to a shape, first attempt a port snap via `nearestPort()` with the same 14px canvas-space threshold. Only fall back to `getShapeOutlinePoint` if no port is within range.

## Implementation Plan

### 1. Extract a Shared Port-Preview Helper

**File:** `app.js`
**Location:** After line ~310 (after the `nearestPort` function)

Create a shared function `renderPortPreviewHTML(nearShape, cursorX, cursorY, accent)` that generates the port indicator HTML. This function currently exists inline (duplicated logic, not a callable function) in the `S.isDraggingConn` branch of `pointermove` (lines ~1801–1815). Extract it into a standalone function so both code paths can call it, and update the existing drag-end branch to call the new shared function instead of keeping its own inline copy — this avoids having two divergent implementations of the same port-dot rendering logic.

```javascript
function renderPortPreviewHTML(nearShape, cursorX, cursorY, accent) {
    var html = '';
    var portR = 14 / S.zoom;
    var ports = shapePorts(nearShape);
    var nearPort = nearestPort({ x: cursorX, y: cursorY }, nearShape, portR);
    ports.forEach(function(p) {
        var isNearest = nearPort && p.x === nearPort.port.x && p.y === nearPort.port.y;
        html += '<div style="position:absolute;left:'+(p.x-4)+'px;top:'+(p.y-4)+'px;width:8px;height:8px;border-radius:50%;border:2px solid '+accent+';background:'+(isNearest ? accent : 'transparent')+';opacity:'+(isNearest ? '1' : '0.5')+'"></div>';
    });
    return html;
}
```

### 2. Update `pointermove` — New Line Preview

**File:** `app.js`
**Location:** Around line 1862, in the `else` branch of `S.isDrawing` (the line-preview branch)

Currently (lines 1862–1877):
```javascript
var snapThresh = CONFIG.snapPx / S.zoom;
var ss2 = S.drawStartShapeId ? findShape(S.drawStartShapeId) : findNearestShape(S.drawStart, snapThresh);
var se2 = findNearestShape({ x: sx, y: sy }, snapThresh);
var lx1 = S.drawStart.x, ly1 = S.drawStart.y;
var lx2 = sx, ly2 = sy;
if (ss2) { var op = getShapeOutlinePoint(ss2, lx2, ly2); lx1 = op.x; ly1 = op.y; }
if (se2) { var op2 = getShapeOutlinePoint(se2, lx1, ly1); lx2 = op2.x; ly2 = op2.y; }
var ac3 = T.accent || '#2563EB';
var highlight = '';
if (ss2) highlight += '<div class="snap-highlight" ...>';
if (se2 && se2 !== ss2) highlight += '<div class="snap-highlight" ...>';
previewLayer.innerHTML = highlight + '<svg>...';
```

**Changes needed — IMPORTANT correction:**

The port-proximity check for each shape must use the **cursor/candidate position relevant to that specific endpoint**, not a single shared cursor position for both ends. This mirrors drag-end behavior, where `nearestPort()` is only ever evaluated against the position of the endpoint actually being moved.

- **Start shape (`ss2`):** The start endpoint is *fixed* at `S.drawStart` for the entire gesture (it was already committed when the user pressed down — either snapped to a shape/port in `startDrawingFromShape`, or fixed in empty space). It does **not** track the live cursor. Therefore the port-proximity check for `ss2` must use `S.drawStart` (i.e. `renderPortPreviewHTML(ss2, S.drawStart.x, S.drawStart.y, ac3)`), **not** `(sx, sy)`. Using the live cursor position here would be incorrect — it would cause the "nearest port" highlight on the start shape to change as the mouse moves, even though the start point is already locked.
- **End shape (`se2`):** The end endpoint *does* track the live cursor (that's the point being dragged), so its port-proximity check correctly uses the current canvas position `(sx, sy)`: `renderPortPreviewHTML(se2, sx, sy, ac3)`.
- Because `S.drawStartShapeId` (when set) already identifies `ss2` unambiguously, no additional lookup logic is needed for the start shape beyond what already exists — only the port-preview call needs to be added.

**Enhanced preview HTML construction:**
```javascript
var previewHTML = '';

// Start shape port indicators — checked against the FIXED start point, not the cursor
if (ss2 && !ss2.isAnchor) {
    previewHTML += renderPortPreviewHTML(ss2, S.drawStart.x, S.drawStart.y, ac3);
}
// ... existing highlight rings ...
if (ss2) previewHTML += '<div class="snap-highlight" ...>';
// End shape port indicators — checked against the LIVE cursor position
if (se2 && se2 !== ss2 && !se2.isAnchor) {
    previewHTML += renderPortPreviewHTML(se2, sx, sy, ac3);
}
if (se2 && se2 !== ss2) previewHTML += '<div class="snap-highlight" ...>';

previewHTML += '<svg>...</svg>';
previewLayer.innerHTML = previewHTML;
```

Note: this also means the existing line-preview code's use of `getShapeOutlinePoint(ss2, lx2, ly2)` for the start-shape endpoint position (line 1868 in current code) should conceptually be replaced with the snapped port position when a port match exists, so the preview line itself visually terminates at the port dot rather than a generic outline point. See Step 3 for the equivalent commit-time logic; the preview should compute the same point so the dashed line and the final committed line match exactly.

### 2.5. ⚠️ CRITICAL BUG (found post-implementation): Outline Fallback Uses Wrong Projection Target

**Status:** Confirmed via manual testing and code review. This is a real, user-visible bug in the *implemented* code (not just a planning error) — the Step 3 plan below was implemented as written, but the plan itself preserved a pre-existing defect rather than fixing it.

**Symptom (as reported by testing):** Box 1 is positioned up-and-to-the-left of Box 2. Using the line tool, the user clicks the top edge of Box 1 (left-of-center) and drags to the bottom edge of Box 2 (right-of-center), then releases. Expected: the line starts near the clicked point on Box 1's top edge and ends near the released point on Box 2's bottom edge. **Actual:** the line is drawn between Box 1's bottom-right corner and Box 2's left edge — i.e., the *shortest-distance* points between the two shapes, completely ignoring where the user actually clicked and released.

**Root cause:** In the `pointerup` commit code (both in the originally-existing code and in the Step 3 plan below), the outline-fallback branch — used whenever the port-proximity check misses (e.g. clicking the middle of an edge, not within ~14px of a named port) — calls `getShapeOutlinePoint(shape, otherEndpointX, otherEndpointY)`. This function returns the point on `shape`'s boundary that lies in the direction of the given target coordinate. By passing the **other endpoint's position** as that target, the function always returns the boundary point closest to the *other shape*, not the point closest to where the user actually clicked/released on *this* shape. With two shapes, this collapses to the classic "shortest line between two rectangles" geometry — corner-to-edge, edge-to-corner, etc. — regardless of the user's actual click positions.

Concretely, in the current/planned code:
```javascript
// Start shape fallback — WRONG: projects toward the END point, not the actual click
var p = getShapeOutlinePoint(sxSnap, toX, toY);
fromX = p.x; fromY = p.y;

// End shape fallback — WRONG: projects toward the START point, not the actual release point
var p2 = getShapeOutlinePoint(seSnap, fromX, fromY);
toX = p2.x; toY = p2.y;
```

**Why drag-end does NOT have this bug:** The existing drag-end commit code (`S.isDraggingConn` branch) calls `getShapeOutlinePoint(snapShape, epX, epY)`, where `epX, epY` is the **actual live cursor position of the endpoint currently being dragged** — never the other endpoint's position. Each endpoint's outline point is always computed relative to *its own* cursor/click position. This is the correct pattern, and it's what new-line commit should have replicated, but didn't — the Step 3 plan below carried the bug forward by analogy without checking the projection-target argument specifically.

**Correct fix:** Each endpoint's outline-fallback projection target must be **that same endpoint's own click/release position** — never the other endpoint's position:

- Start shape (`sxSnap`) fallback: `getShapeOutlinePoint(sxSnap, S.drawStart.x, S.drawStart.y)` — project toward the point the user actually clicked (`S.drawStart`, which is fixed once set), not toward `toX, toY`.
- End shape (`seSnap`) fallback: `getShapeOutlinePoint(seSnap, rawPos.x, rawPos.y)` — project toward the point the user actually released (`rawPos`), not toward `fromX, fromY`.

This one-argument correction (swapping the target coordinates) is the entire fix. The port-check-first structure in Step 3 below is otherwise correct and does not need to change — only the two `getShapeOutlinePoint(...)` calls in the `else` fallback branches need their second/third arguments corrected.

**Note:** This same self-referential-target pattern must also be applied to the `pointermove` preview code (Step 2) if/when the preview is enhanced to show a live outline-snap point for the *start* shape — currently the preview's start point is simply pinned to `S.drawStart` and never re-projected (see Step 2's "IMPORTANT correction"), so the preview itself does not exhibit this bug. Only the commit-time fallback in Step 3 needs the fix.

### 3. Update `pointerup` — New Line Commit Port Snap

**File:** `app.js`
**Location:** Around line 2058, in the `S.isDrawing` branch

Currently (lines 2058–2065):
```javascript
var snpPx = CONFIG.snapPx / S.zoom;
var sxSnap = S.drawStartShapeId ? findShape(S.drawStartShapeId) : findNearestShape(S.drawStart, snpPx);
var seSnap = findNearestShape(rawPos, snpPx);
var fromX = S.drawStart.x, fromY = S.drawStart.y;
var toX = ex, toY = ey;
if (sxSnap) { var p = getShapeOutlinePoint(sxSnap, toX, toY); fromX = p.x; fromY = p.y; }
if (seSnap) { var p2 = getShapeOutlinePoint(seSnap, fromX, fromY); toX = p2.x; toY = p2.y; }
```

**⚠️ This "currently" snippet already contains the shortest-distance bug described in section 2.5** — note that `getShapeOutlinePoint(sxSnap, toX, toY)` projects the start point toward the *end* coordinates, and `getShapeOutlinePoint(seSnap, fromX, fromY)` projects the end point toward the (already-recomputed) *start* coordinates. Both must be corrected to use each endpoint's own click/release position, not the other endpoint's position.

**Changes needed:**
Replace the direct `getShapeOutlinePoint` calls with a port-check-first approach, mirroring the pattern in the drag-end code (lines 1943–1967) — **and, critically, fixing the projection-target bug from section 2.5 at the same time** (do not merely add port-checking on top of the existing broken fallback):

For the **start shape** (`sxSnap`):
```javascript
if (sxSnap) {
    var portSnapStart = nearestPort({ x: S.drawStart.x, y: S.drawStart.y }, sxSnap, 14 / S.zoom);
    if (portSnapStart) {
        fromX = portSnapStart.port.x;
        fromY = portSnapStart.port.y;
    } else {
        // FIXED: project toward the start shape's OWN click point (S.drawStart),
        // not toward the other endpoint (toX, toY). Using toX/toY here is the bug
        // described in section 2.5 — it produces shortest-distance-between-shapes
        // geometry instead of honoring where the user actually clicked.
        var p = getShapeOutlinePoint(sxSnap, S.drawStart.x, S.drawStart.y);
        fromX = p.x;
        fromY = p.y;
    }
}
```

For the **end shape** (`seSnap`):
```javascript
if (seSnap) {
    var portSnapEnd = nearestPort({ x: rawPos.x, y: rawPos.y }, seSnap, 14 / S.zoom);
    if (portSnapEnd) {
        toX = portSnapEnd.port.x;
        toY = portSnapEnd.port.y;
    } else {
        // FIXED: project toward the end shape's OWN release point (rawPos),
        // not toward the other endpoint (fromX, fromY). Same bug class as above.
        var p2 = getShapeOutlinePoint(seSnap, rawPos.x, rawPos.y);
        toX = p2.x;
        toY = p2.y;
    }
}
```

Note: the port candidate position for the start shape uses `S.drawStart` (the initial click point), since the start end has already been fixed by the initial click on the shape outline. The outline-fallback projection target must use this same `S.drawStart` point — not the end coordinates — for the same reason. Likewise the end shape's outline-fallback must use `rawPos` (the actual release point), not the start coordinates.

However, there's a subtlety: when `S.drawStartShapeId` is set (the user clicked on a shape to start the line), `sxSnap` is that exact shape. In this case, **if Step 4 (`startDrawingFromShape`) is implemented**, `S.drawStart` has *already* been snapped to the nearest port on pointerdown. Re-running `nearestPort({x: S.drawStart.x, y: S.drawStart.y}, sxSnap, 14/S.zoom)` at commit time will trivially re-find the same port at distance 0 — this is redundant but harmless (it's cheap, and guarantees correctness even if Step 4 is skipped or the shape's geometry changed mid-drag, e.g. via a resize from another tab in a future multi-user scenario). Implementers may treat the Step 3 start-shape check as a defensive re-confirmation rather than a new decision point.

When `S.drawStartShapeId` is NOT set (user started from empty canvas and the drag start happened to land within snap range of a shape found via `findNearestShape`), `sxSnap` is determined by `findNearestShape(S.drawStart, snpPx)`, and `S.drawStart` was never snapped to a port by any earlier step. In this case the Step 3 port check is the *only* place the start endpoint gets port-snapped, so it is not redundant.

**Contrast with drag-end's "skip re-snap" guard:** The existing drag-end commit code (lines ~1950–1953) contains a special case to skip recomputing `fromRel`/`toRel` when the dragged endpoint is released back onto the *same* shape it was already attached to (to avoid silently shifting a click-only, no-drag interaction). This guard has **no equivalent in new-line creation**, because every commit of `S.isDrawing` always creates a brand-new connection via `addConn(...)` — there is no "already attached" prior state to preserve. This is intentionally not mirrored and should not be added.

### 4. Handle `startDrawingFromShape` Port-aware Initial Snap

**File:** `app.js`
**Location:** Function `startDrawingFromShape` (around line 1390)

Currently this function draws the initial snap highlight on the shape but doesn't check for port proximity. When the user clicks a shape with the line tool, we should check if they clicked near a port and snap to it:

```javascript
function startDrawingFromShape(shape, pos) {
    // Check for port snap first
    var portSnap = nearestPort(pos, shape, 14 / S.zoom);
    var ep;
    if (portSnap) {
        ep = { x: portSnap.port.x, y: portSnap.port.y };
    } else {
        ep = getShapeOutlinePoint(shape, pos.x, pos.y);
    }
    S.drawStart.x = ep.x;
    S.drawStart.y = ep.y;
    // ... rest of existing code using ep ...
}
```

This ensures the initial click immediately snaps to the nearest port, providing instant visual feedback.

### 5. Test Scenarios

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Line tool, click near a port on Shape A, drag to empty canvas | Start snaps to that port; no port indicators on end |
| 2 | Line tool, click on Shape A (away from ports), drag near Shape B | Both shapes show port indicators; nearest ports highlighted |
| 3 | Line tool, click on Shape A, drag cursor over a port on Shape B | Shape B shows all 8 ports; nearest port highlighted solid |
| 4 | Line tool, drag from empty canvas to near Shape B | Shape B shows port indicators; end snaps to nearest port |
| 5 | Line tool, drag from empty canvas to empty canvas | Port indicators not shown (no shape nearby); free anchor created |
| 6 | After commit with port snap, drag the new connection's endpoint | Should behave identically to existing endpoint drag (port indicators, port snap on re-attach) |
| 7 | Box A upper-left of Box B. Click Box A's top edge left-of-center (away from any port), drag to Box B's bottom edge right-of-center (away from any port), release | Line starts near the clicked point on Box A's top-left area and ends near the released point on Box B's bottom-right area — **not** the shortest-distance corner-to-edge connection. Regression test for the bug in section 2.5. |
| 8 | Same as #7, but click/release positions ARE within port-snap range | Line snaps to the specific nearest ports at each click/release location, which may legitimately differ from a naive "shortest distance" pairing depending on where the user clicked. |

### 6. Edge Cases & Concerns

- **Port candidate position ambiguity for start shape:** When the user clicks on a shape to start a line, the `S.drawStart` point is the canvas-space click position. But `nearestPort` uses this position to determine which port is nearest. If the user clicks closer to one port than another, that port should be the initial snap point. This is correct behavior.

- **Port candidate for end shape during drag:** The end-shape port check uses `rawPos` (the pointer-up position) as the candidate. This matches the drag-end behavior exactly.

- **Performance:** Adding port indicator rendering to the `pointermove` hot path may add DOM work. The existing drag-end code already does this without issue, so the impact should be negligible.

- **Anchor shapes:** Anchor circles (small transparent circles) are used for free-hanging endpoints. Port indicators and port snapping should only apply to real shapes, not anchors. The `isAnchor` flag on shapes can be used to filter.

## Out of Scope

- **Zero-length click quirk:** Clicking the Line tool once on empty canvas without dragging currently still enters the `S.isDrawing` commit path and creates a connection between two coincident anchor circles (a degenerate, zero-length line). This is pre-existing behavior unrelated to port snapping and is **not** addressed by this plan. It should be tracked separately if it needs fixing.
- **Body-drag re-snap (lines ~1975–1991):** The existing "body drag" re-snap logic (moving an entire existing connection, snapping both ends on release) already uses `nearestPort()` correctly and is unaffected by this plan. It's included in the analysis above only for completeness/reference, not as a change target.

## Summary of Files to Modify

| File | Changes |
|---|---|
| `app.js` ~line 310 | Add `renderPortPreviewHTML()` helper function |
| `app.js` ~line 1390 | Update `startDrawingFromShape()` to check for port snap on initial click |
| `app.js` ~line 1862 | Update pointermove line preview to include port indicators |
| `app.js` ~line 2058 | Update pointerup to use `nearestPort()` before `getShapeOutlinePoint` for both endpoints, **and fix the outline-fallback projection target** (section 2.5) so each endpoint projects toward its own click/release position (`S.drawStart` / `rawPos`), not the other endpoint's position |