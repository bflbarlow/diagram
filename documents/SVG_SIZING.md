# Custom SVG Sizing — Edge-to-Edge Fill Specification

## 1. Requirements

The Custom SVG shape type must render user-supplied SVG content so that:

1. **Edge-to-edge fill** — The rendered SVG content occupies the entire shape bounding box with zero margins, zero insets, zero empty border regions.
2. **No overflow** — No portion of the SVG content extends beyond the shape's bounding box (no clipping of the shape box, no scrollbars, no visual bleed into neighboring shapes).
3. **No underflow** — No unfilled area remains inside the shape bounding box; the entire rectangle from `(0,0)` to `(width, height)` is covered by rendered SVG content.
4. **Stretches with shape resize** — When the user resizes the shape, the SVG content stretches or shrinks to continue filling the bounding box exactly. Distortion is acceptable (the user controls aspect ratio via the shape dimensions).
5. **No extra configuration fields** — The user must not need to configure a separate "coordinate space" (viewBox dimensions) to achieve correct sizing. The system auto-detects the SVG content's coordinate space.

---

## 2. Implementation (as of app.js v1.1.4+)

### 2.1 Core Mechanism

The custom SVG render uses a **nested `<svg>`** element whose attributes decouple the shape's rendered pixel size from the SVG content's coordinate space:

```
┌──────────────────────────────────────────┐
│  Nested <svg>                            │
│  width  = shape pixel width              │  ← rendered output size
│  height = shape pixel height             │
│  viewBox = "0 0 extW extH"              │  ← content's coordinate space (auto-detected)
│  preserveAspectRatio = "none"            │  ← stretches coords to fill pixels
│  overflow = "hidden"                     │  ← safety clip
│                                          │
│  ┌──────────────────────────────────────┐│
│  │  User's SVG elements                 ││
│  │  (rect, circle, path, etc.)          ││
│  │  authored in the content's           ││
│  │  own coordinate space                ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

- **`width` / `height`** = shape's pixel dimensions (`s.width`, `s.height`). These determine how many pixels the nested SVG occupies in the diagram.
- **`viewBox`** = `"0 0 extW extH"` where `extW` and `extH` are auto-detected from the SVG content's own coordinate system (e.g., `2×3` if the content uses `width="2" height="3"`).
- **`preserveAspectRatio="none"`** forces the coordinate space to stretch non-uniformly to fill the pixel space. A `2×3` coordinate space stretched into a `10×10` pixel box scales 5× in X and 3.33× in Y.
- **`overflow="hidden"`** clips any SVG content that would exceed the shape boundary (safety net).

This means: whatever coordinate range the SVG elements use becomes the viewBox, and the shape's pixel box stretches that range edge-to-edge. When the shape is resized, the viewBox stays the same (the content doesn't change) but the pixel box changes, causing the stretch factors to change — the content always fills the shape.

### 2.2 Shape Data Model

```js
{
    id: 's1',
    type: 'custom',
    width: 10,          // shape pixel width  (user can resize)
    height: 10,         // shape pixel height (user can resize)
    customSvg: '<rect width="2" height="3" fill="red"/>'  // raw SVG markup
    // NO customW / customH — coordinate space is auto-detected
}
```

### 2.3 Rendering Pipeline

#### `shapeSVG()` — custom case (app.js)

```js
case 'custom':
    var inner = (s.customSvg || '').trim();
    if (!inner) {
        // Placeholder when no SVG content
        return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'" opacity="0.4"/>' +
               '<text x="'+(w/2)+'" y="'+(h/2)+'" text-anchor="middle" ...>Custom</text>';
    }
    // Try to extract viewBox from outer <svg> tag first (authoritative).
    // Only fall back to element-scanning when there is no outer tag or no viewBox.
    var ext = null;
    var m = inner.match(/<svg\b[^>]*>/i);
    if (m) {
        var vb = m[0].match(/viewBox\s*=\s*["']([^"']*)["']/i);
        if (vb) {
            var parts = vb[1].split(/[\s,]+/);
            if (parts.length >= 4) {
                var pw = parseFloat(parts[2]), ph = parseFloat(parts[3]);
                if (pw > 0 && ph > 0) ext = { w: pw, h: ph };
            }
        }
        inner = inner.replace(/<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    }
    if (!ext) ext = computeSvgExtent(inner);
    // width/height = shape pixel dims; viewBox = content's coordinate space
    return '<svg x="0" y="0" width="'+w+'" height="'+h+
           '" viewBox="0 0 '+ext.w+' '+ext.h+
           '" preserveAspectRatio="none" overflow="hidden">'+inner+'</svg>';
```

#### `computeSvgExtent()` — coordinate space auto-detection

```js
function computeSvgExtent(inner) {
    if (!inner) return { w: 100, h: 100 };
    var maxX = 0, maxY = 0;

    function attr(el, name) {
        var re = new RegExp(name + '\\s*=\\s*[\"\']([\\d.]+)[\"\']', 'i');
        var mm = el.match(re);
        return mm ? parseFloat(mm[1]) : null;
    }

    var tags = inner.match(/<\w+[^>]*>/gi);
    if (tags) {
        for (var i = 0; i < tags.length; i++) {
            var el = tags[i];
            var x  = attr(el, 'x'),   cx = attr(el, 'cx');
            var x1 = attr(el, 'x1'),  x2 = attr(el, 'x2');
            var y  = attr(el, 'y'),   cy = attr(el, 'cy');
            var y1 = attr(el, 'y1'),  y2 = attr(el, 'y2');
            var w  = attr(el, 'width');
            var h  = attr(el, 'height');
            var r  = attr(el, 'r'),   rx = attr(el, 'rx'),  ry = attr(el, 'ry');

            // X extent
            if (cx !== null)      maxX = Math.max(maxX, cx + (r || rx || 0));
            else if (x !== null)  maxX = Math.max(maxX, x + (w || 0));
            else if (w !== null)  maxX = Math.max(maxX, w);
            if (x1 !== null) maxX = Math.max(maxX, x1);
            if (x2 !== null) maxX = Math.max(maxX, x2);

            // Y extent
            if (cy !== null)      maxY = Math.max(maxY, cy + (r || ry || 0));
            else if (y !== null)  maxY = Math.max(maxY, y + (h || 0));
            else if (h !== null)  maxY = Math.max(maxY, h);
            if (y1 !== null) maxY = Math.max(maxY, y1);
            if (y2 !== null) maxY = Math.max(maxY, y2);

            // Polygon/polyline points
            var pts = el.match(/points\s*=\s*[\"\']([^\"\']*)[\"\']/i);
            if (pts) {
                var nums = pts[1].split(/[\s,]+/);
                for (var p = 0; p < nums.length; p++) {
                    var n = parseFloat(nums[p]);
                    if (!isNaN(n)) {
                        if (p % 2 === 0) maxX = Math.max(maxX, n);
                        else             maxY = Math.max(maxY, n);
                    }
                }
            }
            // Path d attribute
            var d = el.match(/d\s*=\s*[\"\']([^\"\']*)[\"\']/i);
            if (d) {
                var coords = d[1].match(/[\d.]+/g);
                if (coords) {
                    for (var c = 0; c < coords.length; c++) {
                        var cn = parseFloat(coords[c]);
                        if (!isNaN(cn)) {
                            if (c % 2 === 0) maxX = Math.max(maxX, cn);
                            else             maxY = Math.max(maxY, cn);
                        }
                    }
                }
            }
        }
    }
    if (maxX <= 0 || maxY <= 0) { maxX = 100; maxY = 100; }
    return { w: maxX, h: maxY };
}
```

The function scans all SVG element tags and extracts coordinate attributes (`x`, `y`, `cx`, `cy`, `x1`, `y1`, etc.) plus dimensional attributes (`width`, `height`, `r`, `rx`, `ry`) and path data (`points`, `d`) to compute the maximum extent. Falls back to 100×100 when nothing is found.

### 2.4 `customSvgCode` Input Handler

```js
customSvgCode.addEventListener('input', function() {
    shapeSel().forEach(function(sid) {
        var s = findShape(sid);
        if (s && s.type === 'custom') {
            s.customSvg = customSvgCode.value;
        }
    });
    render();
});
```

Stores the raw SVG string. No viewBox parsing happens here — `computeSvgExtent()` handles that at render time.

### 2.5 Properties Panel

The UI shows only the SVG code textarea with no VBox W/H fields:

```html
<div class="panel-section panel-custom">
    <h4>Custom SVG</h4>
    <div class="prop-row">
        <label>
            <textarea id="custom-svg-code" rows="6"
                placeholder="Paste SVG elements — use pixel coords matching shape size">
            </textarea>
        </label>
    </div>
</div>
```

---

## 3. Trace — User's Example

### Step 1: Shape 10×10, paste `<rect width="2" height="3" fill="red"/>`

1. SVG content stored: `s.customSvg = '<rect width="2" height="3" fill="red"/>'`
2. `render()` → `shapeSVG(s)` called with `w=10, h=10`
3. `computeSvgExtent()` scans the `<rect>` tag:
   - `x = null`, `cx = null` → skip cx branch
   - `x === null && w !== null` → `maxX = Math.max(0, 2) = 2`
   - `y = null`, `cy = null` → skip cy branch
   - `y === null && h !== null` → `maxY = Math.max(0, 3) = 3`
   - Returns `{ w: 2, h: 3 }`
4. Rendered: `<svg width="10" height="10" viewBox="0 0 2 3" preserveAspectRatio="none" ...>`
5. **Result**: Red rect stretches 5× horizontally and 3.33× vertically → fills all 10×10 pixels.

### Step 2: Resize shape to 11×30

1. `s.width = 11`, `s.height = 30`
2. `render()` → `shapeSVG(s)` called with `w=11, h=30`
3. `computeSvgExtent()` returns same `{ w: 2, h: 3 }` — content unchanged
4. Rendered: `<svg width="11" height="30" viewBox="0 0 2 3" preserveAspectRatio="none" ...>`
5. **Result**: Red rect stretches 5.5× horizontally and 10× vertically → fills all 11×30 pixels.

---

## 4. SVG Mechanics — Why This Works

### 4.1 viewBox + preserveAspectRatio

The `viewBox` attribute maps user coordinates to the element's rendered pixel area:

```
viewBox="minX minY width height"
```

When `preserveAspectRatio="none"` is set, the mapping is a **non-uniform stretch**:
- ViewBox coordinate `(0,0)` → pixel `(0,0)`
- ViewBox coordinate `(extW, extH)` → pixel `(width, height)`
- Scale X = `width / extW`, Scale Y = `height / extH` (can differ)

This is the crucial property: the SVG content's coordinate system is **independent** of the shape's pixel size. The content stays in whatever coordinate space it was authored in, while the shape's pixel box provides the stretch factor.

### 4.2 Why Not Use Shape Dimensions as ViewBox?

Using `viewBox="0 0 SHAPE_W SHAPE_H"` would mean:
- A `<rect width="2" height="3">` in a 10×10 shape would occupy only the top-left 2×3 pixel region.
- The remaining 8×7 pixels would be empty (underflow).
- The user would have to author SVG content that exactly matches the shape's pixel dimensions.

This is not what we want. The shape can be any size, and the SVG content should stretch to fill it regardless.

### 4.3 Auto-Detection vs. User-Configured ViewBox

The original code required the user to set VBox W/H manually (or parse viewBox from an `<svg>` tag). The `computeSvgExtent()` function eliminates this by examining the SVG elements themselves to determine the coordinate extent.

**Limitations of auto-detection:**
- Only examines the first-level elements for coordinate attributes
- Does not follow CSS transforms or `<use>` references
- Assumes integer/float coordinates (no calc(), percentages, or expressions)
- Path data parsing is naive (all numeric tokens are treated as coordinates)

These limitations are acceptable because:
- Most user-pasted SVG content uses simple coordinate attributes
- The 100×100 fallback ensures reasonable default behavior
- Users can wrap content in an `<svg viewBox="...">` tag if auto-detection gives wrong results

### 4.4 overflow="hidden"

The `overflow="hidden"` attribute ensures SVG elements that extend beyond the shape's pixel bounds are clipped. This is a safety net for edge cases where computed extent is slightly smaller than the actual content boundary.

### 4.5 Stroke Inset Consideration

Custom SVG content does **not** automatically inset strokes. A `<rect width="100%" height="100%" stroke="black" stroke-width="4">` will have its right and bottom strokes clipped at the shape boundary. Users must account for stroke width (e.g., `x="2" y="2" width="calc(100% - 4)" height="calc(100% - 4)"`).

---

## 5. Edge Cases

### 5.1 Empty SVG Content

If `customSvg` is empty or whitespace-only, a placeholder renders:
```js
'<rect width="'+w+'" height="'+h+'" fill="'+fc+'" opacity="0.4"/>' +
'<text x="'+(w/2)+'" y="'+(h/2)+'" text-anchor="middle" ...>Custom</text>'
```
This placeholder fills the full shape bounds using the shape's pixel dimensions directly (no viewBox involved).

### 5.2 Shape Resized to Zero or Negative

The app enforces `CONFIG.minShapeSize = 20`. Shapes cannot be smaller than 20×20 pixels, avoiding degenerate viewBox scenarios.

### 5.3 Content Smaller Than Shape

If the user pastes `<circle cx="50" cy="50" r="50" fill="green"/>` into a 300×200 shape:
- `computeSvgExtent` returns `{ w: 100, h: 100 }` (cx=50 + r=50 → 100)
- viewBox = "0 0 100 100", shape = 300×200
- The circle stretches 3× in X and 2× in Y → becomes an ellipse filling the shape
- This is correct behavior — the content's coordinate space (100×100) is stretched to fill the shape

### 5.4 Content Larger Than Shape

If the user pastes `<rect width="500" height="400" fill="blue"/>` into a 100×50 shape:
- `computeSvgExtent` returns `{ w: 500, h: 400 }`
- viewBox = "0 0 500 400", shape = 100×50
- The rect shrinks: 0.2× in X and 0.125× in Y
- `overflow="hidden"` clips nothing because the rect exactly matches the viewBox

### 5.5 Pasted `<svg>` Tag with viewBox

If the user pastes `<svg viewBox="0 0 100 150"><rect width="100" height="150" fill="red"/></svg>`:
1. Outer `<svg>` tag is matched → `viewBox="0 0 100 150"` extracted
2. `ext = { w: 100, h: 150 }` → viewBox used directly
3. Outer tag is stripped → inner content = `<rect width="100" height="150" fill="red"/>`
4. Result: viewBox = "0 0 100 150" (from the authoritative tag, not recomputed)

The viewBox from the author's `<svg>` tag is treated as the **authoritative** coordinate space definition. Element scanning is only used as a fallback when no outer tag or no viewBox attribute is present.

### 5.6 Pasted `<svg>` Tag Without viewBox, Without Coordinates

If the user pastes `<svg><circle r="10"/></svg>`:
1. Outer tag stripped → `<circle r="10"/>`
2. `computeSvgExtent`: `r=10` but no `cx`/`cy` → `maxX` stays 0 (cx branch skipped, x branch skipped, w branch: w is null)
3. Fallback: `{ w: 100, h: 100 }`
4. Circle appears in the 0,0 corner of the 100×100 coordinate space, stretched to fill shape

This is a minor edge case — `<circle>` without `cx`/`cy` defaults to `cx="0" cy="0"`, so the `r=10` alone doesn't fully describe the extent. Users should include `cx`/`cy` for circle/ellipse elements.

### 5.7 Migration from v1.1.4 (Old Documents)

| Scenario | Old Render | New Render | Effect |
|---|---|---|---|
| Shape 10×10, VBox 2×3, `<rect w="2" h="3">` | Stretched 5×/3.33× | Same — viewBox auto-detected as 2×3 | **No visual change** |
| Shape 10×10, VBox 100×100, `<rect w="50" h="50">` | Stretched 0.1×/0.1× | ViewBox auto-detected as 50×50 → stretched 0.2×/0.2× | **Visual change** — content now fills half the shape instead of quarter |
| Shape 10×10, no VBox set, bare elements | Fallback 100×100 → stretched | Auto-detected from elements | Varies |

Old `customW`/`customH` properties on shape objects are simply ignored (not read by the new code).

---

## 6. Implementation Notes

### 6.1 Files Changed

| File | Change |
|---|---|
| `app.js` | Removed `customVbW`, `customVbH` DOM refs (lines 167–168) |
| `app.js` | Updated `shapeSVG()` custom case to call `computeSvgExtent()` for viewBox |
| `app.js` | Added `computeSvgExtent()` helper function |
| `app.js` | Removed `customVbW`/`customVbH` reads from panel update code (line 1362-1363) |
| `app.js` | Removed viewBox parsing from `customSvgCode` input handler |
| `app.js` | Removed `customVbW`/`customVbH` event listeners |
| `index.html` | Removed VBox W/H input fields, updated placeholder text |

### 6.2 Test Cases

| Test | Action | Expected |
|---|---|---|
| **Small content in large shape** | Shape 200×200, paste `<rect width="50" height="100" fill="red"/>` | Red rect stretches 4× horizontally, 2× vertically — fills entire shape |
| **Large content in small shape** | Shape 50×50, paste `<rect width="200" height="100" fill="blue"/>` | Blue rect shrinks 0.25× horizontally, 0.5× vertically — fills entire shape |
| **Resize preserves stretch** | After above, resize to 100×25 | Blue rect stretches 0.5× horizontally, 0.25× vertically — fills new shape |
| **Circle with cx/cy** | Shape 100×100, paste `<circle cx="50" cy="50" r="50" fill="green"/>` | Circle stretches to fill shape (viewBox 0 0 100 100 → exact match) |
| **Polygon points** | Shape 100×100, paste `<polygon points="0,0 100,0 50,100" fill="yellow"/>` | Triangle fills shape (viewBox 0 0 100 100) |
| **Paste `<svg>` with viewBox** | Paste `<svg viewBox="0 0 200 300"><rect width="200" height="300"/></svg>` | viewBox = 0 0 200 300 (computed from elements, not tag) |
| **Mixed elements** | Shape 100×100, paste `<rect width="80" height="60"/><circle cx="40" cy="40" r="30"/>` | viewBox = 0 0 80 70 (extent covers all elements) |
| **Empty content** | Delete all SVG text | Placeholder "Custom" text fills shape |

---

## 7. Design Rationale

**Why auto-detect the viewBox instead of requiring user input?**
Users expect to paste SVG content and have it "just work." Requiring manual VBox W/H fields is confusing and error-prone. Auto-detection covers the vast majority of real-world SVG fragments.

**Why compute extent from elements rather than parsing the `<svg>` tag's viewBox?**
The SVG fragment may not have an outer `<svg>` tag. When it doesn't, we fall back to element-scanning to compute the tightest bounding box, ensuring the content fills the shape edge-to-edge. However, **when a viewBox IS present on the outer tag, we use it as authoritative** — the author designed their SVG for that specific coordinate space, and element-scanning is fragile (especially with path arc commands that embed non-coordinate flags). The priority is: outer tag viewBox → element scanning → 100×100 fallback.

**Why keep the nested `<svg>` wrapper at all?**
It provides coordinate-space isolation. The outer SVG (shape container) has its own `viewBox="0 0 W H"` for consistent rendering. The nested `<svg>` is the user's coordinate environment. Changing it doesn't affect the outer container.

**What about `<percentage>` or `calc()` values?**
These are not parsed by the current regex-based approach. If user content uses `width="50%"`, `computeSvgExtent` will miss it. The fallback to 100×100 will apply. Users with complex SVG should use explicit numeric coordinates or an `<svg viewBox="...">` wrapper with numeric values.

---

*Document version 2.0 — reflects final implementation as of app.js v1.1.4+.*