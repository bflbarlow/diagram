# Diagram — v1.1.3

Part of the [Free Open Tools](https://freeopentools.com/) ecosystem — a suite of browser-based utilities.

A lightweight diagram editor built with vanilla HTML, CSS, and JavaScript — no dependencies, no build step. Create flowcharts and diagrams directly in the browser.

## Features

- **Shape Tools**: Rectangle, rounded rectangle, circle, diamond, triangle, terminator (start/end), and **Custom SVG** shapes
- **Connections**: Draw straight lines and arrows between points on the canvas with smart snapping
- **Text Tool**: Add floating text labels
- **Styling**: Fill color, stroke color, stroke width, opacity, and text color for shapes
- **Connection Styling**: Color, width, and arrow toggle for selected lines/arrows
- **Font Size**: Adjustable per shape via the properties panel
- **Custom SVG Shapes**: Paste your own SVG code to create custom shapes with full viewBox control
- **Undo/Redo**: 50-step history
- **Zoom & Pan**: Mouse wheel zoom, right-click drag to pan
- **Grid & Snap**: Toggleable grid with snap-to-grid
- **Context Menu**: Right-click for duplicate, delete, reorder, and lock/unlock
- **Persistence**: Auto-saved to `localStorage` (survives page reload); legacy `diagramflow-*` keys migrated automatically
- **Keyboard Shortcuts**: Full tool switching and editing shortcuts
- **Accessibility**: Focus-visible outlines, skip-to-content link, aria-live action log, canvas aria-label, 44×44px touch targets, 16px minimum font sizes, WCAG AA contrast

## Getting Started

No server or build step required — just open the file in a browser:

```
open index.html
```

Or visit the [About page](about.html) for documentation and launch links.

## Usage

### Drawing Shapes

1. Click a shape button in the toolbar (rectangle, rounded, circle, diamond, triangle, or terminator)
2. Click anywhere on the canvas to place it
3. Press `Escape` to cancel placement

### Drawing Connections

1. Select the **Line** tool (`L`)
2. Click and drag on empty canvas to draw a line between two points
3. Lines snap to nearby shape edges automatically (16px threshold at 100% zoom)
4. Click near an existing line to select it, then style it via the properties panel
5. Drag connection endpoints to reattach them to different shapes

### Custom SVG Shapes

Create custom shapes by pasting SVG code:

1. Click the **Custom Shape** button (the last button in the toolbar)
2. Click on the canvas to create the shape
3. Select the shape and open the **Properties panel**
4. Paste your SVG code into the **Custom SVG** textarea
5. Adjust the **ViewBox Width** and **ViewBox Height** to match your SVG's coordinate space

**Custom Shape Properties Panel:**
- **ViewBox Width**: Sets the viewBox width for your SVG content (default: 100)
- **ViewBox Height**: Sets the viewBox height for your SVG content (default: 100)
- **Custom SVG**: Textarea for pasting SVG code (inner elements, no wrapper needed)

**Tips:**
- If your SVG has a wrapping `<svg viewBox="0 0 100 100">` tag, the app auto-detects the viewBox
- For bare SVG elements (no wrapper), the app defaults to a 100×100 coordinate space
- Your SVG content should span the full viewBox (0 to width, 0 to height) to fill the shape edge-to-edge
- The shape stretches your SVG to fill its dimensions while maintaining the viewBox coordinate mapping
- Example: For a cylinder SVG with coordinates 0–100, set ViewBox Width=100 and ViewBox Height=100

### Adding Text

1. Select the **Text** tool (`T`)
2. Click on the canvas to create a text label
3. Type your text and click away (or press `Escape`) to commit

### Editing Shapes

- **Select**: Click a shape, or use the Select tool (`V`)
- **Move**: Drag a selected shape
- **Resize**: Drag the handles on a selected shape
- **Edit text**: Select a shape and press `Enter`, or change the text field in the properties panel
- **Delete**: Select and press `Delete`/`Backspace`, or use the context menu
- **Duplicate**: Press `Ctrl/Cmd+D`, or use the context menu
- **Reorder**: Bring to Front / Send to Back via the context menu
- **Lock**: Lock/Unlock via the context menu (locked shapes can't be moved or resized)

### Styling

- **Toolbar controls** apply to the currently selected shape(s) in real time, and set defaults for new shapes
- **Properties panel** shows detailed controls for the selected shape or connection

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `T` | Text tool |
| `G` | Toggle grid |
| `S` | Toggle snap-to-grid |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+D` | Duplicate selected |
| `Delete`/`Backspace` | Delete selected |
| `Enter` | Edit text of selected shape |
| `Escape` | Deselect / cancel |
| `+` / `-` | Zoom in / out |
| Right-click drag | Pan |

## File Structure

```
diagram/
├── index.html                 # Main application HTML
├── about.html                 # About page with documentation
├── styles.css                 # All styles (ecosystem dark/light theme)
├── app.js                     # Application logic (state, rendering, events)
├── STYLE_GUIDE.md             # Project style guide (v1.1)
├── STYLE_GUIDE_RECONCILIATION.md  # Compliance reconciliation (all items resolved)
├── REVIEW.md                  # Technical review and maintenance plan
├── README.md                  # This file
├── vendor/                    # Vendored dependencies
│   ├── html2canvas.min.js
│   └── jspdf.umd.min.js
```

## Technical Details

- **Version**: 1.1.3
- **Framework**: Vanilla JavaScript (ES5-compatible), no dependencies
- **Rendering**: DOM-based shapes with inline SVG; connections rendered as SVG paths
- **Custom SVG**: Supports pasting SVG code with auto-detected viewBox or manual viewBox controls
- **Line Snapping**: Lines snap to nearby shape edges within 16px (at 100% zoom)
- **State**: Centralized `S` state object with undo/redo stacks (50 steps)
- **Theme**: Free Open Tools ecosystem dark/light scheme with toggle; cross-tab sync
- **CSS Tokens**: Ecosystem spacing (`--space-*`), radius (`--radius-*`), and shadow (`--shadow-*`) tokens throughout
- **Icons**: All tool icons normalized to 24×24 viewBox with `stroke="currentColor"` and `stroke-width="2"`
- **Accessibility**: Skip-to-content link, `:focus-visible` outlines, `aria-live` action log, canvas `aria-label`, 44×44px touch targets, 16px minimum body font
- **Canvas**: Effectively unbounded; grid layer is 10,000 × 10,000 px
- **Persistence**: JSON serialized to `localStorage` (key: `diagram-state`) on every state change; legacy `diagramflow-*` keys migrated on load
- **Dependencies**: `html2canvas` and `jspdf` vendored locally in `vendor/` for export (PNG, JPG, PDF)

## Version History

### v1.1.3 (2026-09-08)
- **Right-click deferred pan**: Pan canvas by right-click and drag; context menu appears immediately on right-click and hides when pan starts
- **Refactored context menu**: Extracted hit-testing logic into shared `showContextMenuAt(x, y)` function for reuse
- **Keyboard context menu**: Added Shift+F10 / Menu key support for context menu
- **Documentation**: Updated pan interaction docs to reflect right-click behavior

### v1.1.2
- Updated documentation

### v1.1.1
- Maintenance release

### v1.1.0
- Custom SVG shape support with auto-detected viewBox
- Connection styling (color, width, arrows)
- Font size control per shape
- Undo/Redo with 50-step history
- Lock/unlock shapes via context menu

### v1.0.0
- Initial release: rectangle, rounded rectangle, circle, diamond, triangle, terminator shapes
- Line and arrow connections with smart snapping
- Text labels, grid, snap-to-grid
- Auto-save to localStorage

## Browser Support

Works in all modern browsers (Chrome/Edge, Firefox, Safari).

## License

Private project.
# diagram
