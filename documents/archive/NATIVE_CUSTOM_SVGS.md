# Native Custom SVG Specification

## Overview

A "native-custom" SVG is a custom SVG that the diagram editor treats identically to a built-in shape (rect, circle, diamond, etc.). It receives full customization via the properties panel: fill color, fill opacity, stroke (outline) color, stroke width, stroke opacity, text labels, resize handles, and connection snap ports — all as if it were a native shape.

## Rendering Architecture

Built-in shapes are rendered as **two layered elements**:

1. **Fill layer**: A full-size shape element (rect/ellipse/polygon matching the shape's silhouette) with `fill` and `fill-opacity`
2. **Stroke layer**: An inset copy of that same silhouette with `stroke`, `stroke-width`, and `stroke-opacity`

The stroke layer is inset by `stroke-width / 2` on each side so the stroke renders entirely within the shape bounds. This works for built-in shapes because their silhouette is always a simple, known geometric primitive (rect, ellipse, polygon) that the app can redraw at two sizes.

Custom SVGs use a **different mechanism**, because their silhouette is arbitrary and cannot be redrawn generically as a scaled primitive. Instead of layering separate fill/stroke shapes behind and in front of the content, the app injects `fill`/`stroke`/opacity attributes directly onto the custom SVG's own drawable elements (see Content Rules #1). This makes the content paint itself with the user's chosen style while preserving its actual silhouette — a non-rectangular icon (star, gear, arrow) fills and strokes along its own outline rather than a bounding-box rectangle.

For a custom SVG to receive native treatment, the app must be able to:

1. Extract the coordinate extent (viewBox width and height) to know the content's coordinate space
2. Inject the user's fill/fill-opacity onto each drawable content element that doesn't already declare its own
3. Inject the user's stroke/stroke-width/stroke-opacity onto each drawable content element that doesn't already declare its own
4. Compute connection snap ports at the shape's bounding box edges (this part *is* identical to built-in shapes, since ports are based on bounding box, not silhouette)

## Required SVG Structure

A native-compatible custom SVG must conform to the following structure:

### Outer `<svg>` Tag (Required)

The outer `<svg>` tag **must** include a `viewBox` attribute. This is the authoritative source for the shape's coordinate space.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 WIDTH HEIGHT">
  <!-- inner content -->
</svg>
```

- `xmlns` — Must be `http://www.w3.org/2000/svg` (or omitted; the app strips outer `<svg>` tags anyway)
- `viewBox` — **Required, with no safe automatic fallback.** Format: `"0 0 WIDTH HEIGHT"` or `"X MIN_Y WIDTH HEIGHT"`. The app parses the third and fourth values as the extent width and height. The regex-based fallback extent scanner (see Fallback Behavior) cannot reliably parse arc/curve `<path>` commands or flag-packed shorthand notation, so omitting `viewBox` risks an incorrectly sized shape for any path-based content.
- `WIDTH` and `HEIGHT` — Must be positive numbers. These define the coordinate space the wrapper `<svg>` maps onto the shape's rendered width/height, which in turn determines how injected `stroke-width` values visually scale (see Gap 6, non-uniform scale distortion).

### Inner Content

The app strips the outer `<svg>` opening and closing tags, then inserts the inner content into its own generated `<svg>` wrapper:

```html
<svg x="0" y="0" width="W" height="H" viewBox="0 0 ext.w ext.h" preserveAspectRatio="none" overflow="hidden">
  <!-- inner content from custom SVG -->
</svg>
```

- `W` and `H` — The shape's canvas dimensions (set by user or via resize)
- The inner content is **scaled** to fit the shape's `W × H` bounds via the viewBox mapping

### Content Rules

All inner content **must** conform to these rules to receive native customization:

#### 1. No Fill or Stroke Attributes on Content Elements

Content elements should **not** have `fill`, `stroke`, `fill-opacity`, or `stroke-opacity` attributes if they are meant to receive the user's native styling. The app injects these attributes directly onto each top-level drawable element (`<rect>`, `<circle>`, `<ellipse>`, `<polygon>`, `<polyline>`, `<path>`, `<line>`) that does **not already declare** the attribute.

```xml
<!-- Receives native fill/stroke (no attributes declared) -->
<path d="M10 10 L90 10 L90 90 L10 90 Z"/>

<!-- Opts OUT of native fill/stroke for this element only — author's value is preserved -->
<path d="M10 10 L90 10 L90 90 L10 90 Z" fill="red" stroke="blue" stroke-width="2"/>
```

**Author-override precedence rule**: injection is per-attribute and per-element. If an element declares `fill` but not `stroke`, it keeps its authored fill and still receives the injected native stroke (and vice versa). This allows an author to hardcode specific details (e.g. an inner divider line that should always render black) while the rest of the shape follows the user's native fill/stroke selections. This is an intentional, documented capability — not an error condition.

The app applies fill/stroke by injecting attributes onto matched drawable elements in the raw SVG content string, **not** by drawing separate overlay shapes behind/in front of the content. A bounding-box fill/stroke overlay (as used for native rect/circle/etc. shapes) is **not used for custom SVGs** because it would paint outside the SVG's actual silhouette for any non-rectangular shape (see Implementation Requirements, Gap 1, for the rejected alternative and rationale).

**Stroke width caveat for open paths/lines**: The "inset by stroke-width / 2" rule that keeps native shape strokes fully inside the bounding box only applies to closed silhouette shapes. `<line>`, `<polyline>`, and open `<path>` elements have no equivalent inset — stroke expands outward from the centerline in both directions. If such an element sits near the viewBox edge, its stroke may be clipped by the wrapper's `overflow="hidden"`. Authors should manually inset detail lines by at least half of the maximum expected stroke width from all viewBox edges.

#### 2. Content Must Fit Within viewBox Bounds

All content must reside within the coordinate space defined by `viewBox="0 0 WIDTH HEIGHT"`. Content outside these bounds will be clipped by `overflow="hidden"` on the app's wrapper.

```xml
<!-- GOOD — content within 0-100 coordinate space -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40"/>
</svg>

<!-- BAD — content extends beyond viewBox -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="60"/>  <!-- extends to -10 and 110 -->
</svg>
```

#### 3. No Nested `<svg>` Tags

The app strips the outer `<svg>` tags and injects inner content directly. Nested `<svg>` elements will break the rendering.

```xml
<!-- BAD -->
<svg viewBox="0 0 100 100">
  <svg>  <!-- nested svg breaks content extraction -->
    <circle cx="50" cy="50" r="40"/>
  </svg>
</svg>

<!-- GOOD — use <g> for grouping -->
<svg viewBox="0 0 100 100">
  <g>
    <circle cx="50" cy="50" r="40"/>
  </g>
</svg>
```

#### 4. Use Standard SVG Shapes and Paths

Supported element types for native treatment:

| Element | Supported Attributes | Notes |
|---------|---------------------|-------|
| `<rect>` | `x`, `y`, `width`, `height`, `rx`, `ry` | No `fill`/`stroke` |
| `<circle>` | `cx`, `cy`, `r` | No `fill`/`stroke` |
| `<ellipse>` | `cx`, `cy`, `rx`, `ry` | No `fill`/`stroke` |
| `<polygon>` | `points` | No `fill`/`stroke` |
| `<polyline>` | `points` | No `fill`/`stroke` |
| `<path>` | `d`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray` | No `fill`/`stroke` |
| `<line>` | `x1`, `y1`, `x2`, `y2` | No `fill`/`stroke` |
| `<g>` | `transform` | For grouping only; fill/stroke injection targets individual drawable children directly, not the `<g>` wrapper |

`<use>` is **not supported**. Native-custom SVGs are stored and rendered as a single inline content string with no `<defs>` mechanism, so there is no defined way to declare the content a `<use>` element would reference. Including `<use>` produces undefined rendering behavior.

#### 5. Transform Attributes Allowed

`transform` (translate, rotate, scale, skewX, skewY) is supported on `<g>` and individual elements. The app computes the bounding extent by scanning positional attributes (`x`, `y`, `cx`, `cy`, `x1`, `y1`, `x2`, `y2`, `rx` for circles, `width`/`height` for rects) **before** applying transforms.

#### 6. No `<text>` Elements

Text is handled separately by the app's text label system. Including `<text>` in the SVG content will render it inside the shape but it will not receive the app's text styling controls (font size, color, alignment, padding).

## Complete Examples

### Example 1: Simple Star (Native-Compatible)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"/>
</svg>
```

**Result**: User can set fill → gold, stroke → dark orange, stroke-width → 3. The app injects these values onto the `<polygon>` element directly, so the star's own outline is filled and stroked — no bounding-box rectangle is drawn behind it.

### Example 2: Complex Icon (Gear)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g>
    <circle cx="50" cy="50" r="35"/>
    <circle cx="50" cy="50" r="12" fill="none"/>
    <line x1="50" y1="10" x2="50" y2="38"/>
    <line x1="50" y1="62" x2="50" y2="90"/>
    <line x1="10" y1="50" x2="38" y2="50"/>
    <line x1="62" y1="50" x2="90" y2="50"/>
    <line x1="22" y1="22" x2="42" y2="42"/>
    <line x1="58" y1="58" x2="78" y2="78"/>
    <line x1="78" y1="22" x2="58" y2="42"/>
    <line x1="42" y1="58" x2="22" y2="78"/>
  </g>
</svg>
```

**Result**: User can set fill → steel blue, stroke → dark blue, stroke-width → 2. Fill/stroke are injected onto the `<circle>` and `<line>` elements inside the `<g>` (the second, inner `<circle fill="none">` already declares its own fill and is skipped by injection, so it stays visually hollow regardless of the user's fill color — an intentional author override, per Content Rules #1).

### Example 3: Rounded Rectangle with Inner Detail

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">
  <rect x="5" y="5" width="90" height="50" rx="8" ry="8"/>
  <line x1="5" y1="30" x2="95" y2="30"/>
</svg>
```

**Result**: User can set fill → light gray, stroke → dark gray, stroke-width → 2. Both the `<rect>` and the inner `<line>` lack fill/stroke attributes, so both receive the injected values — meaning the divider line will also pick up the user's stroke color/width. If the divider should stay a fixed color regardless of user styling, it must declare its own `stroke="..."` explicitly (see Content Rules #1, author-override precedence), and should be inset from the viewBox edges per the open-path stroke caveat.

## Fallback Behavior

If the outer `<svg>` tag is missing or has no `viewBox`, the app scans all inner elements for positional attributes (`x`, `y`, `cx`, `cy`, `x1`, `y1`, `x2`, `y2`, `width`, `height`, `r`, `rx`, `ry`) to compute the bounding extent. If no coordinates are found, it defaults to `100 × 100`.

**Known limitation**: this fallback also scans numeric tokens inside `<path d="...">` and treats them as alternating x/y coordinate pairs. This is unreliable for arc commands (`A rx ry x-axis-rotation large-arc-flag sweep-flag x y` — 7 numeric params per segment, not 2) and for flag-packed shorthand (e.g. `a1 1 0 0 1 10 10`, where adjacent flags can be written without delimiters). Do not rely on this fallback for path-heavy custom SVGs — always declare an explicit `viewBox`.

When no outer `<svg>` tag exists, the raw content is used directly as the inner content (no stripping needed).

## Non-Compatible Patterns

The following patterns will **not** receive native customization:

| Pattern | Problem |
|---------|---------|
| `<svg>` without `viewBox` | Extent computed by unreliable regex scanning (see Fallback Behavior) |
| Nested `<svg>` tags | Breaks content extraction |
| `<text>` elements | Not styled by app's text controls |
| `<image>` elements | External resources; may not render |
| `<use>` elements | No `<defs>` mechanism exists in the single-string content model; undefined behavior |
| `<filter>`, `<clipPath>`, `<defs>` | May be preserved but behavior is undefined |
| Content outside viewBox bounds | Clipped by `overflow="hidden"` |
| Non-uniform resize without "Preserve SVG Aspect Ratio" enabled | `stroke-width` renders visually thicker on the compressed axis and thinner on the stretched axis — inherent to `preserveAspectRatio="none"` scaling, not a bug. Enable "Preserve SVG Aspect Ratio" for visually consistent stroke width. |
| Elements with explicit `fill`/`stroke` already declared | Not a failure — intentionally excluded from injection per-attribute (see Content Rules #1, author-override precedence) |

## Properties Panel Requirements for Native Treatment

For a custom SVG to receive full native customization, the following properties panel controls must be enabled:

| Property | Control Type | Description |
|----------|-------------|-------------|
| **Fill Color** | Color picker | Injected as `fill` on each drawable content element lacking its own `fill` |
| **Fill Opacity** | Slider (0–1) | Injected as `fill-opacity` on each drawable content element lacking its own `fill-opacity` |
| **Stroke Color** | Color picker | Injected as `stroke` on each drawable content element lacking its own `stroke` |
| **Stroke Width** | Number input (px) | Injected as `stroke-width` on each drawable content element lacking its own `stroke-width`; no automatic inset is applied (see open-path stroke caveat, Content Rules #1) |
| **Stroke Opacity** | Slider (0–1) | Injected as `stroke-opacity` on each drawable content element lacking its own `stroke-opacity` |
| **Text Label** | Text input | Added as floating text overlay on the shape |
| **Text Color** | Color picker | Color of the text label |
| **Text Size** | Number input (px) | Font size of the text label |
| **Text Alignment** | Dropdown | Left, center, right text alignment |
| **Text Padding** | Number input (px) | Padding between text and shape edge |
| **Lock Aspect Ratio** | Checkbox | When checked, resizing maintains width:height ratio |
| **Preserve SVG Aspect Ratio** | Checkbox | When checked, sets `preserveAspectRatio="xMidYMid meet"` on the wrapper (recommended — keeps stroke width visually uniform); when unchecked, stretches non-uniformly to fill bounds and can visually distort stroke width per-axis |

## Technical Review — Verified Against Current Codebase

The section below was produced by re-reading `app.js` and `styles.css` line-by-line rather than assuming the architecture. Several items in the original draft of this plan were **incorrect** — the app is already far more "custom-shape-agnostic" than assumed. This review corrects those errors and identifies the *actual* remaining gaps.

### Corrections to Prior Assumptions

| Prior Assumption | Reality (verified in code) |
|---|---|
| Custom shapes need new state fields (`fill`, `stroke`, `sw`, `fillOpacity`, `strokeOpacity`, `text`, `textColor`, `fontSize`, `textAlign`, `textPad`) added specifically for them | **False.** `addShape()` (app.js:863) already sets all of these fields for **every** shape type, including `custom`. No per-type branching needed. |
| `updatePropsPanel()` needs new read/write binding functions for custom shapes | **False.** `syncStyleControlsToShape()` (app.js:1383) and `applyStyleToSelected()` (app.js:1529) are already generic — they operate on `s[prop]` with no `type` check. The only type-specific logic is the single `if (s.type === 'custom')` branch (app.js:1444) that hides `.panel-shape-style`. |
| Text label rendering needs to be added for custom shapes | **False.** `renderShapes()` (app.js:1315) renders `.shape-text` for any shape with `s.text` truthy, regardless of type. Text already works on custom shapes today (it's just not visible because the panel hides the input for setting it — see Gap 2 below). |
| Connection snap ports need a new implementation for custom shapes | **False.** `shapePorts(s)` (app.js:283) computes the 8 ports purely from `s.x/y/width/height` — it has no shape-type branching. Custom shapes already have working snap ports. `getShapeOutlinePoint()` (app.js:233) does branch by type, but its `default` case (bounding-box clamp) already applies correctly to `'custom'` since there's no `case 'custom'`. |
| Undo/redo needs a custom serialization function | **False.** `pushUndo()` (app.js:816) does `JSON.stringify({ shapes: S.shapes, connections: S.connections })` — a full deep serialization of whatever fields exist on the object. No allowlist, no type-specific logic. |
| Export/import (`downloadSaveFile` / load) needs new fields | **False.** Same reasoning — `S.shapes` is serialized wholesale. `btnLoadFile` (app.js:3088) already has a backfill step for `preserveSvgAspectRatio` for old files, proving the maintainers are aware old-format tolerance is handled per-field, not per-type. |
| Copy/paste (`copySelection` / `pasteClipboard`) needs new logic | **False.** `JSON.parse(JSON.stringify(s))` in `copySelection()` (app.js:942) and `pasteClipboard()` (app.js:960) clones the whole object generically. |
| Resize handles need new z-index / positioning logic for custom shapes | **False.** Handles are appended as sibling `<div>` elements to the shape wrapper `<div class="diagram-shape">` in `renderShapes()` (app.js:1327), not inside the shape's inner `<svg>`. They already render above any SVG content because they are DOM siblings positioned absolutely within the shape wrapper — z-index conflicts with SVG internals are not possible. No CSS or JS change needed here. |

**Net effect**: 9 of the original 12 "required changes" (state init, panel read binding, panel write binding, text rendering, connection ports, selection ring/handles, undo/redo, export/import, copy/paste) require **zero code changes** — they already work generically. The prior plan significantly overstated the required work by not verifying against the actual code.

### Actual Gaps (Verified)

#### Gap 1 — Fill/Stroke Overlay Is Missing for Custom Shapes (Real, P0)

**Confirmed in `shapeSVG()` (app.js:1024, `case 'custom':`, lines 1050–1073).**

Unlike every native shape branch (`rect`, `roundRect`, `circle`, `diamond`, `triangle`, `terminator`), which all render a full-size filled shape *plus* an inset stroked shape, the `custom` branch renders **only** the raw SVG content:

```js
case 'custom':
    ...
    return '<svg x="0" y="0" width="'+w+'" height="'+h+'" viewBox="0 0 '+ext.w+' '+ext.h+'" preserveAspectRatio="'+par+'" overflow="hidden">'+inner+'</svg>';
```

There is no fill rect, no stroke rect. So even though `s.fill`, `s.stroke`, `s.sw`, `s.fillOpacity`, and `s.strokeOpacity` are set on every custom shape (per Corrected Assumption #1), **nothing in the rendering path ever reads them for custom shapes.** This is the single actual rendering defect and matches the user's original request.

**Correction to prior fix proposal**: The prior document proposed wrapping the *entire bounding box* in a background fill rect and a foreground inset stroke rect (`fillRect + contentSVG + strokeRect`). This is only correct for **rectangular** custom shapes. For a custom SVG whose content is a **non-rectangular** silhouette (star, gear, blob, arrow, etc.), a bounding-box fill rect would paint a visible rectangle *behind* the shape's negative space — i.e. a star would show a rectangular fill "halo" around its points instead of the star being filled and its background staying transparent. This directly contradicts the spec's own Example 1 (star) and Example 2 (gear), which claim "the star fills the shape bounds" — that claim is **only true if the fill is literally painted onto the star polygon itself**, not a rectangle behind it.

**Corrected implementation approach — two viable strategies:**

**Strategy A (Recommended): Inject `fill`/`stroke` attributes directly onto the SVG content's own drawable elements.**

Rather than overlaying independent rect/stroke shapes behind/in front of the content, the app should rewrite the raw inner-content string, adding `fill`/`fill-opacity`/`stroke`/`stroke-width`/`stroke-opacity` attributes onto every top-level drawable element that doesn't already declare them. This preserves silhouette accuracy for any shape, since the content paints itself rather than being masked by an unrelated rectangle.

```js
case 'custom':
    var inner = (s.customSvg || '').trim();
    ... // existing viewBox/extraction logic unchanged ...
    // NEW: inject fill/stroke onto drawable elements within `inner`
    inner = injectShapeStyle(inner, fc, fo, sc, sw, so);
    return '<svg x="0" y="0" width="'+w+'" height="'+h+'" viewBox="0 0 '+ext.w+' '+ext.h+'" preserveAspectRatio="'+par+'" overflow="hidden">'+inner+'</svg>';
```

```js
/** Injects fill/stroke/opacity attributes onto each top-level drawable element
 *  in a custom SVG's inner content string, unless the element already declares
 *  its own fill/stroke (author override takes precedence — see Gap 3). */
function injectShapeStyle(inner, fill, fillOpacity, stroke, strokeWidth, strokeOpacity) {
    var drawable = /<(rect|circle|ellipse|polygon|polyline|path|line)\b([^>]*)>/gi;
    return inner.replace(drawable, function(full, tag, attrs) {
        var out = attrs;
        if (!/\bfill\s*=/.test(attrs))          out += ' fill="'+fill+'"';
        if (!/\bfill-opacity\s*=/.test(attrs))   out += ' fill-opacity="'+fillOpacity+'"';
        if (strokeWidth) {
            if (!/\bstroke\s*=/.test(attrs))         out += ' stroke="'+stroke+'"';
            if (!/\bstroke-width\s*=/.test(attrs))   out += ' stroke-width="'+strokeWidth+'"';
            if (!/\bstroke-opacity\s*=/.test(attrs)) out += ' stroke-opacity="'+strokeOpacity+'"';
        }
        return '<'+tag+out+'>';
    });
}
```

This directly satisfies Content Rules #1 (no fill/stroke declared on content elements that should receive native styling) — such elements are intentionally left bare so the app can inject the user's chosen values, exactly like this function does. `<g>` is deliberately excluded from the injection regex since attributes on a `<g>` don't reliably cascade to all children in every SVG renderer edge case; injecting directly on drawable leaf elements is more robust regardless of grouping. This means Example 2 (gear icon), which wraps drawables in a bare `<g>`, still works correctly because the regex matches the `<circle>`/`<line>` children directly, independent of the wrapping `<g>`. `<use>` is excluded entirely per Gap 7 — it is not a supported element at all, not merely excluded from injection.

**Strokes on lines/paths behave differently than rects/ellipses**: For a `<line>` or open `<path>`, `stroke-width` inset (`sw/2`) does not apply the way it does to closed rect/ellipse shapes in native rendering — there is no "inset stroke to stay within bounds" concept for a line. The prior plan's blanket "inset by stroke-width/2" note only applies to closed-shape strokes and must **not** be generalized to arbitrary custom paths. This should be called out explicitly as a spec caveat (added below in Gap 4).

**Strategy B (Alternative, not recommended): Keep bounding-box fill/stroke overlay, but only apply it when the SVG's outer element is itself a full-bounds rect/ellipse.** This limits native fill/stroke to shape outlines that exactly match a rect or ellipse silhouette, which defeats the purpose of custom SVGs (arbitrary icon shapes). Rejected in favor of Strategy A.

#### Gap 2 — Properties Panel Hides Style Controls for Custom Shapes (Real, P0)

**Confirmed in `renderProps()` (app.js:1444–1449):**

```js
var styleEl = propsPanel.querySelector('.panel-shape-style');
if (s.type === 'custom') {
    customEl.classList.remove('hidden');
    if (styleEl) styleEl.classList.add('hidden');   // ← hides fill/stroke/opacity/text controls
    customSvgCode.value = s.customSvg || '';
} else {
    customEl.classList.add('hidden');
    if (styleEl) styleEl.classList.remove('hidden');
}
```

This is a real, minimal, one-line-removal fix:

```js
var styleEl = propsPanel.querySelector('.panel-shape-style');
if (s.type === 'custom') {
    customEl.classList.remove('hidden');
    customSvgCode.value = s.customSvg || '';
} else {
    customEl.classList.add('hidden');
}
if (styleEl) styleEl.classList.remove('hidden'); // always visible now
```

Since `syncStyleControlsToShape(s)` is called unconditionally at the end of the `sIds.length === 1` branch (app.js:1466), the style inputs will already populate correctly from `s.fill`, `s.stroke`, `s.sw`, etc. the moment the hiding class is removed — no additional binding code is needed (confirms Corrected Assumption #2/#3).

#### Gap 3 — No Author-Override Precedence Rule for Fill/Stroke (New, Not Previously Documented)

The original spec (Content Rules #1) says content must have **no** `fill`/`stroke` at all, full stop. But Strategy A's `injectShapeStyle()` function as designed **skips injection when an attribute is already present** — meaning an SVG author *could* hardcode a fill on one element (e.g., to keep an inner detail line black regardless of the user's stroke color, as in spec Example 3's inner divider line). This is actually a **desirable, previously-undocumented capability**: partial native compatibility, where some elements opt out of user styling intentionally.

This needs to be documented as an explicit rule rather than left as an accidental side effect: elements **without** `fill`/`stroke` receive the user's native styling; elements **with** explicit `fill`/`stroke` retain their author-specified values and are excluded from native customization for that attribute only. The Non-Compatible Patterns table and Content Rules section should be updated to reflect this nuance rather than a blanket "must not have fill/stroke."

#### Gap 4 — Stroke Inset Semantics Undefined for Open Paths/Lines (New, Not Previously Documented)

Native shapes' stroke-width inset formula (`o = sw/2`, subtracted from width/height, added to x/y) only makes sense for **closed silhouette shapes** (rect, ellipse, polygon) where the stroke sits on a perimeter. For custom SVG content containing `<line>`, `<polyline>`, or open `<path>` elements, there is no equivalent "inset within bounds" operation — `stroke-width` simply expands the rendered line outward from its centerline in both directions, potentially clipping against `overflow="hidden"` if the line sits exactly on the viewBox edge.

**Required spec clarification**: authors of native-custom SVGs with open-path details (like Example 3's inner divider line) must manually inset such lines by at least `max_expected_stroke_width / 2` from the viewBox edges, since the app cannot algorithmically apply a bounds-safe inset to open paths the way it can for closed shapes.

#### Gap 5 — `computeSvgExtent()` Regex Fallback Cannot Parse `<path d="...">` Curves Correctly (New, Not Previously Documented)

**Confirmed in `computeSvgExtent()` (app.js:1082–1160).** The fallback path-scanning logic (used only when there's no `viewBox`, per Gap-adjacent Fallback Behavior) extracts **all** numbers from a path's `d` attribute and treats them positionally as alternating x/y coordinates:

```js
var coords = d[1].match(/[\d.]+/g);
if (coords) {
    for (var c = 0; c< coords.length; c++) {
        var cn = parseFloat(coords[c]);
        if (c % 2 === 0) maxX = Math.max(maxX, cn); else maxY = Math.max(maxY, cn);
    }
}
```

This breaks silently for any path command with a non-coordinate numeric parameter in an odd position — e.g. `A rx ry x-axis-rotation large-arc-flag sweep-flag x y` (arc commands have 7 numeric params per segment, not 2), or relative commands mixed with absolute ones, or flags written without separating whitespace (`a1 1 0 0 1 10 10` — SVG allows `001` to mean three flags `0,0,1` with no delimiter, which this regex cannot disambiguate at all). Since `viewBox` is documented as "required," this fallback matters only for malformed/legacy input, but it should be explicitly flagged as **unreliable for arc/curve-heavy paths** and use of an explicit `viewBox` should be upgraded from "required" to "required, with no safe fallback for path-based extent detection."

#### Gap 6 — `preserveAspectRatio="none"` Default Distorts Non-Uniform Content (Documented Behavior, Needs Explicit Callout)

Confirmed: `addShape()` (app.js:883) sets `s.preserveSvgAspectRatio = false` as the default for every new `custom` shape. With this default, `preserveAspectRatio="none"` is used, meaning any custom SVG will be **non-uniformly stretched** to fill whatever width/height the user resizes the shape to — including all stroke widths (since stroke-width is defined in the pre-scale viewBox coordinate space, a uniform `stroke-width="2"` will render visually thicker on the compressed axis and thinner on the stretched axis). This is a legitimate, unavoidable side effect of SVG's `preserveAspectRatio="none"` viewBox scaling and cannot be "fixed" — it must be documented as an inherent trade-off: **stroke width visually distorts under non-uniform scale unless "Preserve SVG Aspect Ratio" is enabled**, which the spec previously implied is optional but should call out as **required for visually consistent stroke rendering** on any custom shape resized away from its native aspect ratio.

#### Gap 7 — `<use>` Elements Were Incorrectly Listed as Supported (Contradiction, Now Resolved)

The original Content Rules table lists `<use>` as a supported element "for referenced elements... must also have no fill/stroke." However, `injectShapeStyle()`'s regex only matches `<use ...>` itself as a drawable tag (it is included in the regex alternation), which means the app *will* inject `fill`/`stroke` onto the `<use>` element — but per SVG spec, presentation attributes on a `<use>` element only apply to the referenced content if that content does not itself specify the attribute, and **only if the referenced element is in the same document** (via `<defs>` or `#id` fragment). Since native-custom SVGs strip the outer `<svg>` and have no reliable place to declare `<defs>`-based reusable content in the current single-string-content model, `<use>` should be **removed from the supported element list** — there's no defined mechanism for defining the referenced content in the first place.

### Revised Implementation Plan

| # | Item | File | Change | Priority | Verified Necessary? |
|---|---|---|---|---|---|
| 1 | Fill/stroke style injection for custom SVG content | `app.js` — `shapeSVG()`, `case 'custom'` | Add `injectShapeStyle()` helper; call it on `inner` before wrapping in the viewBox `<svg>` | P0 | **Yes** — this is the actual bug behind "props pane looks disabled"-adjacent behavior; fill/stroke silently do nothing today |
| 2 | Unhide style panel for custom shapes | `app.js` — `renderProps()` | Remove the `styleEl.classList.add('hidden')` branch for `type === 'custom'` | P0 | **Yes** — one-line fix, confirmed |
| 3 | Document author-override precedence | `NATIVE_CUSTOM_SVGS.md` | Clarify: elements with explicit `fill`/`stroke` opt out of injection per-attribute | P1 | **Yes** — needed once #1 ships, else undocumented/surprising behavior |
| 4 | Document open-path stroke inset caveat | `NATIVE_CUSTOM_SVGS.md` | Add authoring guidance: inset detail lines manually from viewBox edges | P1 | **Yes** — real rendering edge case under `overflow:hidden` |
| 5 | Flag `computeSvgExtent()` fallback as unreliable for arcs/curves | `NATIVE_CUSTOM_SVGS.md` | Elevate `viewBox` from "required" to "required; no safe automatic fallback" | P2 | **Yes** — accuracy/documentation gap, not a code bug |
| 6 | Document stroke distortion under non-uniform scale | `NATIVE_CUSTOM_SVGS.md` | Recommend enabling "Preserve SVG Aspect Ratio" for stroke-width consistency | P2 | **Yes** — inherent SVG behavior, must be documented, not fixable in code without per-axis stroke correction (out of scope) |
| 7 | Remove `<use>` from supported element list | `NATIVE_CUSTOM_SVGS.md` | Delete `<use>` row from Content Rules table | P1 | **Yes** — currently documents a non-functional capability |
| 8 | ~~State object init~~ | ~~`app.js`~~ | **No change** — already generic | — | **No, incorrectly identified in prior draft** |
| 9 | ~~Panel read/write binding~~ | ~~`app.js`~~ | **No change** — already generic | — | **No, incorrectly identified in prior draft** |
| 10 | ~~Text label rendering~~ | ~~`app.js`~~ | **No change** — already generic | — | **No, incorrectly identified in prior draft** |
| 11 | ~~Connection snap ports~~ | ~~`app.js`~~ | **No change** — already generic | — | **No, incorrectly identified in prior draft** |
| 12 | ~~Selection ring / resize handles~~ | ~~`app.js`/CSS~~ | **No change** — handles are DOM siblings, not SVG-internal | — | **No, incorrectly identified in prior draft** |
| 13 | ~~Undo/redo~~ | ~~`app.js`~~ | **No change** — full-object JSON serialization already generic | — | **No, incorrectly identified in prior draft** |
| 14 | ~~Export/import~~ | ~~`app.js`~~ | **No change** — same reasoning as undo/redo | — | **No, incorrectly identified in prior draft** |
| 15 | ~~Copy/paste~~ | ~~`app.js`~~ | **No change** — same reasoning | — | **No, incorrectly identified in prior draft** |

### Testing Checklist (Revised)

- [ ] Custom shape with a non-rectangular silhouette (star/gear) fills only the silhouette, not a bounding-box rectangle
- [ ] Custom shape displays with user-selected fill color and fill opacity
- [ ] Custom shape displays with user-selected stroke color, width, and opacity
- [ ] An SVG element with an explicit `fill`/`stroke` in the source retains its author-specified value and is not overwritten
- [ ] Text label renders on custom shape (should already work — verify no regression)
- [ ] Resize handles function correctly on custom shape (should already work — verify no regression)
- [ ] Connection lines snap to custom shape's 8 ports (should already work — verify no regression)
- [ ] Properties panel shows style controls (fill/stroke/opacity) for a selected custom shape
- [ ] Changing fill/stroke/opacity in the panel updates the custom shape's rendered content live
- [ ] Undo/redo restores custom shape fill/stroke changes correctly (should already work — verify no regression)
- [ ] Export/import round-trips custom shape fill/stroke/text values (should already work — verify no regression)
- [ ] Copy/paste preserves custom shape fill/stroke/text values (should already work — verify no regression)
- [ ] Custom SVG with an inner open `<path>`/`<line>` detail does not get visually clipped by `overflow:hidden` when a stroke is applied
- [ ] Custom SVG resized to a non-native aspect ratio without "Preserve SVG Aspect Ratio" checked shows expected stroke distortion (documented behavior, not a bug)
- [ ] Custom SVG using `<use>` is treated as unsupported/undefined (per Gap 7) until a `<defs>` mechanism is designed
- [ ] Empty custom SVG still falls back to fill rect + "Custom" placeholder text (existing behavior, unaffected by Gap 1 fix)
