# Connection Snap to Non-Rectangular Outline — Specification

## 1. Problem

When a connection line ends at a shape whose visual outline is **not** a
bounding-box rectangle, the endpoint sometimes snaps to the bounding box instead
of to the actual visible shape outline.

**This happens via two independent bugs** (see §2 for full analysis):
1. The dynamic outline-projection function (`getShapeOutlinePoint`) has a
   missing case for `roundRect`/`terminator` and a sign bug for `triangle`.
2. The named-port system (`shapePorts`) returns raw bounding-box positions for
   every shape type, and these positions are **persisted permanently** the
   moment a user snaps a connection to a port — they are never re-projected
   onto the outline afterward. This is the path most users hit in practice,
   since dragging a connection near a shape almost always lands within
   port-snap range.

**Both bugs must be fixed** to satisfy the requirement that *all* shapes
receive connections on their true outline/stroke, not just shapes reached via
free (non-port) attachment.

### Affected shapes

| Shape type | Visual outline | Current `getShapeOutlinePoint` behaviour | Result |
|-----------|---------------|-----------------------------------------|--------|
| `rect` | Rectangle | Default case: clamp to bounding box | ✅ Correct — bounding box **is** the visual outline |
| `roundRect` | Rounded rectangle (rx=8) | Default case: clamp to bounding box | ❌ Snaps to sharp corner of bounding box, not the rounded visual corner |
| `terminator` | Pill shape (rx = h/2) | Default case: clamp to bounding box | ❌ Snaps to rectilinear bounding box, not the pill end-caps |
| `circle` | Ellipse | Dedicated ellipse-intersection case | ✅ Correct |
| `diamond` | Rotated square | Dedicated line-to-edges case | ✅ Correct |
| `triangle` | Triangle (point-up) | Dedicated edge-intersection case | ❌ Sign error in intersection math — **never matches any edge**, falls back to `(cx, cy+hh)` (bottom-centre of bounding box) |

### Symptoms (user-visible)

- **roundRect / terminator**: A line coming from the right appears to stop at
  the invisible sharp corner of the bounding box, rather than at the visible
  rounded edge. The gap between the line end and the visual corner is most
  noticeable when the line enters near a corner at an oblique angle.
- **triangle**: A line coming from the left or right appears to stop at the
  bottom-centre of the bounding box (the triangle's flat base) rather than at
  the sloping side. The line looks like it enters the shape from below, even
  when it should enter from the side.

### Code location — TWO independent bugs, not one

There are **two separate code paths** that determine a connection endpoint, and
both are broken for non-rectangular shapes:

1. **Free/dynamic outline snap** — `getShapeOutlinePoint(s, tx, ty)`
   (app.js:256–305), used whenever a connection end is *not* locked to a named
   port. Called from `connEndpoints(c)` (app.js:1244–1245) and elsewhere.
2. **Named-port snap** — `shapePorts(s)` (app.js:307–321), used whenever the
   user drags a connection endpoint within ~14px of one of the 8 standard
   ports (corners + edge midpoints). This is arguably the **primary** path,
   since dragging near a shape almost always lands within port-snap range,
   and it is what the on-screen port dots (`renderPortPreviewHTML`,
   app.js:364–380) visually promise.

**Critical detail**: once a connection end snaps to a named port, the
attachment is persisted as a **normalized box fraction** — `c.fromRel` /
`c.toRel` — via `absToRel()` (app.js:1212–1217) and reconstructed via
`relToAbs()` (app.js:1221–1226). Crucially,
`connEndpoints()` **skips `getShapeOutlinePoint` entirely whenever `fromRel`/
`toRel` is set**:

```js
// connEndpoints(c), app.js:1240-1245
var p1 = ep(a, c.fromRel);   // relToAbs() if fromRel is set — pure box math
var p2 = ep(b, c.toRel);
if (!a.isAnchor && !c.fromRel) p1 = getShapeOutlinePoint(a, p2.x, p2.y);
if (!b.isAnchor && !c.toRel)   p2 = getShapeOutlinePoint(b, p1.x, p1.y);
```

So **fixing `getShapeOutlinePoint` alone does not fix port-snapped
connections** — those never call it again once `fromRel`/`toRel` exists.
The bug must be fixed at the source: `shapePorts()` must return true
outline points for non-rectangular shapes, not bounding-box corners/midpoints.

- `getShapeOutlinePoint(s, tx, ty)` — app.js:256–305
- Connection endpoint computation — `connEndpoints(c)` (app.js:1230–1245)
- Named ports — `shapePorts(s)` (app.js:307–321)
- Nearest-port lookup — `nearestPort(pos, shape, threshold)` (app.js:325–332)
- Port-snap preview dots — `renderPortPreviewHTML` (app.js:364–380)
- Box-fraction persistence — `absToRel` (app.js:1212–1217), `relToAbs`
  (app.js:1221–1226)
- Port-snap-to-attach on release — app.js:2224–2233, 2261–2267
- Port-snap during initial line draw — app.js:2366–2369 (`fromRel = absToRel(...)`)
- Snap-on-release fallback to dynamic outline (no port hit) —
  app.js:2235, 2261

---

## 2. Root Cause Analysis

### 2.1 `roundRect` / `terminator` — missing shape-specific case

The `default` branch of the `switch` in `getShapeOutlinePoint` (line 288) simply
clamps the target point to the axis-aligned bounding box:

```js
default: // rect, roundRect, terminator
    var nx = clamp(tx, s.x, s.x + s.width);
    var ny = clamp(ty, s.y, s.y + s.height);
    if (nx === tx && ny === ty) {
        // Inside→project to nearest edge
        ...
    }
    return { x: nx, y: ny };
```

This returns the correct edge for `rect` (where the visual outline == bounding
box), but for `roundRect` and `terminator` the visual outline is inset at the
corners. Clamping to the bounding box ignores the corner radius.

A connection entering near a corner will snap to the invisible sharp corner
instead of the visible rounded arc, producing a visual gap.

### 2.2 `triangle` — sign error in edge-intersection math

The triangle case (lines 270–284) solves for the intersection of the ray from
the shape centre toward the target with each of the three triangle edges:

```
C = (cx, cy)           — shape centre
D = (tx - cx, ty - cy) — direction to target
Edge: E0 → E1          — one side of the triangle (top→bl, bl→br, br→top)
```

The matrix set-up:

```
C + v·D = E0 + u·(E1 - E0)
```

```
[dx,  -ex] [v]   = [E0.x - C.x]
[dy,  -ey] [u]     [E0.y - C.y]
```

The code computes:

```js
var ex = e[1].x - e[0].x, ey = e[1].y - e[0].y;
var denom = dx * ey - dy * ex;                              // = -det
var u = ((cx - e[0].x) * dy - (cy - e[0].y) * dx) / denom; // u_code
var v = ((cx - e[0].x) * ey - (cy - e[0].y) * ex) / denom; // v_code
if (v > 0 && u >= 0 && u <= 1) { ... }
```

The actual determinant of the 2×2 system `det([D, -E])` is
`dy·ex - dx·ey` = `-denom`.  So `denom = -det_actual`.

| Quantity | Actual value | Code value | Relationship |
|----------|-------------|------------|-------------|
| **denom** | `det([D, -E])` = `dy·ex - dx·ey` | `dx·ey - dy·ex` | `denom_code = -det_actual` |
| **u** | `det([D, E0-C]) / det([D, -E])` | `(cx-e0x)dy - (cy-e0y)dx` / denom | `u_code = -u_actual` |
| **v** | `det([E0-C, -E]) / det([D, -E])` | `(cx-e0x)ey - (cy-e0y)ex` / denom | `v_code = v_actual` |

The code's denominator is the **negative** of the true determinant.  For `u`
this cancels out because the numerator also has reversed sign:
`u_num_code = -u_num_actual` → `u_code = u_num_code / denom_code =
(-u_num_actual) / (-det_actual) = u_actual`.  So the **u** check
(`u >= 0 && u <= 1`) is **correct**.

But for `v`: `v_num_code = v_num_actual`, while `denom_code = -det_actual`.
So `v_code = v_num_actual / (-det_actual) = -(v_num_actual / det_actual) =
-v_actual`.

The guard `v > 0` actually checks `-v_actual > 0` → `v_actual < 0`.  This
rejects every edge that lies in the forward direction (the side of the triangle
actually facing the target) and only accepts edges behind the centre — but
those are never within [0,1] after the u-check anyway.

**Result**: For any forward-pointing target, **no edge passes** the `v > 0`
test. The function falls off the `forEach` without updating `best`, returning
the initial value `{ x: cx, y: cy + hh }` — the bottom-centre of the triangle's
bounding box.

(Note: for targets below the triangle, `(cx, cy+hh)` happens to be on the
triangle's base edge, so downward connections appear correct.  But connections
from the left, right, or above all get the wrong endpoint.)

---

## 3. Proposed Solution

### 3.1 `roundRect` — new case in `getShapeOutlinePoint`

Add a dedicated `case 'roundRect'` (and `case 'terminator'` since it shares the
same shape family — rectangular with rounded ends) that computes the true
distance from centre to the rounded-corner outline.

**Geometry:**

The rounded-rectangle outline comprises 8 segments:
- 4 straight edges (top, right, bottom, left)
- 4 quarter-circle arcs at the corners (radius `r`)

For a roundRect with width `w`, height `h`, and corner radius `r`:
- The straight segments span the region where the arc does not apply
- Each corner is a circular quadrant centred at the corresponding corner of the
  "inner rectangle": e.g., bottom-right corner centre is
  `(s.x + w - r, s.y + h - r)`, arc radius `r`

**Algorithm (per target point `(tx, ty)`):**

1. Compute the ray from shape centre `C` toward target `T`.
2. For each of the 8 segments:
   - **Straight edge**: solve `C + v·D = E0 + u·(E1-E0)`, check `v > 0`, `u ∈ [0,1]`.
   - **Quarter-circle arc**: solve for intersection of the ray with the circle
     `(P - corner_centre)² = r²`, filter for the correct quadrant, find the
     nearest forward intersection.
3. Pick the nearest intersection (`v` smallest positive) across all 8 segments.
4. Return `C + v·D`.

**Corner radius to use**: `r = 8` matches the rendering in `buildShapeHTML`
(line 1061).  Hard-code this in the case, or read from shape data if corners
become configurable in the future.

**`terminator`**: Same algorithm with `r = h / 2` (since a terminator is a
full pill — the arcs meet at the vertical centreline).  In practice `terminator`
can share the `roundRect` case, or get its own case if runtime shape needs
diverge.

### 3.2 `triangle` — fix the sign

The simplest fix is to negate the `v > 0` check to `v < 0`, or equivalently to
correct the denominator sign so the existing `v > 0` works as intended.

**Option A — flip the completion guard (one-character fix):**

Change `v > 0` → `v < 0` on line 277.

```js
// Before:
if (v > 0 && u >= 0 && u <= 1) {
// After:
if (v < 0 && u >= 0 && u <= 1) {
```

This is the minimal fix but leaves the confusing sign convention in the code.

**Option B — fix the denominator sign (clearer math):**

Replace `denom = dx * ey - dy * ex` with the correct determinant
`denom = dy * ex - dx * ey` and keep the `v > 0` guard unchanged.

```js
// Before:
var denom = dx * ey - dy * ex;
// After:
var denom = dy * ex - dx * ey;
```

**Recommendation**: Option B, because it makes the math self-documenting and
future readers won't need to re-derive the sign convention.  The `u` check is
unaffected (both numerator and denominator flip, ratio stays same).

### 3.3 `shapePorts` — REQUIRED: port positions must move onto the true outline

This is **not optional** — see §1's "Code location" subsection above. Since port-snapped connections
never call `getShapeOutlinePoint` again after the initial snap (they're
frozen as a box fraction), `shapePorts()` must return points that already lie
on the true visual outline, for every shape type.

**Current (broken) definition** — 8 bounding-box positions, identical for
every shape type:

```js
function shapePorts(s) {
    var x1 = s.x, y1 = s.y, x2 = s.x + s.width, y2 = s.y + s.height;
    var cx = s.x + s.width / 2, cy = s.y + s.height / 2;
    return [
        { x: x1, y: y1, name: 'top-left' },     { x: cx, y: y1, name: 'top-center' },
        { x: x2, y: y1, name: 'top-right' },    { x: x1, y: cy, name: 'middle-left' },
        { x: x2, y: cy, name: 'middle-right' }, { x: x1, y: y2, name: 'bottom-left' },
        { x: cx, y: y2, name: 'bottom-center' },{ x: x2, y: y2, name: 'bottom-right' }
    ];
}
```

**Per-shape-type corrections needed:**

| Shape | Port | Current (wrong) | Corrected |
|-------|------|-----------------|-----------|
| `triangle` | top-left | `(x1, y1)` — empty space above the slope | Move onto the left slanted edge, e.g. the point 50% up the left edge: `(cx - hw/2, cy)` |
| `triangle` | top-right | `(x2, y1)` — empty space above the slope | Move onto the right slanted edge: `(cx + hw/2, cy)` |
| `triangle` | top-center | `(cx, y1)` | ✅ Already correct — this is the apex |
| `triangle` | middle-left | `(x1, cy)` — outside the sloped side | Move onto the left edge at its vertical midpoint height, i.e. re-derive x from the edge equation: `x = cx - hw * (1 - (cy - y1)/hh) / 2`&nbsp;→ simplify to the edge's actual x at `y = cy` |
| `triangle` | middle-right | `(x2, cy)` — outside the sloped side | Symmetric to middle-left |
| `triangle` | bottom-left/right/center | `(x1,y2)` / `(x2,y2)` / `(cx,y2)` | ✅ Already correct — these are the two base corners and base midpoint |
| `roundRect` | all 4 corners | Sharp bounding-box corner | Move onto the arc at 45° from the corner centre: for bottom-right, `(s.x + w - r + r*cos(45°), s.y + h - r + r*sin(45°))` |
| `roundRect` | all 4 edge midpoints | `(x1,cy)` etc. | ✅ Already correct — edge midpoints are unaffected by corner rounding |
| `terminator` | all 4 corners | Sharp bounding-box corner | Same arc formula as roundRect, with `r = h/2` |
| `terminator` | all 4 edge midpoints | `(x1,cy)` etc. | ✅ Already correct for top/bottom mid; left/right mid sit exactly on the pill's flat vertical tangent — also correct |

**Recommended implementation approach**: rather than hand-deriving each port
per shape type, reuse the (now-corrected) `getShapeOutlinePoint` machinery.
For each of the 8 canonical bounding-box positions, cast a ray from the shape
centre through that bounding-box position and call `getShapeOutlinePoint` to
find where that ray actually exits the shape:

```js
function shapePorts(s) {
    var x1 = s.x, y1 = s.y, x2 = s.x + s.width, y2 = s.y + s.height;
    var cx = s.x + s.width / 2, cy = s.y + s.height / 2;
    var boxPorts = [
        { x: x1, y: y1, name: 'top-left' },     { x: cx, y: y1, name: 'top-center' },
        { x: x2, y: y1, name: 'top-right' },    { x: x1, y: cy, name: 'middle-left' },
        { x: x2, y: cy, name: 'middle-right' }, { x: x1, y: y2, name: 'bottom-left' },
        { x: cx, y: y2, name: 'bottom-center' },{ x: x2, y: y2, name: 'bottom-right' }
    ];
    return boxPorts.map(function(p) {
        if (s.type === 'rect') return p; // box == outline already, skip the ray-cast
        var onOutline = getShapeOutlinePoint(s, p.x, p.y);
        return { x: onOutline.x, y: onOutline.y, name: p.name };
    });
}
```

This guarantees every port lies exactly on the visual outline **for whatever
shape type is passed in**, automatically inheriting the §3.1/§3.2 fixes with
zero duplicated geometry — the ray-cast reuses the exact same corrected
intersection logic. `circle` and `diamond` also benefit automatically (though
they were already correct via their own `getShapeOutlinePoint` cases, so this
is a no-op for those two).

**Known limitation (documented, not fixed here)**: because `fromRel`/`toRel`
store a **box-fraction**, not a shape-relative-to-outline formula, a
port-locked connection on a `roundRect`/`terminator` can drift slightly off
the rounded arc if the shape is later **resized non-uniformly** (the corner
radius `r` is a fixed pixel value, not proportional to width/height, so a
box-fraction point that sat exactly on the arc at one size may not after a
resize). `triangle` does not have this problem — its edges are genuinely
proportional to width/height, so a box-fraction point on a triangle edge
stays on that edge under any resize. Fully solving the `roundRect` resize-drift
case would require changing the persisted format from a box-fraction to a
shape-relative outline parameter (e.g. "distance along perimeter"), which is
a larger data-model change and is out of scope for this fix.

---

## 4. Scope & Interactions

### 4.1 Callers of `getShapeOutlinePoint` (§3.1/§3.2 fix)

| Caller | Line | Impact of fix |
|--------|------|---------------|
| `connEndpoints(c)` — dynamic (non-port) endpoint | 1244–1245 | ✅ Lines snap to visual outline |
| `findNearestShape` — snap distance during drag | 352–354 | ✅ Distance measured to correct outline |
| Endpoint drag — anchor creation | 2048 | ✅ Anchor placed on correct outline |
| Snap-on-release fallback (no port hit) | 2235, 2261 | ✅ Snaps to correct outline |
| New-line drag — preview start anchor | 2345 | ✅ Start point on correct outline |
| New-line drag — preview snap endpoint | 2358 | ✅ Endpoint on correct outline |
| `shapePorts` (§3.3 fix, reuses this function) | 307–321 | ✅ Ports repositioned onto correct outline |

### 4.2 Callers of `shapePorts` (§3.3 fix — REQUIRED, not optional)

| Caller | Line | Impact of fix |
|--------|------|---------------|
| `nearestPort` — port-snap hit-testing | 325–332 | ✅ Detects proximity to true outline ports, not box corners |
| `renderPortPreviewHTML` — visual port dots | 364–380 | ✅ Dots render on the visual outline instead of floating in empty space (triangle) or at the sharp corner (roundRect/terminator) |
| Port-snap-to-attach on release | 2224–2233, 2261–2267 | ✅ `fromRel`/`toRel` computed from a true outline point via `absToRel`, so the persisted attachment sits on the outline |
| New-line initial click port-snap | ~1618–1621 | ✅ Same as above for the very first click |
| Port-snap during initial line draw | 2366–2369 | ✅ Same as above during new-line creation |

### 4.3 No further changes needed

- `render()` / `buildShapeHTML` — rendering is independent of snap logic, no change.
- `absToRel` / `relToAbs` — unchanged; the box-fraction storage format is fine
  as long as the point handed to `absToRel` at snap time is already on the
  true outline (guaranteed by the §3.3 fix).

### 4.4 Not affected

- `circle` and `diamond` have their own correct `getShapeOutlinePoint` cases —
  no change to the outline math (their ports are also automatically correct
  once `shapePorts` is rewritten to call `getShapeOutlinePoint`, since it's
  effectively a no-op for these two types).
- `rect` — box **is** the outline for both the dynamic-snap and port-snap
  paths — no change.
- Anchor shapes (`isAnchor`) are small circles, not connectable via named
  ports — no change.
- All non-shape operations (select, drag, resize, pan, zoom) — no change.

---

## 5. Test Scenarios

Each shape/direction combination should be tested **twice**: once as a free
(dynamic) connection, and once explicitly dragged onto a named port — since
these are the two independent code paths from §2.

### 5.1 roundRect — corner approach (dynamic)

1. Place a `roundRect` at (200, 200, 160, 60) and a `rect` at (500, 200, 100, 50).
2. Connect them without dragging onto a specific port (drop mid-edge, outside
   the ~14px port-snap radius).  The line should enter the roundRect at its
   visual right edge, not at the invisible bounding-box corner.

### 5.2 roundRect — oblique entry (dynamic)

1. Place a `roundRect` at (200, 200, 160, 60) and a diamond at (300, 150, 100, 100).
2. Connect from diamond to roundRect.  The entry point should land on the
   rounded arc of the nearest corner, not the sharp bounding-box corner.

### 5.3 roundRect — corner port (port-snap)

1. Place a `roundRect` at (200, 200, 160, 60).
2. Drag a connection endpoint until it snaps to one of the 4 corner ports
   (drop within ~14px of a bounding-box corner).
3. The port dot preview, and the final resting connection point, should both
   land on the rounded arc — not the sharp bounding-box corner.

### 5.4 triangle — left / right side (dynamic)

1. Place a `triangle` at (100, 100, 100, 100) and a rect at (300, 130, 80, 40).
2. Connect from rect to triangle, dropping mid-edge (outside port-snap radius).
   The line should enter the triangle's right-hand sloping side, not its
   bottom edge.

### 5.5 triangle — above (dynamic)

1. Place a `triangle` at (200, 300, 100, 100) and a rect at (250, 50, 80, 40).
2. Connect from rect (above) to triangle (below).  The line should enter the
   triangle's top vertex, not the bottom edge.

### 5.6 triangle — top-left / top-right ports (port-snap)

1. Place a `triangle` at (100, 100, 100, 100).
2. Drag a connection endpoint until it snaps to the `top-left` or `top-right`
   named port.
3. The port dot preview, and the final connection point, should land on the
   triangle's sloped edge — not floating in the empty space above the slope
   (where the old bounding-box corner sat).

### 5.7 triangle — middle-left / middle-right ports (port-snap)

1. Same triangle as above.
2. Drag a connection endpoint until it snaps to `middle-left` or
   `middle-right`.
3. The port should land exactly on the sloped edge at that height, not
   outside the triangle's silhouette.

### 5.8 terminator — end-cap (dynamic)

1. Place a `terminator` at (100, 100, 180, 40) and a rect at (400, 110, 80, 40).
2. Connect from rect to terminator, dropping mid-edge.  The line should end
   at the pill's rounded right end-cap, not at the bounding-box right edge.

### 5.9 terminator — corner port (port-snap)

1. Place a `terminator` at (100, 100, 180, 40).
2. Drag a connection endpoint until it snaps to a corner port.
3. The port should land on the pill's curved end, not the sharp bounding-box
   corner.

### 5.10 Resize-drift regression check (roundRect/terminator, known limitation)

1. Create a roundRect-to-rect connection port-snapped to a roundRect corner
   (per 5.3).
2. Resize the roundRect non-uniformly (e.g. stretch width only).
3. **Expected**: some drift is acceptable per §3.3's documented limitation
   (box-fraction storage doesn't scale the corner radius `r` proportionally).
   This is not a regression — confirm it does not get *worse* than before the
   fix (i.e. the connection should not be further from the outline than it
   was pre-fix at the original size).

---

## 6. Previously Attempted / Related Work

- **Layout project** (sibling repo): `SMALL_REQUESTS.md` documents a
  `"Add clamping back after solving the clamping + trackpad interaction bug"` — a
  similar "clamp to bounding box" issue in `applyTransform` broke leftward panning.
  That was a different function (`applyTransform` render-only snap), but the
  same pattern of "bounding-box vs. visual outline" appears here.
- **No prior attempt** to fix `getShapeOutlinePoint` for non-rectangular shapes
  has been found in the diagram repo's git history or docs archive.

---

## 7. Future Considerations

- **Configurable corner radius**: If `roundRect` corner radius becomes a
  per-shape property, the hard-coded `r = 8` in `getShapeOutlinePoint` must be
  read from the shape data instead (and `shapePorts`, which delegates to it,
  inherits the fix automatically).
- **Resize-drift on port-locked roundRect/terminator connections**: documented
  as a known, accepted limitation in §3.3 — not fixed here. A full fix would
  require changing `fromRel`/`toRel` from a box-fraction to a
  perimeter-relative parameter, which is a larger data-model change.
- **Custom SVG shapes**: `getShapeOutlinePoint` has no case for `custom`; it
  falls through to the default bounding-box clamp, and `shapePorts` (via its
  §3.3 rewrite) would likewise fall back to raw bounding-box ports for
  `custom`. Computing the true outline of an arbitrary SVG path is a
  significantly harder problem (requires `getPointAtLength` or analytical path
  parsing) and is out of scope for this fix.