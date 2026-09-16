# Hover Effects for Diagram Shapes & Lines

## Goal

Make it obvious which shape or connection line a click will act on when hovering the mouse over it. The effect should be noticeable but not distracting, and easy to dial up/down while iterating.

## Current State (verified against code)

- **Shapes** (`.diagram-shape`, real DOM `<div>` elements in `#shapes-layer`): box-shadow ring + glow on `:hover`, scoped to `body.tool-select` and `body.tool-line` (both the select tool and line tool show shape hover feedback). Shapes support native CSS `:hover` fine because they receive real pointer events.
- **Connections** (`.diagram-conn`, rendered in `renderConns()` in `app.js`): No hover state exists. **Important:** the wrapper div for each connection is created with `pointer-events:none` set inline:
  ```js
  el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:'+connZ(c)+';pointer-events:none;';
  ```
  This is intentional — connection hit-testing is done manually via `findConnAt(pos)` (distance-to-segment math), not by the browser. **This means a plain `.conn-path:hover` CSS rule will never fire.** Any hover effect for lines must be driven from JS state, not CSS `:hover`.
- **Snap highlight** (`.snap-highlight`, shown while drawing/dragging a line near a target): `box-shadow: 0 0 0 2px var(--color-accent), 0 0 16px rgba(37,99,235,0.3)` on a div matching the target shape's *bounding box* (not its silhouette) — this is the reference for intensity, and also the precedent for "rectangular highlight regardless of shape type," which we'll reuse.
- Shapes get hover-relevant meaning when `S.tool === 'select'` (click = select/drag) **or** `S.tool === 'line'` (click = start line from this shape). Both tools show the shape hover ring. The `updateToolBodyClass()` function toggles `body.tool-select` and `body.tool-line` classes accordingly.
- **Connection hover is scoped to select tool only** — in line tool mode, connections aren't interactive targets, so no hover feedback is shown for them.

## Design Principle

One master dial (`--hover-intensity`, 0.0–1.0) controls everything downstream via CSS custom properties. Shapes get it via pure CSS `:hover` (works natively). Connections get it via a JS-tracked hover class, because CSS `:hover` isn't available to them.

---

## Step 1: Hover Configuration Variables

Add to `:root` in `styles.css`, near the other theme variables:

```css
/* ===== Hover Effect Configuration ===== */
/* Master dial: adjust this one value to scale the whole effect. Start at 0.25. */
--hover-intensity:     0.25;   /* 0.0 = off, 1.0 = full snap-highlight intensity */

/* Everything below is derived from --hover-intensity so you only tune one number.
   You can still override any of these individually if you want asymmetric tuning. */
--hover-ring-width:    calc(1px + 1px * var(--hover-intensity));           /* 1–2px */
--hover-glow-blur:     calc(4px + 12px * var(--hover-intensity));          /* 4–16px, matches snap-highlight's 16px at full intensity */
--hover-glow-alpha:    calc(0.15 + 0.35 * var(--hover-intensity));         /* 0.15–0.5 alpha for the glow color */
--hover-conn-width-add: calc(1px + 2px * var(--hover-intensity));         /* extra stroke-width added to hovered lines */
--hover-transition:    0.12s;
```

`--hover-glow-alpha` needs to land inside an actual color, which requires `rgb() / rgba()` with a CSS variable for the numeric channel — plain hex/var color tokens can't have `calc()` alpha spliced in. Since the accent color is fixed (`#2563EB`), define an RGB triplet variable alongside it so the alpha can vary:

```css
--color-accent-rgb: 37, 99, 235; /* same value as --color-accent, in r,g,b form */
```

**Tuning guide:**

| `--hover-intensity` | Feel |
|---|---|
| `0.0` | Off |
| `0.15` | Subtle ring, barely-there glow |
| `0.25` | **Recommended starting point** |
| `0.50` | Clearly visible glow |
| `0.75` | Strong, approaching snap-highlight |
| `1.0` | Equal to snap-highlight |

---

## Step 2: Shapes (pure CSS, works today)

Replace the existing rule. Note the **hover-only** ring/glow — nothing changes on the base state, so shapes look identical to today until hovered:

```css
.diagram-shape {
    transition: box-shadow var(--hover-transition), filter var(--hover-transition);
}

/* Active in both select tool (click = select/drag) and line tool (click = start line).
   Locked shapes excluded. */
body.tool-select .diagram-shape:not(.locked):hover,
body.tool-line .diagram-shape:not(.locked):hover {
    box-shadow:
        0 0 0 var(--hover-ring-width) rgba(var(--color-accent-rgb), 0.8),
        0 0 var(--hover-glow-blur) rgba(var(--color-accent-rgb), var(--hover-glow-alpha));
}

```

This reuses the exact same "ring + glow" shape as `.snap-highlight`, just scaled down by `--hover-intensity`. Locked shapes are excluded since they can't be dragged.

Because shapes are plain rectangular `<div>`s regardless of visual type (circle/diamond/triangle all live in a rectangular bounding box, same as `.snap-highlight` already assumes), the hover ring will be a rectangle even around round shapes. This matches the existing snap-highlight convention, so it won't look like a new inconsistency — but call this out if it feels wrong once you see it live; the fix (clip the ring to the actual silhouette) is more work — see "Future Improvement" below.

**Body classes managed by `updateToolBodyClass()`:** called at every `S.tool =` assignment site, toggles both `body.tool-select` and `body.tool-line`.

---

## Step 3: Connections (requires JS — CSS `:hover` won't fire)

Since `.diagram-conn` wrappers have `pointer-events:none`, we track hover state manually:

1. **Track hover in pointermove**, only when idle (not dragging/resizing/drawing/panning) and tool is `select`:

```js
container.addEventListener('pointermove', function(e) {
    // ...existing code...

    // Connection hover detection (cheap: only when not mid-gesture)
    if (S.tool === 'select' && !S.isPanning && !S.isDragging && !S.isResizing &&
        !S.isDraggingConn && !S.isDrawing && !S.isSelecting) {
        var hoverPos = toCanvas(e.clientX, e.clientY);
        var hoverConn = findConnAt(hoverPos);
        var newHoverId = hoverConn ? hoverConn.id : null;
        if (newHoverId !== S.hoveredConnId) {
            setHoveredConn(newHoverId);
        }
    }
});
```

2. **Toggle a class on just the affected element(s)** rather than calling `renderConns()` (which does a full `innerHTML` teardown/rebuild of every connection on every call — too expensive to run on every mousemove tick):

```js
function setHoveredConn(id) {
    if (S.hoveredConnId === id) return;
    // Clear old
    if (S.hoveredConnId) {
        var oldEl = shapesLayer.querySelector('.diagram-conn[data-conn-id="' + S.hoveredConnId + '"] path');
        if (oldEl) oldEl.classList.remove('conn-hover');
    }
    S.hoveredConnId = id;
    // Set new
    if (id) {
        var newEl = shapesLayer.querySelector('.diagram-conn[data-conn-id="' + id + '"] path');
        if (newEl) newEl.classList.add('conn-hover');
    }
}
```

This requires tagging each connection wrapper with its id in `renderConns()` (it currently isn't tagged, only shapes are via `dataset.id`):

```js
// in renderConns(), when building el:
el.dataset.connId = c.id; // add this line
```

And add `S.hoveredConnId: null` to the initial state object `S`.

3. **CSS for the hover class** (not `:hover` pseudo-class — a real class toggled by JS):

```css
.conn-hover {
    stroke: var(--color-accent) !important;
    filter: brightness(1.08);
}
```

Stroke-width can't easily be bumped via CSS alone here since `sw` is set as an inline SVG attribute per-path, not a CSS property — either bump it in JS when toggling the class (simplest), or read `--hover-conn-width-add` in JS and add it to the attribute directly:

```js
function setHoveredConn(id) {
    // ...clear old (also reset stroke-width attr if you bumped it)...
    if (id) {
        var c = findConn(id);
        var newEl = shapesLayer.querySelector('.diagram-conn[data-conn-id="' + id + '"] path');
        if (newEl && c) {
            newEl.dataset.baseSw = newEl.getAttribute('stroke-width');
            newEl.setAttribute('stroke-width', Math.max(3, (c.sw || 2) + 2));
            newEl.classList.add('conn-hover');
        }
    }
}
```

4. **Cursor feedback**: since `container.style.cursor` is set globally per-tool, add a per-position override so the cursor becomes `pointer` when hovering a connection:

```js
container.style.cursor = newHoverId ? 'pointer' : (map[S.tool] || 'crosshair');
```

---

## Step 4: Resize Handles (already have a hover effect — keep consistent)

```css
.resize-handle:hover {
    background: var(--color-accent-hover);
    transform: scale(1.3);
    box-shadow: 0 0 var(--hover-glow-blur) rgba(var(--color-accent-rgb), var(--hover-glow-alpha));
}
```

---

## Reduced Motion

The existing `@media (prefers-reduced-motion: reduce)` rule already zeroes out transition durations globally. No extra work needed — the new `transition` declarations above are automatically covered.

---

## Iteration Workflow

1. Open the diagram in a browser, open DevTools.
2. Find `:root` in the Styles/Computed panel and live-edit `--hover-intensity`.
3. Once satisfied, update the value in `styles.css`.
4. If shapes and lines need to feel different in strength, override the derived variables individually instead of just the master dial (e.g. bump `--hover-conn-width-add` without touching shape glow).

---

## Future Improvement (not needed for v1)

The rectangular hover ring around non-rectangular shapes (circle/diamond/triangle) is a known simplification shared with the existing `.snap-highlight`. If it ever feels wrong in practice, the fix is to generate a per-type SVG outline (reusing `shapeSVG()`'s stroke paths) and apply the glow as an SVG `filter="drop-shadow(...)"` on the shape's own SVG rather than a CSS box-shadow on the bounding div. This is more work and only worth doing if the rectangular approximation is visually confusing once seen live.

## Alternative / Simpler Approaches (if JS-driven line hover feels like too much)

- **Cursor-only feedback**: Set `cursor: pointer` when hovering a connection (via the same `findConnAt` check), skip the visual highlight entirely. Zero rendering cost, but weaker signal — probably insufficient on its own given the stated goal.
- **Throttled full re-render**: Instead of surgically toggling a class, just call `renderConns()` on hover-change (not every mousemove — only when `hoveredConnId` actually changes, which is what `setHoveredConn` above already guards). This is simpler to write than the surgical class-toggle version and, since it's only called when the hovered id changes, is likely cheap enough — measure it, and only bother with the direct-class-toggle micro-optimization if it's a real problem in practice with many connections on canvas.
