# Diagram — Project Style Guide

**Version 1.1**

This document supplements the [Free Open Tools Ecosystem Style Guide](../freeopentools/STYLE_GUIDE.md). Every rule in that guide applies to this application in full. This document does **not** replace or relax any ecosystem-wide rule — it only adds project-specific conventions, patterns, and architectural guidelines that are unique to the diagram editor.

Where a conflict appears to exist, the ecosystem style guide takes precedence.

---

## Relationship to the Ecosystem Style Guide

1. **This project** is a member of the Free Open Tools suite. All rules in the ecosystem guide (colors, typography, spacing, icons, accessibility, performance, voice) apply here without exception.
2. **This guide** documents what the ecosystem guide cannot: the internal architecture, canvas conventions, toolbar patterns, shape system, undo/redo behavior, and code organization that make this specific tool consistent with itself.
3. **Future tools** in the suite should not blindly copy this guide — only the ecosystem guide is universal. This guide exists for the diagram editor alone.

---

## 1. Application Identity

### 1.1 Name

The application is called **Diagram** (not "diagramflow", not "chart", not any other variant).

- In code identifiers (variable names, localStorage keys, CSS classes): use `diagram` as a prefix.
- In UI copy: use "Diagram" (capitalized) as the proper noun for the application, and "diagram" (lowercase) when referring to the user's work (e.g., "Export your diagram as PNG").
- The page `<title>` should read "Diagram" (or "About Diagram" on the about page).

### 1.2 Purpose

A lightweight, browser-based diagram editor for creating flowcharts, technical diagrams, and vector illustrations. No dependencies, no build step, no server. Zero learning curve: the interface is a canvas with a toolbar — the only thing a user sees when they open the page.

---

## 2. Architecture & Code Organization

### 2.1 File Structure

The application consists of exactly three source files, plus supporting files:

```
index.html        — Main application HTML (toolbar, canvas, panels, context menu)
about.html        — About page (project info, version, changelog)
app.js            — All application logic in a single IIFE
styles.css        — All styles, themes, and layout
STYLE_GUIDE.md    — This document
README.md         — Project readme (user-facing)
LICENSE           — License file (MIT)
```

### 2.2 `app.js` Architecture

`app.js` is a single IIFE (Immediately Invoked Function Expression) that contains all application state, rendering, event handling, and utilities in one scope. This is intentional — the tool must work with no build step, no module system, and no framework.

#### 2.2.1 Internal Structure (in order)

```
1. VERSION constant        — e.g. '1.0.0'
2. CONFIG object           — All tunable constants (snap threshold, handle size, zoom limits, etc.)
3. S object (State)        — All mutable application state (shapes, connections, selection, tool, zoom, etc.)
4. Utility functions       — Pure math helpers (distToSegment, transformPoint, etc.)
5. Rendering functions     — renderShapes(), renderConns(), renderGrid(), etc.
6. Event handlers          — mousedown, mousemove, mouseup, wheel, keydown, contextmenu, etc.
7. Initialization          — DOM setup, state restoration, event binding, start loop
```

#### 2.2.2 Naming Conventions

- **Constants**: `UPPER_SNAKE_CASE` (`VERSION`, `CONFIG`)
- **State properties**: camelCase within the `S` object (`S.shapes`, `S.tool`, `S.zoom`)
- **Functions**: camelCase (`addShape`, `renderShapes`, `distToSegment`)
- **DOM IDs**: kebab-case (`#project-name`, `#canvas-container`, `#btn-undo`)
- **CSS classes**: kebab-case (`.diagram-shape`, `.tool-btn`, `.panel-section`)
- **localStorage keys**: `diagram-` prefix with kebab-case (`diagram-state`, `diagram-theme`) — legacy `diagramflow-*` keys migrated to `diagram-*` via one-time migration block on load

#### 2.2.3 State Object (`S`)

All mutable state lives in a single `S` object. Key properties:

| Property | Type | Description |
|---|---|---|
| `S.shapes` | Array | All shape objects on the canvas |
| `S.connections` | Array | All connection objects |
| `S.selection` | Array | IDs of currently selected shapes |
| `S.tool` | String | Active tool (`'select'`, `'line'`, `'text'`) |
| `S.toolDown` | Boolean | Whether a tool is currently being used |
| `S.isDragging` | Boolean | Whether a shape is being dragged |
| `S.isResizing` | Boolean | Whether a shape is being resized |
| `S.panX`, `S.panY` | Number | Canvas pan offset |
| `S.zoom` | Number | Current zoom level (1.0 = 100%) |
| `S.projectName` | String | User-defined project name |
| `S.canvasW`, `S.canvasH` | Number | Canvas dimensions |
| `S.undoStack` | Array | Undo history |
| `S.redoStack` | Array | Redo history |

#### 2.2.4 Shape Object Schema

Every shape in `S.shapes` follows this schema:

```js
{
  id: String,           // unique ID (e.g., 's-' + timestamp)
  type: String,         // 'rect', 'roundRect', 'circle', 'diamond', 'triangle', 'terminator', 'custom'
  x: Number,            // x position on canvas
  y: Number,            // y position on canvas
  width: Number,        // width in px
  height: Number,       // height in px
  text: String,         // text content (optional)
  fontSize: Number,     // font size in px
  textPad: Number,      // text padding in px
  textAlign: String,    // alignment key ('center', 'middle-left', etc.)
  fill: String,         // CSS color for fill
  stroke: String,       // CSS color for outline
  strokeWidth: Number,  // outline width in px
  opacity: Number,      // 0–100
  textColor: String,    // CSS color for text
  zIndex: Number,       // paint order
  locked: Boolean,      // prevents interaction
  customViewboxW: Number,    // for custom SVG shapes
  customViewboxH: Number,    // for custom SVG shapes
  customSvgCode: String      // raw SVG elements for custom shapes
}
```

#### 2.2.5 Connection Object Schema

```js
{
  id: String,
  type: String,         // 'line' (only type currently)
  startId: String,      // shape ID where the line starts (or null for free-floating)
  endId: String,        // shape ID where the line ends (or null)
  startX: Number,       // absolute canvas x of start point
  startY: Number,       // absolute canvas y of start point
  endX: Number,
  endY: Number,
  color: String,        // CSS color
  width: Number,        // line width in px
  arrowStart: Boolean,  // whether start has an arrowhead
  arrowEnd: Boolean,    // whether end has an arrowhead
  name: String          // optional label
}
```

---

## 3. Canvas Conventions

### 3.1 Coordinate System

- The canvas uses a standard Cartesian coordinate system with (0,0) at the top-left of the canvas area.
- All shape positions (`x`, `y`) are in canvas-space coordinates, not screen-space.
- Zoom and pan are applied via CSS `transform: translate() scale()` on the `#canvas` element, not by modifying shape coordinates.
- Grid lines are drawn at 16px intervals (in canvas-space), regardless of zoom level.

### 3.2 Shape Rendering

- Shapes are rendered as absolutely-positioned `<div>` elements inside `#shapes-layer`.
- Each shape's visual is drawn as an inline SVG `<svg>` element inside its `<div>`.
- Connections are rendered as inline SVG `<svg>` elements inside `#shapes-layer` (not a separate layer), positioned absolutely with `overflow: visible`.
- Text within shapes is rendered as a `<div class="shape-text">` positioned absolutely inside the shape `<div>`.

### 3.3 Z-Ordering

- Paint order follows array order: shapes later in `S.shapes` array paint on top of earlier ones.
- `zIndex` property on each shape is a static value set at creation and **not automatically updated** by reorder operations. Bring-to-front / send-to-back operations must reorder the array and update all `zIndex` values (or drop `zIndex` entirely and rely on DOM append order — see REVIEW.md §1.1).

---

## 4. Toolbar Conventions

### 4.1 Toolbar Layout

The toolbar is a fixed horizontal bar at the top of the screen (52px height). It is divided into logical groups separated by vertical dividers:

1. **App logo** (left-aligned, links to about page)
2. **Tool selection** (Select, Line, Text)
3. **Shape palette** (Rectangle, Rounded, Circle, Diamond, Triangle, Start/End, Custom SVG)
4. **Style controls** (Fill, Stroke, Stroke Width, Opacity, Text Color)
5. **Undo/Redo**
6. **Duplicate/Delete**
7. **Grid/Snap toggles**
8. **Zoom controls** (zoom percentage, zoom in, zoom out)
9. **Theme toggle**
10. **Export dropdown**
11. **Save/Load project**

### 4.2 Tool Interaction

- **Active tool**: Highlighted with accent border and background via `.tool-btn.active`.
- **Shape buttons**: Creating a shape sets the tool to `'select'` and places the shape immediately (click-once-to-place, not click-and-drag).
- **Line tool**: Click start shape, click end shape, or click empty canvas for free-floating points.
- **Text tool**: Creates a rectangle shape with the current fill/stroke settings and enters text-editing mode immediately.
- **Keyboard shortcuts**: Listed in the `title` attribute of each button (e.g., `title="Select (V)"`).

### 4.3 Properties Panel

The right-side panel shows properties for the selected shape(s) or connection. It can be collapsed to a thin vertical strip.

- **Nothing selected**: Shows project-level properties (project name, canvas width/height).
- **Shape selected**: Shows name, geometry (x, y, width, height), text, style (fill, stroke, stroke width, opacity, text color).
- **Connection selected**: Shows name, color, width, arrow toggles.
- **Custom shape selected**: Shows viewbox dimensions and raw SVG code editor.

---

## 5. Theme System

### 5.1 Theme Variables

The application defines its own set of CSS custom properties on `:root` (dark) and `[data-theme="light"]`. These **must be migrated** to match the Free Open Tools ecosystem palette (see §2 of ecosystem guide). Currently the project uses a purple accent (`--accent: #cba6f7` / `#7c3aed`) which must become blue (`#2563EB`) to conform to ecosystem rules.

### 5.2 Theme Toggle

- The theme toggle cycles between light and dark modes.
- Theme preference is persisted in `localStorage` under the key `diagram-theme`.
- On page load, the theme is restored from localStorage; if no saved preference exists, the OS preference (`prefers-color-scheme`) is used.
- Theme switching must happen before first paint via an inline script in `<head>` (see ecosystem guide §6.1).
- The toggle button uses an SVG icon, not an emoji character.

### 5.3 Global Theme Sync

Theme preference is stored per-tool in `localStorage` under `diagram-theme`. A `window.addEventListener('storage', ...)` handler syncs theme changes across open tabs in real time, toggling dark/light in one tab updates all others instantly.

---

## 6. Export System

### 6.1 Export Formats

| Format | Crop Mode | Implementation |
|---|---|---|
| PNG (auto-crop) | Crops to bounding box of all shapes | `html2canvas` with clipped region |
| PNG (full canvas) | Full canvas area | `html2canvas` with full canvas dimensions |
| JPG (auto-crop) | Cropped | `html2canvas` → canvas.toDataURL('image/jpeg') |
| JPG (full canvas) | Full canvas | `html2canvas` → canvas.toDataURL('image/jpeg') |
| PDF (auto-crop) | Cropped | `html2canvas` + `jspdf` |
| PDF (full canvas) | Full canvas | `html2canvas` + `jspdf` |

### 6.2 Export Dependencies

The application loads two external libraries for export functionality:

- `html2canvas` (CDN) — captures the canvas DOM as an image
- `jspdf` (CDN) — generates PDF output

These are the only external runtime dependencies. They are loaded via `<script>` tags from a CDN at the bottom of `index.html`.

### 6.3 Save/Load

- Projects are saved as `.json` files containing the entire `S` object state (shapes, connections, project name, canvas dimensions).
- The filename defaults to the project name (sanitized to alphanumeric + underscore/hyphen) or `"diagram"`.
- Auto-save to localStorage (`diagram-state`) occurs on every state change.

---

## 7. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `V` | Select tool |
| `L` | Line tool |
| `T` | Text tool |
| `G` | Toggle grid |
| `S` | Toggle snap |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Y` | Redo |
| `Ctrl+D` / `Cmd+D` | Duplicate selected |
| `Delete` / `Backspace` | Delete selected |
| `Ctrl+\` | Collapse/expand properties panel |
| `Escape` | Deselect all / cancel line |
| `Arrow keys` | Nudge selected shapes by 1px |
| `Shift + Arrow keys` | Nudge by 10px |

---

## 8. Mouse & Touch Interaction

### 8.1 Interaction Modes

The editor supports three primary interaction modes:

1. **Select mode** — Click to select, drag to move, drag-resize via handles, drag-create selection box, click-drag to pan canvas (on empty area).
2. **Line mode** — Click start anchor, click end anchor to create a connection.
3. **Text mode** — Click on canvas to create a text shape and immediately edit.

### 8.2 Touch Support

All interactions support touch input via pointer events. Canvas panning supports single-finger drag (on empty area) and pinch-zoom (two-finger gesture).

- Touch targets are ≥44×44px throughout (WCAG 2.5.5).
- `touch-action: none` and `-webkit-user-select: none` on the canvas prevent browser interference.
- The toolbar uses `touch-action: manipulation` to prevent double-tap zoom.

### 8.3 Right-Click / Context Menu

Right-clicking on a shape opens a context menu with: Duplicate, Delete, Bring to Front, Bring Forward, Send Backward, Send to Back, Lock/Unlock, Edit Text. The context menu is positioned at the pointer location and dismissed on click-outside or Escape.

---

## 9. Undo / Redo

### 9.1 History

- Every state-modifying action (add shape, delete shape, move shape, resize, change property, add connection, delete connection) pushes a snapshot to the undo stack.
- The undo stack is capped at 50 entries (`CONFIG.maxUndo`).
- Snapshots are deep copies of `S.shapes` and `S.connections`.

### 9.2 Undo / Redo Behavior

- **Undo**: Restores the previous snapshot of shapes and connections. Pushes the current state onto the redo stack.
- **Redo**: Restores the next snapshot. Pushes the current state back onto the undo stack.
- A new action after an undo flushes the redo stack.

---

## 10. Action Log

### 10.1 Purpose

The action log (collapsible panel at the bottom of the properties panel) records a human-readable history of every action the user performs. It is a debugging and transparency aid, not an undo mechanism.

### 10.2 Log Format

Each log entry is one line:

```
[time] action_type: description
```

Example:

```
14:32:05 add: Added Rectangle (r-1234)
14:32:12 move: Moved Rectangle (r-1234) to (150, 200)
14:32:18 del: Deleted Circle (c-5678)
```

### 10.3 Action Types

- `add` — Shape or connection created
- `del` — Shape or connection deleted
- `edit` — Property changed
- `move` — Shape moved or resized
- `sys` — System events (project loaded, version info, etc.)

---

## 11. Canvas Size & Grid

### 11.1 Default Canvas

- Default canvas size: **2500×2500 px**.
- Canvas dimensions are adjustable via the properties panel (when nothing is selected).
- Maximum canvas size: **10000×10000 px**.

### 11.2 Grid

- Grid spacing: **16px** (in canvas-space).
- Grid visibility is toggled via the grid button in the toolbar (keyboard: `G`).
- Grid lines are drawn on a separate `#grid-layer` div, which is always behind the shapes layer.

### 11.3 Snap

- When snap is enabled (keyboard: `S`), shape anchors (corners, midpoints, center) snap to grid intersections and other shape anchors within an **16px** threshold (at 100% zoom, scaled by zoom factor).
- Snap highlights are shown as accent-colored glow on the target anchor.

---

## 12. Custom SVG Shapes

### 12.1 Support

The editor supports custom SVG shapes via the "Custom SVG" shape palette button. Users can paste arbitrary SVG elements into a text area and adjust viewbox dimensions.

### 12.2 Restrictions

- Only SVG **elements** (paths, circles, rects, etc.) are accepted — the outer `<svg>` tag is provided by the renderer.
- The viewbox defines the coordinate space; the shape's width/height on canvas is independent of the viewbox.
- The custom SVG content is rendered inside a shape `<div>` with standard resize handles, text overlay, and styling.

---

## 13. Code Style (JavaScript)

### 13.1 Language Level

The application uses **ES5** (`var`, function declarations, no arrow functions, no `const`/`let`, no template literals, no classes). This is an intentional constraint to maximize browser compatibility without a transpiler.

### 13.2 Style Rules

- **No semicolons**: Semicolons are not used. Lines are terminated by newline.
- **`var` only**: Use `var` exclusively. No `let` or `const`.
- **Single quotes**: Strings use single quotes (`'`), not double quotes.
- **Spacing**: One space after `function`, one space after `if`/`for`/`while`, no spaces inside brackets.
- **Indentation**: 4-space indentation (not tabs).
- **Comments**: `//` for single-line, `/* */` for multi-line. JSDoc-style is not required, but function comments should describe purpose and parameters.

```js
// Good
function addShape(type, x, y) {
    var id = 's-' + Date.now();
    S.shapes.push({
        id: id,
        type: type,
        x: x,
        y: y
    });
}

// Bad
function addShape(type,x,y){
    const id = 's-'+Date.now();
    S.shapes.push({id,type,x,y});
}
```

### 13.3 DOM Access

- Use `document.getElementById()` for specific elements.
- Use `[].slice.call(document.querySelectorAll(...))` for NodeList-to-Array conversion.
- Cache DOM references in variables where possible (avoid repeated `getElementById`).

### 13.4 Event Handling

- Use `addEventListener` (not `on` properties like `onclick`).
- Use pointer events (`pointerdown`, `pointermove`, `pointerup`) over mouse/touch events for unified input handling.
- Cancel default behavior with `e.preventDefault()` where necessary.
- Stop propagation with `e.stopPropagation()` only when required.

---

## 14. CSS Style

### 14.1 Organization

Styles are organized in logical sections (see `styles.css`):

```
1. Theme Variables (:root, [data-theme="dark"], [data-theme="light"])
2. Reset & Base (*, html, body)
3. Toolbar (#toolbar, .app-logo, .tool-btn, .shape-btn, .zoom-display)
4. Canvas (#canvas-container, #canvas, #grid-layer, #shapes-layer, #preview-layer)
5. Shapes (.diagram-shape, .resize-handle, .shape-text)
6. Connections (.conn-sel, .conn-arrow)
7. Properties Panel (#properties-panel, .panel-header, .panel-section)
8. Context Menu (#context-menu, .context-item)
9. Text Editor (#text-editor, #text-input)
10. Utility (.selection-box, .snap-highlight, .hidden)
11. Action Log (.panel-log, .log-header, .log-body)
12. Export Dropdown (.export-wrap, .export-drop, .export-item)
```

### 14.2 CSS Variables

Use CSS custom properties for all colors, spacing, and repeated values. Never hardcode color values in selectors (except in the `:root`/theme variable definitions themselves).

### 14.3 Selector Patterns

- ID selectors for unique structural elements (`#toolbar`, `#canvas`).
- Class selectors for repeated components (`.tool-btn`, `.diagram-shape`).
- Avoid deep nesting — CSS is flat, not preprocessed.

---

## 15. Accessibility (Diagram-Specific)

### 15.1 Canvas Accessibility

The canvas is inherently non-text content. The following mitigations apply:

- All toolbar buttons have `title` attributes describing their action and keyboard shortcut.
- Shape creation is announced via the action log, an `aria-live="polite"` region for screen readers.
- The canvas area is marked `aria-label="Diagram canvas"` with `role="application"`.
- Toolbar buttons are focusable and operable by keyboard with visible `:focus-visible` outlines.

### 15.2 Keyboard Navigation

- All toolbar buttons are focusable and operable by keyboard.
- Tab order follows visual left-to-right order in the toolbar.
- The properties panel form controls are focusable and operable by keyboard.
- Canvas operations (select, move, resize) via keyboard are not yet fully implemented — arrow keys nudge selected shapes; full keyboard canvas navigation is a future enhancement.

### 15.3 Live Regions

The action log is connected to an `aria-live="polite"` region so screen readers announce shape creation, deletion, and other actions without requiring visual focus on the log.

---

## 16. Migrating to Ecosystem Compliance

The following items are known gaps between the current application and the Free Open Tools ecosystem style guide. Each must be addressed in order of priority:

### P1 — Must Fix Before Suite Inclusion

1. **Accent color**: Purple (`--accent: #cba6f7`) → Blue (`--color-accent: #2563EB`). Update all CSS variables and rename to match ecosystem palette.
2. **Emoji in logo**: `⬡` (Unicode geometric shape) must be replaced with an SVG icon or removed.
3. **Theme toggle icon**: `☀` emoji must be replaced with an SVG icon (sun/moon).
4. **Action log header emoji**: `📋` must be replaced with an SVG icon or plain text.
5. **CSS variable names**: Rename project-specific variables (e.g., `--bg-body`, `--accent`) to match ecosystem names (`--color-bg`, `--color-surface`, `--color-accent`).
6. **Skip-to-content link**: Add as first focusable element before the toolbar.
7. **Inline theme script**: Add inline theme-detection script in `<head>` before any stylesheet loads to prevent flash.

### P2 — Should Fix

1. **Color contrast**: Verify all text/background combinations meet WCAG AA 4.5:1 in both themes using the ecosystem palette.
2. **Focus states**: Ensure all interactive elements have visible `:focus-visible` outline (currently missing on toolbar buttons).
3. **Touch targets**: Verify all interactive elements meet 44×44px minimum (currently toolbar inputs like `input[type="number"]` are 32px tall).
4. **Font sizes**: Ensure no text is below 16px in body copy (currently panel labels are 11px and action log text is 10px — these may need exceptions or re-evaluation).
5. **System font stack**: Align with ecosystem `--font-sans` and `--font-mono` stacks.

### P1 — Completed (v1.0)

1. **Accent color**: Purple → Blue (`#2563EB`). All CSS variables renamed to ecosystem palette.
2. **Emoji in logo**: `⬡` replaced with inline SVG.
3. **Theme toggle icon**: `☀` replaced with SVG sun/moon.
4. **Action log header emoji**: `📋` replaced with inline SVG.
5. **CSS variable names**: Renamed to match ecosystem (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`).
6. **Skip-to-content link**: Added as first focusable element.
7. **Inline theme script**: Added in `<head>` before stylesheet.

### P2 — Completed (v1.0)

1. **Color contrast**: Verified WCAG AA via ecosystem palette.
2. **Focus states**: Global `:focus-visible` rule with accent outline.
3. **Touch targets**: All interactive elements ≥44×44px; toolbar increased to 60px.
4. **Font sizes**: Body text at 16px; toolbar inputs at 16px; panel labels 12px, log body 12px.
5. **System font stack**: Aligned with ecosystem `--font-sans` / `--font-mono`.

### P3 — Completed (v1.1)

1. **Spacing tokens**: All raw `padding`/`margin`/`gap` pixel values replaced with `--space-N` tokens.
2. **Radius tokens**: All raw `border-radius` values replaced with `--radius-*` tokens.
3. **Shadow tokens**: All shadows use `--shadow-md`/`--shadow-lg` tokens.
4. **Icon normalization**: All tool icons use 24×24 viewBox, `stroke="currentColor"`, `stroke-width="2"`, consistent with ecosystem conventions.
5. **`aria-live="polite"`**: Added to action log for screen reader announcements.
6. **Canvas `aria-label`**: Added `aria-label="Diagram canvas" role="application"` to canvas container.
7. **Cross-tab theme sync**: `storage` event listener propagates theme changes across open tabs.
8. **localStorage cleanup**: Legacy `diagramflow-*` keys migrated to `diagram-*` on load with removal of old keys.

### Deferred (awaiting ecosystem direction)

1. **Back-to-all-tools link**: Removed per user preference; user is designing a different ecosystem navigation approach.
2. **Ecosystem header/nav**: Awaiting user's design against the original style guide.
3. **Mobile canvas layout**: Requires ecosystem header design before responsive mobile layout can be implemented.

---

## 17. Checklist Before Shipping

- [x] All ecosystem style guide rules are followed (see ecosystem §10)
- [x] Accent color is blue (`#2563EB`), not purple
- [x] No emoji characters in UI — all icons are SVGs
- [x] Theme toggle uses SVG icon
- [x] CSS variable names match ecosystem palette
- [x] Inline theme script prevents flash
- [x] Skip-to-content link is present
- [x] All toolbar buttons have visible focus outlines
- [x] All interactive elements are ≥44×44px
- [x] Spacing/radius/shadow tokens used throughout
- [x] aria-live on action log for screen reader announcements
- [x] Canvas aria-label and role
- [x] Cross-tab theme sync via storage event
- [x] localStorage key migration from diagramflow-* to diagram-*
- [x] Keyboard shortcuts are documented in button `title` attributes
- [x] Undo/redo works correctly for all shape/connection operations
- [x] Export (PNG, JPG, PDF) works in both light and dark themes
- [x] Save/Load project (.json) round-trips correctly
- [x] Grid and snap toggles work as expected
- [x] Context menu appears on right-click and dismisses correctly
- [x] No console errors on load or during interaction
- [ ] Ecosystem header/nav — awaiting user's design approach

---

*This document is a living supplement to the Free Open Tools Ecosystem Style Guide. It should be updated as the application evolves, but never to relax ecosystem rules.*