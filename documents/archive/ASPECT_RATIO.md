# Lock Aspect Ratio & Preserve SVG Aspect Ratio — Specification

## 1. Goals

### 1.1 Lock Aspect Ratio (All Shapes)

When a shape's **Lock Aspect Ratio** property is checked, resizing the shape (via drag handles or the properties panel) must keep the **width-to-height ratio** constant. Dragging a corner handle (`nw`, `ne`, `sw`, `se`) should scale the shape proportionally. Dragging an edge handle (`n`, `s`, `e`, `w`) should still allow the aspect ratio to change (per convention in Figma/Illustrator — only corner handles preserve aspect ratio). However, for simplicity, this spec initially applies the lock to **all resize operations** including edge handles: when locked, **any resize dimension change forces the other dimension to match proportionally**.

If `lockAspectRatio` is toggled on an already-selected shape, its current aspect ratio becomes the **locked ratio** going forward.

### 1.2 Preserve SVG Aspect Ratio (Custom SVGs Only)

Custom SVG shapes have an additional **Preserve SVG Aspect Ratio** property. When checked:

1. The shape's **width-to-height ratio is locked** to match the **natural aspect ratio of the SVG content** (computed from the viewBox or from `computeSvgExtent()`).
2. The rendered SVG content uses `preserveAspectRatio="xMidYMid meet"` (instead of `"none"`) so the SVG content is centered within the shape and scaled uniformly, without distortion.
3. The `lockAspectRatio` property on a custom shape is implicitly set to `true` when `preserveSvgAspectRatio` is enabled (because the ratio is determined by the SVG content).
4. If the user toggles `preserveSvgAspectRatio` off, `lockAspectRatio` is also turned off (returning to stretch-to-fill behavior with `preserveAspectRatio="none"`).

---

## 2. Current State

### 2.1 Shape Data Model

Shapes are plain objects created in `addShape()` (`app.js`, line ~836–852). Current properties:

```js
{
    id: 's1',
    type: 'rect',           // 'rect', 'roundRect', 'circle', 'diamond', 'triangle', 'terminator', 'custom'
    name: 'Rect 1',
    x: 100, y: 100,
    width: 120, height: 80,
    text: '',
    fill: '#ffffff',
    stroke: '#333333',
    sw: 2,
    opacity: 1,
    fillOpacity: 1,
    strokeOpacity: 1,
    textColor: '#111113',
    textAlign: 'center',
    locked: false,
    fontSize: 14,
    textPad: 8,
    zHeight: 0,
    hidden: false
}
```

Custom shapes additionally get:
```js
{
    ...,
    customSvg: '<rect width="2" height="3" fill="red"/>'
}
```

**No aspect-ratio properties exist yet.**

### 2.2 Resize Logic (Drag Handles)

Located in the `pointermove` handler (`app.js`, lines ~1864–1882):

```js
if (S.isResizing) {
    var rs = S.resizeStart, h = S.resizeHandle;
    var dx = pos.x - rs.mx, dy = pos.y - rs.my;
    shapeSel().forEach(function(id) {
        var s = findShape(id);
        if (!s) return;
        var nw = rs.sw, nh = rs.sh, nx = s.x, ny = s.y;
        if (h.includes('e')) nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
        if (h.includes('w')) { nw = Math.max(CONFIG.minShapeSize, rs.sw - dx); nx = rs.sx + rs.sw - nw; }
        if (h.includes('s')) nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
        if (h.includes('n')) { nh = Math.max(CONFIG.minShapeSize, rs.sh - dy); ny = rs.sy + rs.sh - nh; }
        s.x = snap(nx); s.y = snap(ny); s.width = snap(nw); s.height = snap(nh);
        clampShape(s);
    });
    render();
    return;
}
```

**Key observation:** Width and height are computed independently from `dx` and `dy`. There is no cross-dimensional constraint. A corner handle (`se`) modifies both width and height independently, so the ratio can change freely.

### 2.3 Properties Panel Geometry Inputs

The `propWidth` and `propHeight` inputs have listeners at `app.js` lines ~2773–2785:

```js
[propX, propY, propWidth, propHeight].forEach(function(input) {
    input.addEventListener('change', function() {
        var v = parseFloat(input.value);
        var prop = input.id.replace('prop-', '');
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s[prop] = v;
        });
        pushUndo();
        render();
    });
});
```

Each property is changed independently. No aspect-ratio cross-constraint exists.

### 2.4 Custom SVG Rendering

In `shapeSVG()` (`app.js`, lines ~1044–1069), the custom case renders:

```js
case 'custom':
    var inner = (s.customSvg || '').trim();
    if (!inner) {
        // Placeholder
        return '<rect width="'+w+'" height="'+h+'" ...>';
    }
    var ext = computeSvgExtent(inner);
    return '<svg x="0" y="0" width="'+w+'" height="'+h+
           '" viewBox="0 0 '+ext.w+' '+ext.h+
           '" preserveAspectRatio="none" overflow="hidden">'+inner+'</svg>';
```

The `preserveAspectRatio="none"` means the SVG content stretches non-uniformly to fill the shape. This is intentional — the current design goal is edge-to-edge fill at any aspect ratio.

### 2.5 `computeSvgExtent()`

Function at `app.js` lines ~1071–1151. Returns `{ w, h }` representing the coordinate extent of SVG content. Used to compute the viewBox for custom SVGs. This is the same function that can provide the **natural aspect ratio** for the "Preserve SVG Aspect Ratio" feature.

### 2.6 Properties Panel HTML

Located in `index.html`. The Geometry section shows:

```html
<div class="panel-section panel-shape">
    <h4>Geometry</h4>
    <div class="prop-row">
        <label>X <input type="number" id="prop-x" class="num-compact"></label>
        <label>Y <input type="number" id="prop-y" class="num-compact"></label>
        <label>W <input type="number" id="prop-width" class="num-compact" min="10"></label>
        <label>H <input type="number" id="prop-height" class="num-compact" min="10"></label>
    </div>
    <div class="prop-row"><label>Z <input type="number" id="prop-zHeight" class="num-tiny" ...></label></div>
</div>
```

The custom SVG section shows:

```html
<div class="panel-section panel-custom">
    <h4>Custom SVG</h4>
    <div class="prop-row"><label><textarea id="custom-svg-code" rows="6" ...></textarea></label></div>
</div>
```

No aspect ratio controls exist yet.

### 2.7 `renderProps()` Properties Panel Logic

At `app.js` lines ~1399–1450. This function updates the properties panel when a shape is selected. It shows/hides sections based on shape type. For custom shapes, it hides the style section and shows the custom SVG textarea.

---

## 3. Required Changes

### 3.1 Shape Data Model — New Properties

Add to every shape object (both in `addShape()` and in the `init()` migration/defaults):

```js
lockAspectRatio: false,             // All shapes
preserveSvgAspectRatio: false       // Custom shapes only (ignored if type !== 'custom')
```

These default to `false` so existing documents are unaffected.

### 3.2 Properties Panel UI — Aspect Ratio Controls

#### 3.2.1 Lock Aspect Ratio Checkbox (All Shapes)

Add to the **Geometry** section in `index.html` (after the W/H inputs):

```html
<div class="prop-row">
    <label class="checkbox-label">
        <input type="checkbox" id="prop-lock-ar"> Lock Aspect Ratio
    </label>
</div>
```

#### 3.2.2 Preserve SVG Aspect Ratio Checkbox (Custom Shapes Only)

Add to the **Custom SVG** section in `index.html` (before or after the textarea):

```html
<div class="prop-row">
    <label class="checkbox-label">
        <input type="checkbox" id="prop-preserve-svg-ar"> Preserve SVG Aspect Ratio
    </label>
</div>
```

#### 3.2.3 CSS Styling

In `styles.css`, ensure `.checkbox-label` styling exists for these new controls. Existing checkbox-label class may already work (used for connection arrow toggles). If not, add minimal styles.

### 3.3 Properties Panel Logic — `renderProps()` Changes

In `app.js`, `renderProps()` function (around lines 1399–1450):

1. Add DOM references for the new checkbox elements:
   - `propLockAr` = `document.getElementById('prop-lock-ar')`
   - `propPreserveSvgAr` = `document.getElementById('prop-preserve-svg-ar')`

2. When a single shape is selected:
   - Show `propLockAr` checkbox, set its `checked` state to `s.lockAspectRatio`
   - If shape type is `custom`, show `propPreserveSvgAr` checkbox, set its `checked` state to `s.preserveSvgAspectRatio`
   - If shape type is NOT custom, hide `propPreserveSvgAr` checkbox

3. Sync both checkboxes to the shape's properties on every `render()` call.

### 3.4 Event Handlers for New Checkboxes

#### 3.4.1 Lock Aspect Ratio Checkbox

```js
propLockAr.addEventListener('change', function() {
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (s) s.lockAspectRatio = propLockAr.checked;
    });
    logAction('Lock aspect ratio: ' + (propLockAr.checked ? 'on' : 'off'), 'edit');
    pushUndo();
    render();
});
```

#### 3.4.2 Preserve SVG Aspect Ratio Checkbox

```js
propPreserveSvgAr.addEventListener('change', function() {
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (s && s.type === 'custom') {
            s.preserveSvgAspectRatio = propPreserveSvgAr.checked;
            // Implicitly lock/unlock aspect ratio
            s.lockAspectRatio = s.preserveSvgAspectRatio;
        }
    });
    logAction('Preserve SVG aspect ratio: ' + (propPreserveSvgAr.checked ? 'on' : 'off'), 'edit');
    pushUndo();
    render();
});
```

When `preserveSvgAspectRatio` is checked, `lockAspectRatio` is also set to `true`. When unchecked, `lockAspectRatio` is set to `false`. The user can still independently toggle `lockAspectRatio` after turning off `preserveSvgAspectRatio`.

### 3.5 Resize Logic — Aspect Ratio Constraint

In the `pointermove` handler, the `S.isResizing` block (around lines 1864–1882) must be modified to enforce `lockAspectRatio`.

#### 3.5.1 Compute the locked ratio

Before the `shapeSel().forEach()` loop, compute the ratio:

```js
if (S.isResizing) {
    var rs = S.resizeStart, h = S.resizeHandle;
    var dx = pos.x - rs.mx, dy = pos.y - rs.my;
    shapeSel().forEach(function(id) {
        var s = findShape(id);
        if (!s) return;
        var nw = rs.sw, nh = rs.sh, nx = rs.sx, ny = rs.sy;
        
        if (s.lockAspectRatio) {
            // Compute the locked ratio from the original shape dimensions
            var ratio = rs.sw / rs.sh;
            
            // Determine primary axis from handle type
            if (h.includes('e') || h.includes('w')) {
                // Horizontal resize drives vertical
                if (h.includes('e')) nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
                if (h.includes('w')) { nw = Math.max(CONFIG.minShapeSize, rs.sw - dx); nx = rs.sx + rs.sw - nw; }
                nh = nw / ratio;
                // Adjust position for n/s handles to keep the anchor edge fixed
                if (h.includes('n')) ny = rs.sy + rs.sh - nh;
            } else if (h.includes('s') || h.includes('n')) {
                // Vertical resize drives horizontal
                if (h.includes('s')) nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
                if (h.includes('n')) { nh = Math.max(CONFIG.minShapeSize, rs.sh - dy); ny = rs.sy + rs.sh - nh; }
                nw = nh * ratio;
                // Adjust position for w/e handles to keep the anchor edge fixed
                if (h.includes('w')) nx = rs.sx + rs.sw - nw;
            }
            // For corner handles, use the larger delta to drive both dimensions
            // This prevents tiny accidental resize from the other axis
            if (h === 'se') {
                var absDx = Math.abs(dx), absDy = Math.abs(dy);
                if (absDx >= absDy) {
                    nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
                    nh = nw / ratio;
                } else {
                    nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
                    nw = nh * ratio;
                }
                // nx and ny stay as rs.sx, rs.sy for se handle
            }
            if (h === 'sw') {
                var absDx2 = Math.abs(dx), absDy2 = Math.abs(dy);
                if (absDx2 >= absDy2) {
                    nw = Math.max(CONFIG.minShapeSize, rs.sw - dx);
                    nh = nw / ratio;
                } else {
                    nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
                    nw = nh * ratio;
                }
                nx = rs.sx + rs.sw - nw;
            }
            if (h === 'ne') {
                var absDx3 = Math.abs(dx), absDy3 = Math.abs(dy);
                if (absDx3 >= absDy3) {
                    nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
                    nh = nw / ratio;
                } else {
                    nh = Math.max(CONFIG.minShapeSize, rs.sh - dy);
                    nw = nh * ratio;
                }
                ny = rs.sy + rs.sh - nh;
            }
            if (h === 'nw') {
                var absDx4 = Math.abs(dx), absDy4 = Math.abs(dy);
                if (absDx4 >= absDy4) {
                    nw = Math.max(CONFIG.minShapeSize, rs.sw - dx);
                    nh = nw / ratio;
                } else {
                    nh = Math.max(CONFIG.minShapeSize, rs.sh - dy);
                    nw = nh * ratio;
                }
                nx = rs.sx + rs.sw - nw;
                ny = rs.sy + rs.sh - nh;
            }
        } else {
            // Original independent resize (unchanged)
            if (h.includes('e')) nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
            if (h.includes('w')) { nw = Math.max(CONFIG.minShapeSize, rs.sw - dx); nx = rs.sx + rs.sw - nw; }
            if (h.includes('s')) nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
            if (h.includes('n')) { nh = Math.max(CONFIG.minShapeSize, rs.sh - dy); ny = rs.sy + rs.sh - nh; }
        }
        
        s.x = snap(nx); s.y = snap(ny); s.width = snap(nw); s.height = snap(nh);
        clampShape(s);
    });
    render();
    return;
}
```

**Design rationale for corner handles:** When resizing via a corner handle with aspect ratio locked, the dimension with the **larger absolute delta** drives the change. This prevents the shape from "fighting" the user's intent when they drag primarily in one axis. For edge handles (n, s, e, w), the resize axis drives both dimensions.

#### 3.5.2 `minShapeSize` Enforcement with Ratio

When aspect ratio is locked, enforcing `CONFIG.minShapeSize` (20px) requires care: if one dimension would hit the minimum, the other must be adjusted proportionally to maintain the ratio, which may also violate the minimum. In that case, clamp the violating dimension and compute the other from the ratio.

**Rule:** Always enforce `nw >= CONFIG.minShapeSize` and `nh >= CONFIG.minShapeSize`. If both can't be satisfied with the locked ratio, the shape stops resizing (the drag handle effectively locks at the boundary).

### 3.6 Properties Panel Width/Height Input Changes

The `propWidth` and `propHeight` change handlers must be modified to enforce aspect ratio locking:

```js
propWidth.addEventListener('change', function() {
    var v = parseFloat(propWidth.value);
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (!s) return;
        if (s.lockAspectRatio && s.height > 0) {
            var ratio = s.width / s.height;
            s.width = v;
            s.height = s.width / ratio;
            if (s.height < CONFIG.minShapeSize) {
                s.height = CONFIG.minShapeSize;
                s.width = s.height * ratio;
            }
        } else {
            s.width = v;
        }
    });
    pushUndo();
    render();
});

propHeight.addEventListener('change', function() {
    var v = parseFloat(propHeight.value);
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (!s) return;
        if (s.lockAspectRatio && s.width > 0) {
            var ratio = s.width / s.height;
            s.height = v;
            s.width = s.height * ratio;
            if (s.width < CONFIG.minShapeSize) {
                s.width = CONFIG.minShapeSize;
                s.height = s.width / ratio;
            }
        } else {
            s.height = v;
        }
    });
    pushUndo();
    render();
});
```

Currently both inputs share a single listener. They must be split into individual listeners to handle the cross-constraint.

### 3.7 Custom SVG Rendering — `shapeSVG()` Changes

When `preserveSvgAspectRatio` is `true`, the rendered nested `<svg>` must use `preserveAspectRatio="xMidYMid meet"` instead of `"none"`:

```js
case 'custom':
    var inner = (s.customSvg || '').trim();
    if (!inner) {
        // Placeholder (unchanged)
        return '<rect width="'+w+'" height="'+h+'" ...>';
    }
    var ext = computeSvgExtent(inner);
    var par = s.preserveSvgAspectRatio ? 'xMidYMid meet' : 'none';
    return '<svg x="0" y="0" width="'+w+'" height="'+h+
           '" viewBox="0 0 '+ext.w+' '+ext.h+
           '" preserveAspectRatio="'+par+'" overflow="hidden">'+inner+'</svg>';
```

When `preserveSvgAspectRatio` is `true`:
- The SVG content scales uniformly to fit within the shape bounds
- The content is centered (xMidYMid) within the shape
- Empty space (letterboxing) appears on one axis if the shape ratio differs from the SVG ratio
- The shape's own `lockAspectRatio` ensures the shape ratio matches the SVG ratio, so letterboxing should not appear in practice

When `preserveSvgAspectRatio` is `false` (default):
- Unchanged behavior: `preserveAspectRatio="none"` stretches the SVG content non-uniformly to fill the shape edge-to-edge

### 3.8 `addShape()` — New Property Defaults

In `addShape()` (around line 836), add the new properties with defaults:

```js
var s = {
    id: genId(), type: type, name: autoName, x: x, y: y, width: w, height: h, text: '',
    fill: fillInput.value, stroke: strokeInput.value,
    sw: parseInt(swInput.value) || 0,
    opacity: parseInt(opacityInput.value) / 100,
    fillOpacity: 1,
    strokeOpacity: 1,
    textColor: textColorInput.value,
    textAlign: 'center',
    locked: false, fontSize: CONFIG.defaultFontSize,
    textPad: 8,
    zHeight: 0,
    hidden: false,
    lockAspectRatio: false     // NEW
};
if (type === 'custom') {
    s.customSvg = '';
    s.preserveSvgAspectRatio = false;  // NEW
}
```

### 3.9 Migration for Existing Documents

In `init()` / `loadFromLocalStorage()`, after loading state, backfill the new properties for any shapes that lack them:

```js
S.shapes.forEach(function(s) {
    if (s.lockAspectRatio === undefined) s.lockAspectRatio = false;
    if (s.type === 'custom' && s.preserveSvgAspectRatio === undefined) {
        s.preserveSvgAspectRatio = false;
    }
});
```

This ensures that shapes loaded from old saved states work correctly.

### 3.10 Undo/Redo Handling

No changes needed. The `lockAspectRatio` and `preserveSvgAspectRatio` properties are part of the shape object, which is snapshotted by `pushUndo()` via `JSON.stringify({ shapes: S.shapes, ... })`. Undo/redo will correctly restore these properties.

### 3.11 Clone/Duplicate Handling

No changes needed. `dup()` and `pasteClipboard()` both use `JSON.parse(JSON.stringify(o))` to deep-clone shape objects, which copies all properties including the new ones.

---

## 4. Aspect Ratio Computation for Custom SVGs

When `preserveSvgAspectRatio` is enabled and the user pastes SVG content, the natural aspect ratio is computed from `computeSvgExtent()` (or from the outer `<svg>` tag's viewBox if present):

| SVG Content | viewBox / Extent | Aspect Ratio |
|---|---|---|
| `<rect width="2" height="3" fill="red"/>` | `0 0 2 3` | 2:3 (0.667) |
| `<circle cx="50" cy="50" r="50" fill="green"/>` | `0 0 100 100` | 1:1 (1.0) |
| `<svg viewBox="0 0 200 300">...` | `0 0 200 300` | 2:3 (0.667) |
| Empty / fallback | `0 0 100 100` | 1:1 (1.0) |

The aspect ratio is `ext.w / ext.h`. This is the ratio locked when `preserveSvgAspectRatio` is on.

### 4.1 When Does the Ratio Get Locked?

The ratio is computed **at render time** from `computeSvgExtent()`. It is **not** stored as a separate property on the shape object. This means:

- If the user changes the SVG code, the aspect ratio updates automatically on next render.
- The shape's current `width` and `height` are adjusted to match the new ratio when the checkbox is first toggled on.

**Critical:** When the user checks `preserveSvgAspectRatio`, the shape's dimensions must be updated to match the SVG's natural aspect ratio immediately:

```js
propPreserveSvgAr.addEventListener('change', function() {
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (s && s.type === 'custom') {
            s.preserveSvgAspectRatio = propPreserveSvgAr.checked;
            s.lockAspectRatio = s.preserveSvgAspectRatio;
            
            if (s.preserveSvgAspectRatio) {
                // Compute SVG natural aspect ratio and adjust shape
                var inner = (s.customSvg || '').trim();
                if (inner) {
                    var ext = computeSvgExtent(inner);
                    var svgRatio = ext.w / ext.h;
                    // Adjust shape to match SVG ratio, keeping area roughly the same
                    var area = s.width * s.height;
                    s.height = Math.sqrt(area / svgRatio);
                    s.width = s.height * svgRatio;
                    if (s.width < CONFIG.minShapeSize) {
                        s.width = CONFIG.minShapeSize;
                        s.height = s.width / svgRatio;
                    }
                    if (s.height < CONFIG.minShapeSize) {
                        s.height = CONFIG.minShapeSize;
                        s.width = s.height * svgRatio;
                    }
                }
            }
        }
    });
    logAction(...);
    pushUndo();
    render();
});
```

---

## 5. Files Changed

### 5.1 `index.html`

| Change | Location |
|---|---|
| Add `prop-lock-ar` checkbox | Geometry section, after W/H inputs |
| Add `prop-preserve-svg-ar` checkbox | Custom SVG section |
| Add DOM ref in script init | N/A (refs retrieved in app.js) |

### 5.2 `app.js`

| Change | Location (approx line) | Description |
|---|---|---|
| Add DOM refs for checkboxes | ~230-235 | `propLockAr`, `propPreserveSvgAr` |
| Add new shape defaults in `addShape()` | ~836-858 | `lockAspectRatio: false`, `preserveSvgAspectRatio: false` |
| Add migration backfill in `init()` | ~3050 | Set defaults for loaded shapes |
| Modify `shapeSVG()` custom case | ~1044-1069 | Use `preserveAspectRatio` based on `preserveSvgAspectRatio` |
| Modify `renderProps()` | ~1399-1450 | Show/hide checkboxes, sync values |
| Modify `propWidth`/`propHeight` handlers | ~2773-2785 | Split into individual listeners with AR constraint |
| Modify `S.isResizing` block in pointermove | ~1864-1882 | Add aspect-ratio-constrained resize math |
| Add `propLockAr` event listener | ~new | Change handler for lock AR checkbox |
| Add `propPreserveSvgAr` event listener | ~new | Change handler for preserve SVG AR checkbox |

### 5.3 `styles.css`

| Change | Description |
|---|---|
| Possibly add `.checkbox-label` styling | If not already present with adequate spacing |

### 5.4 `documents/ASPECT_RATIO.md`

| Change | Description |
|---|---|
| This document | Specification, implementation plan, and trace |

---

## 6. Test Cases

### 6.1 Lock Aspect Ratio — All Shapes

| Test | Action | Expected |
|---|---|---|
| **Lock on, drag SE corner** | Create rect 120×80, check Lock AR, drag SE corner right 40px | Width increases by 40px, height increases proportionally (80*160/120 = ~107px) |
| **Lock on, drag E edge** | Same setup, drag E edge left 20px | Width decreases by 20px, height decreases proportionally |
| **Lock on, drag N edge** | Same setup, drag N edge up 10px | Height decreases by 10px, width decreases proportionally |
| **Lock on, drag NW corner** | Same setup, drag NW corner up-left | Both width and height decrease, anchored at SE corner |
| **Lock on, type new width** | With Lock AR on, change W to 200 in panel | Height updates to 200*(80/120) = ~133px |
| **Lock on, type new height** | With Lock AR on, change H to 50 in panel | Width updates to 50*(120/80) = 75px |
| **Lock off** (default) | No check, resize freely | Existing independent width/height behavior |
| **Lock on, hit min size** | Try to make shape smaller than 20×20 | Both dimensions stop at 20×20 (or closest ratio-satisfying size ≥20) |

### 6.2 Preserve SVG Aspect Ratio — Custom Shapes

| Test | Action | Expected |
|---|---|---|
| **Toggle on for 2×3 SVG** | Create custom shape, paste `<rect width="2" height="3" fill="red"/>`, check Preserve SVG AR | Shape dimensions adjust to 2:3 ratio. Render uses `preserveAspectRatio="xMidYMid meet"`. Red rect is centered with letterboxing if shape dimensions differ (but lock AR prevents this). |
| **Toggle on for 1×1 circle** | Paste `<circle cx="50" cy="50" r="50" fill="green"/>`, check Preserve SVG AR | Shape becomes square. Circle is centered, no distortion. |
| **Toggle off** | Uncheck Preserve SVG AR | Returns to stretch-to-fill (`preserveAspectRatio="none"`). Lock AR also turns off. |
| **Resize with Preserve SVG AR on** | Check Preserve SVG AR, then resize via drag handles | Shape maintains SVG's natural aspect ratio (same as Lock AR behavior). |
| **Change SVG code while Preserve SVG AR on** | With Preserve SVG AR checked, change SVG from 2×3 to 4×5 rect | Shape re-adjusts to 4:5 ratio automatically on render. |
| **Lock AR checkbox interaction** | Check Preserve SVG AR → Lock AR also checks. Uncheck Lock AR → Preserve SVG AR also unchecks. | Bidirectional coupling via event handlers. |

### 6.3 Migration

| Test | Action | Expected |
|---|---|---|
| **Load old state** | Load a .json file created before this feature | All shapes get `lockAspectRatio: false`, custom shapes get `preserveSvgAspectRatio: false`. Visual rendering unchanged. |
| **Load new state** | Save a file with these properties set, reload | Properties are preserved. Aspect ratio behavior persists. |

### 6.4 Undo/Redo

| Test | Action | Expected |
|---|---|---|
| **Toggle Lock AR, undo** | Check Lock AR, then Ctrl+Z | Shape returns to unchecked state |
| **Resize with Lock AR, undo** | With Lock AR on, resize, then undo | Shape returns to pre-resize dimensions and Lock AR state |

---

## 7. Edge Cases

### 7.1 Zero or Near-Zero Dimensions

Computing ratio from zero dimensions would cause division by zero or infinity. The resize logic must guard against this:

```js
if (s.lockAspectRatio && rs.sh > 0 && rs.sw > 0) {
    var ratio = rs.sw / rs.sh;
    // ... use ratio
}
```

If either dimension is zero at resize start, fall back to unconstrained behavior.

### 7.2 Multiple Shapes Selected

When multiple shapes are selected and resized simultaneously with the lock aspect ratio feature:

- Each shape has its **own** `lockAspectRatio` setting. Shapes may have different settings.
- The resize loop iterates over all selected shapes independently.
- A shape with `lockAspectRatio: true` uses its own starting dimensions to compute its ratio.
- A shape with `lockAspectRatio: false` resizes independently as before.

This is consistent with the existing multi-select resize behavior (each shape gets the same `dx`/`dy` delta applied independently).

### 7.3 Circle Shape Type (Already 1:1)

The `circle` shape type is rendered as an `<ellipse>` with `rx = w/2` and `ry = h/2`. It can technically have non-equal width and height (making it an ellipse). Locking aspect ratio on a circle effectively makes it a true circle. This is correct behavior.

### 7.4 Very Small or Very Large Ratios

A shape with a 100:1 aspect ratio (very wide, very short) should lock correctly:
- Resizing width by 200px → height changes by 2px
- The `minShapeSize` clamp may cause the ratio to be slightly violated (if height would drop below 20px, width is recomputed from 20px * ratio = 2000px)

The min-shape-size clamp takes priority over ratio preservation. If both can't be satisfied, the resize is effectively locked (no further reduction possible in the constrained axis).

### 7.5 SVG Code Changes While Preserve SVG AR is On

When the user edits the SVG textarea while `preserveSvgAspectRatio` is checked, the `customSvgCode` input handler fires but does NOT recalculate dimensions. The shape keeps its current dimensions and ratio. The SVG renders with `preserveAspectRatio="xMidYMid meet"` using the NEW viewBox/extent.

**Implication:** If the new SVG has a different aspect ratio, the shape will show letterboxing (empty space) until the user resizes it or re-toggles the preserve checkbox.

To improve UX, the handler could auto-adjust dimensions when the SVG content changes and `preserveSvgAspectRatio` is on:

```js
customSvgCode.addEventListener('input', function() {
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (s && s.type === 'custom') {
            s.customSvg = customSvgCode.value;
            if (s.preserveSvgAspectRatio) {
                // Recompute ratio and adjust dimensions
                var inner = (s.customSvg || '').trim();
                if (inner) {
                    var ext = computeSvgExtent(inner);
                    var svgRatio = ext.w / ext.h;
                    var area = s.width * s.height;
                    s.height = Math.sqrt(area / svgRatio);
                    s.width = s.height * svgRatio;
                }
            }
        }
    });
    render();
});
```

This is an optional enhancement — the base spec does not require auto-adjustment on every input keystroke (which could be jarring).

### 7.6 `preserveSvgAspectRatio` with Empty SVG

When `customSvg` is empty and `preserveSvgAspectRatio` is checked, the placeholder renders. The fallback `computeSvgExtent('')` returns `{ w: 100, h: 100 }`, giving a 1:1 ratio. The shape becomes square. This is sensible — if there's no SVG content, a 1:1 placeholder is appropriate.

---

## 8. Implementation Order

1. **Data model**: Add `lockAspectRatio` and `preserveSvgAspectRatio` to `addShape()` and migration code.
2. **HTML**: Add checkbox elements to `index.html`.
3. **DOM refs & `renderProps()`**: Add references and sync logic in `app.js`.
4. **Event handlers**: Add change handlers for both checkboxes.
5. **Resize logic**: Modify the `S.isResizing` block for aspect-ratio-constrained resize.
6. **Properties panel inputs**: Split `propWidth`/`propHeight` handlers and add AR constraint.
7. **Custom SVG rendering**: Modify `shapeSVG()` to use `preserveAspectRatio` based on setting.
8. **Test**: Run through all test cases in §6.

---

## 9. Design Rationale

### Why not store the aspect ratio as a separate property?

The aspect ratio is always computable from `width / height` (or from `computeSvgExtent()` for `preserveSvgAspectRatio`). Storing it redundantly would create a synchronization problem: if width changes, the stored ratio must update, or the shape would lock to a stale ratio. Computing it on the fly from current dimensions avoids this.

For `preserveSvgAspectRatio`, the ratio comes from the SVG content, which can change independently. Computing from `computeSvgExtent()` at render time ensures the ratio is always current.

### Why couple `preserveSvgAspectRatio` with `lockAspectRatio`?

If a user enables `preserveSvgAspectRatio` but not `lockAspectRatio`, the SVG would render with uniform scaling inside a shape that can be freely distorted — causing letterboxing or empty space. This is confusing. By coupling them, the shape's dimensions always match the SVG's natural ratio, so the SVG fills the shape without distortion and without empty space.

### Why letterbox instead of crop when `preserveAspectRatio="xMidYMid meet"`?

The `meet` keyword scales the SVG to be fully visible within the viewport (shape), potentially leaving empty space on one axis. This is the standard SVG behavior for preserving aspect ratio. The alternative `xMidYMid slice` would crop the SVG to fill the viewport, which would hide content. Since the user's SVG content is meant to be fully visible, `meet` is the correct choice. The `lockAspectRatio` coupling prevents letterboxing from appearing in normal use.

---

*Document version 1.0 — initial specification for Lock Aspect Ratio and Preserve SVG Aspect Ratio features.*