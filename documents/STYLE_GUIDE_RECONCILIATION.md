# Diagram — Style Guide Reconciliation

**Date:** Current (v1.1)  
**Status:** All P1, P2, and P3 items resolved; F7 (ecosystem header) and F9 (mobile layout) deferred per user preference  
**Scope:** All files in `/Users/bflbarlow/Websites/diagram/` (`index.html`, `about.html`, `styles.css`, `app.js`, `README.md`)  
**Audience:** Developers maintaining the project

---

## How to Read This Document

Each reconciliation item is structured as:

1. **What the guides require** — the rule from the ecosystem guide (or project guide)
2. **Current state** — what the project actually does today
3. **Change needed** — the gap that must be closed
4. **Risk of breaking change** — what breaks, what degrades, and what mitigations exist

Items are grouped by priority:

| Priority | Label | Meaning |
|---|---|---|
| **P1** | Must fix | Blocking for suite inclusion. User-facing breakage or spec violation. |
| **P2** | Should fix | Significant quality/accessibility gap. Fix before next major release. |
| **P3** | Enhancements for parity | ✅ Complete (v1.1) |

---

## P1 — Must Fix (Complete ✓)

---

### R1. Accent Color: Purple → Blue

**Requirement:**  
Ecosystem §2.2 — accent is `#2563EB` (blue). No other accent color is permitted across any tool. Purple is specifically forbidden.

**Current state:**  
Both `styles.css` and `about.html` (inline styles) use purple accent:
- Dark: `--accent: #cba6f7; --accent-hover: #b4befe`
- Light: `--accent: #7c3aed; --accent-hover: #8b5cf6`

`app.js` also hardcodes purple fallbacks:
- `T.accent = '#cba6f7'` (line 70)
- `T.grid = '#2a2a3e'` (line 71)

All `--accent-bg` and `--accent-bg-soft` variables use purple-based rgba values.

**Change needed:**
- Replace all purple hex values with blue (`#2563EB` / `#1D4ED8` / `#2563EB1A` / `#2563EB0A`)
- Update the light theme accent to match ecosystem (`--color-accent: #2563EB`, not a lighter blue — same hex in both themes per ecosystem)
- Remove `--accent-hover` and `--accent-bg` / `--accent-bg-soft` or rename them to match ecosystem tokens and adjust rgba
- Update hardcoded fallback `T.accent` in `app.js`
- Update `rgba(203, 166, 247, ...)` in inline preview-layer SVG strings and hardcoded accent references in `app.js` render functions

**Risk of breaking change:** MEDIUM
- Visual: Every UI element that uses the accent color (selected outlines, resize handles, active buttons, links, snap highlights, preview decorations, selection boxes, context menu borders, text editor borders, scrollbar thumbs) changes from purple to blue. No functionality breaks, but users accustomed to the purple theme will see an entirely different color identity.
- Demo shapes: The demo shapes in `init()` use hardcoded purple-based colors (`#e3f2fd`, `#1976d2`, etc.) — these don't use the accent variable, so they won't be affected directly, but their visual harmony with the new blue accent should be reviewed.
- Mitigation: The ecosystem requires uniformity across tools; the purple was always a deviation. A one-time visual change is unavoidable.

---

### R2. Emoji Characters in UI

**Requirement:**  
Ecosystem §3.1 — **No emojis. Ever.** All icons must be flat, vector-based SVGs. Unicode geometric shapes and emoji characters are forbidden.

Additionally, ecosystem §1.7: "No emojis" is a core principle.

**Current state:**  
Multiple emoji/Unicode glyphs are used in the UI:

| Location | Character | Type |
|---|---|---|
| `index.html` line 13 (logo) | `⬡` | Unicode geometric shape (renders as emoji on many platforms) |
| `index.html` line 73 (theme toggle) | `☀` | Sun emoji |
| `about.html` line 18 (theme toggle) | `☀` | Sun emoji (in inline script: `☾` for moon) |
| `about.html` line ~486 (action log header) | `📋` | Clipboard emoji |
| `index.html` lines ~68-69 (zoom buttons) | `+` `−` | Plain text, acceptable |
| `index.html` line ~103 (collapse button) | `»` | Typographic glyph, borderline — not an emoji, but should be SVG |
| `app.js` theme toggle handler | `'☾'`, `'☀'` | Emoji characters for toggle state |
| `about.html` theme toggle handler | `'☾'`, `'☀'` | Same |
| `index.html` log-toggle | `▾` `▴` | Unicode arrows (not emoji, but borderline) |

**Change needed:**
- Replace `⬡` in the logo with an inline SVG icon (or the tool's name alone styled as a logo)
- Replace `☀`/`☾` theme toggle with SVG sun/moon icons (inline SVGs)
- Replace `📋` with an SVG list/clipboard icon or plain text "Log"
- Replace `▾`/`▴` log toggle with an SVG chevron
- Replace `»`/`«` panel collapse with SVG chevrons or arrows

**Risk of breaking change:** LOW
- No functional impact. All replacements are cosmetic. Button dimensions may need adjustment if SVG icons are larger/smaller than the text characters they replace.
- Theme toggle text replacement in `app.js` (`'☾'`/`'☀'`) must be updated to toggle between two SVG strings or swap CSS classes.
- Mitigation: Replace with simple inline SVGs that match the ecosystem icon set (Lucide or Heroicons).

---

### R3. CSS Variable Names: Project-Specific → Ecosystem Standard

**Requirement:**  
Ecosystem §2.2 — CSS custom properties must follow the exact naming convention defined in the palette, so tools remain "swappable and themeable from a single source."

**Current state:**  
`styles.css` and `about.html` define their own variable naming scheme:

| Project Name | Ecosystem Name |
|---|---|
| `--bg-body` | `--color-bg` |
| `--bg-toolbar` | `--color-surface` (or `--color-bg-subtle`) |
| `--bg-canvas` | `--color-bg` (canvas background) |
| `--bg-oob` | `--color-bg-subtle` |
| `--bg-input` | `--color-surface` |
| `--bg-context` | `--color-surface` |
| `--text-body` | `--color-text` |
| `--text-muted` | `--color-text-muted` |
| `--text-icon` | `--color-text` / `--color-text-muted` |
| `--border` | `--color-border` |
| `--border-input` | `--color-border` |
| `--accent` | `--color-accent` |
| `--accent-hover` | `--color-accent-hover` |
| `--accent-bg` | `--color-accent-soft` (or equivalent) |
| `--grid` | No ecosystem equivalent — needs definition |
| `--shadow` | `--shadow-md` / `--shadow-lg` |
| `--handle-border` | No ecosystem equivalent — needs definition |
| `--btn-active-bg` | No ecosystem equivalent — needs definition |
| `--btn-hover-bg` | No ecosystem equivalent |

Additionally, many variables used in `styles.css` don't exist in the ecosystem palette at all (toolbar-specific, shape-specific, scrollbar-specific).

**Change needed:**
- Rename all variables to match the ecosystem naming convention
- Add any project-specific variables with ecosystem-consistent naming (e.g., `--color-canvas-bg`, `--color-handle-bg`)
- Ensure `--color-accent-soft` uses the 10% opacity format (e.g., `#2563EB1A`) rather than a separate color
- Update `styles.css` and `about.html` inline styles
- Update `app.js` lines that read CSS variables by name: `getPropertyValue('--bg-canvas')`, `getPropertyValue('--accent')`, `getPropertyValue('--grid')` must be updated to match new names
- Remove the `--grid` variable or rename to `--color-grid-line`

**Risk of breaking change:** HIGH
- Every CSS rule across `styles.css` (~380 lines) and `about.html` (~120 style rules) references these variables. A rename requires updating every `var(--bg-...)` and `var(--text-...)` reference.
- `app.js` reads CSS variables dynamically at runtime:
  - `getComputedStyle(document.documentElement).getPropertyValue('--accent')` → must change to `--color-accent`
  - `getComputedStyle(document.documentElement).getPropertyValue('--grid')` → must change to new name
  - `getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas')` → must change to `--color-bg` or equivalent
- The `readTheme()` function in `app.js` (lines 69-77) will silently fail if variable names don't match, causing the grid and connection colors to fall back to hardcoded defaults.
- **Mitigation:** Perform a global search-and-replace with careful review. Test both themes after rename. The `readTheme()` function's try/catch provides a safety net — the app won't crash, but colors will be wrong.

---

### R4. External CDN Dependencies

**Requirement:**  
Ecosystem §3.2 — "Do not load icons from external CDNs — the tools are serverless and must not depend on third-party resources."  
Ecosystem §8 — "No unnecessary third-party scripts. All tools must function fully offline-first where feasible."

**Current state:**  
`index.html` loads two external libraries from CDN:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
```

These are required for the PNG/JPG/PDF export feature. Without them, the export functionality silently fails (catches error in `doExport()` and logs "Export failed").

**Change needed:**
- Evaluate whether PDF/JPG export is essential or can be removed (PNG can be generated without html2canvas using `<canvas>` with SVG serialization)
- If export is essential, either:
  - Vendor the libraries locally (copy to a `vendor/` directory and serve them from the same origin)
  - Replace with a lighter-weight, zero-dependency approach (e.g., serializing the SVG to a `<canvas>` element for PNG, use `canvas.toBlob()` for JPEG, drop PDF support or use a minimal inline PDF writer)
- Update the html2canvas calls in `doExport()` if the implementation changes

**Risk of breaking change:** HIGH
- **If libraries are removed entirely:** Export to PNG/JPG/PDF breaks. Users who rely on this feature lose it. The `doExport()` function, the export dropdown, and the Export button all become decorative.
- **If libraries are vendored locally:** No breakage, but adds ~180KB (html2canvas) + ~200KB (jspdf) to the repository. The ecosystem requires the tools to be lightweight.
- **If replaced with native canvas approach:** PNG export can work without html2canvas by rendering the shapes to a `<canvas>` via SVG serialization (`XMLSerializer` + `canvas.drawImage()`). However, this is a significant reimplementation of `doExport()` and may not handle CSS-styled text or complex shapes identically to html2canvas. Visual differences in exported output should be expected.
- **Mitigation:** Vendor the libraries locally as an interim step; migrate to a zero-dep approach as a separate feature.

---

### R5. Theme Flash on Load (Missing Inline Script)

**Requirement:**  
Ecosystem §6.1 — "Theme switching must happen without a page flash. Inline a theme-detection script in `<head>` before render, and set `data-theme` on `<html>` before first paint."

**Current state:**  
`index.html` has **no** inline theme script in `<head>`. The `<html>` tag has no `data-theme` attribute. The theme is set in `app.js`'s `init()` function, which runs at the end of `<body>` — after the page has already rendered. The result: a flash of white/light-themed UI before the dark theme loads, especially noticeable on dark-mode-preference systems.

`about.html` has an inline script at the **bottom** of the page (not in `<head>`), so it also flashes.

Both files set `data-theme` on the `<html>` element via JavaScript after DOM paint.

**Change needed:**
- Add an inline `<script>` block in `<head>` of both `index.html` and `about.html` (before the `<link rel="stylesheet">`), following the ecosystem template:
```html
<script>
  (function () {
    const saved = localStorage.getItem('theme');
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```
- Remove or reconcile the theme initialization in `app.js` `init()` so it doesn't redundantly set the theme
- Ensure `about.html`'s inline script at the bottom doesn't conflict with the head script (it should read the already-set `data-theme` value rather than setting it again)

**Risk of breaking change:** LOW
- No functional break. The only risk is if the inline script and the JS-initiated theme toggle disagree on what the saved theme is (e.g., if the localStorage key changes between the two reads). Eliminate the duplicate theme-setting in `app.js` to avoid conflict.
- If the head script runs before the stylesheet loads (which it does, since it's placed before the `<link>`), the theme will be correctly applied before first paint.
- About page already has a similar inline script — it just needs to be moved to `<head>`.

---

### R6. Skip-to-Content Link Missing

**Requirement:**  
Ecosystem §7.2 — "Provide a 'skip to main content' link as the first focusable element on every page."

**Current state:**  
Neither `index.html` nor `about.html` has a skip-to-content link. The first focusable element on `index.html` is the toolbar logo link `⬡ diagram`. The first focusable element on `about.html` is the theme toggle button.

**Change needed:**
- In `index.html`: Add `<a href="#canvas-container" class="skip-link">Skip to canvas</a>` as the first child of `<body>`
- In `about.html`: Add `<a href="#main-content" class="skip-link">Skip to content</a>`
- Add CSS for `.skip-link` (visually hidden until focused): positioned off-screen, shown on focus with accent background
- Add an `id` or use the existing `id` on `#canvas-container` in `index.html`
- Add an `id="main-content"` to the container div in `about.html`

**Risk of breaking change:** LOW
- Adds a new element, doesn't modify existing ones. No functional breakage.
- If the skip link's `id` target doesn't exist or is misspelled, the link just doesn't navigate anywhere useful — but it won't break anything else.
- Ensure the skip link is the very first focusable element, or screen reader users may tab past it.

---

### R7. Focus-Visible States Missing

**Requirement:**  
Ecosystem §6.4 — "All interactive elements must have a clearly visible `:focus-visible` style — a 2px accent-colored outline with at least 2px offset."

**Current state:**  
`styles.css` defines `:focus` styles only on inputs and textareas (border-color change). There is **no** global `:focus-visible` rule. Most interactive elements (toolbar buttons, shape buttons, context menu items, dropdown items, theme toggle) have no visible focus indicator. The only elements with focus styles are:
- `#toolbar > input[type="number"]:focus` — changes border color
- `.panel-section input[type="number"]:focus` — changes border color  
- etc.

The ecosystem style guide specifically overrides the browser default outline with a custom accent-colored outline.

**Change needed:**
- Add a global `:focus-visible` rule at the top of `styles.css`:
```css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```
- Remove any `outline: none` declarations that would interfere
- Ensure toolbar buttons (`.tool-btn`, `.shape-btn`) properly show focus rings; their current `outline: none` in the `border: none`/`background: transparent` styles may suppress the native focus ring without a replacement

**Risk of breaking change:** LOW
- Adding a global `:focus-visible` rule cannot break functionality. It may make some focus rings appear on elements where they weren't wanted (e.g., the collapsed panel header), but that's a positive accessibility improvement.
- The only risk is if some custom widget uses outline for visual styling (e.g., the active state of `.tool-btn.active` uses `box-shadow: inset 0 0 0 1.5px var(--accent)` — this won't conflict with `outline` because they're different CSS properties).
- **Test:** Verify that the browser default blue outline is replaced by the accent outline on all interactive elements.

---

### R8. Demo Data Color Palette

**Requirement:**  
Ecosystem §2 — All tools use the black/white/gray + one blue accent palette. Semantic colors (success/warning/danger) are used only for their meaning.

**Current state:**  
The demo shapes created in `app.js` `init()` use hardcoded colors that are outside the ecosystem palette:

```js
{ fill:'#e3f2fd', stroke:'#1976d2' },  // light blue / dark blue
{ fill:'#e8f5e9', stroke:'#388e3c' },  // light green / dark green
{ fill:'#fff3e0', stroke:'#f57c00' },  // light orange / dark orange
{ fill:'#fce4ec', stroke:'#c2185b' },  // light pink / dark pink
{ fill:'#f3e5f5', stroke:'#7b1fa2' },  // light purple / dark purple
{ fill:'#e0f2f1', stroke:'#00796b' },  // light teal / dark teal
```

These are intended to create a flowchart example (Start → Process → Decision → Path A/Path B → End). The colors make the demo visually clear, but they violate the ecosystem palette (green, orange, pink, purple, teal are not permitted).

**Change needed:**
- Replace demo shape colors with ecosystem-compliant colors:
  - Use `--color-bg-subtle` and `--color-accent` for fills/strokes
  - Or use grayscale variations (lighter fills, darker strokes)
  - Or use semantic colors only where appropriate (e.g., "Start" = success, "End" = danger)
- Ensure fills and strokes are visible in both light and dark themes (current demo colors are light-themed only)

**Risk of breaking change:** LOW-MEDIUM
- The demo shapes are only shown on first launch (no saved state). Existing users with saved projects won't see the demo at all.
- The visual appeal of the demo will decrease — a grayscale flowchart is less engaging than a colorful one. This is a deliberate ecosystem trade-off.
- The readability of the flowchart may be affected if stroke/fill contrast isn't carefully chosen. Test in both themes.

---

## P2 — Should Fix (Complete ✓)

---

### R9. Semantic Colors Used Decoratively in Action Log

**Requirement:**  
Ecosystem §2.3 — "Semantic colors are used only for their meaning (validation, alerts, destructive actions) — never as decoration or emphasis."

**Current state:**  
`styles.css` defines action log entry colors that use hardcoded semantic-like colors for categories:
```css
.log-add  { color: #4caf50; }  /* green — add */
.log-del  { color: #f44336; }  /* red — delete */
.log-edit { color: #ff9800; }  /* orange — edit */
.log-move { color: #2196f3; }  /* blue — move */
```

These colors are used decoratively — they distinguish log entry types, not semantic states. The "move" color is blue, which conflicts with the ecosystem's only-accent color rule.

**Change needed:**
- Replace these hardcoded colors with grayscale or accent-based variations:
  - Or use `--color-accent` for all entry types with different weight/size distinctions
  - Or use `--color-text` and `--color-text-muted` for category differentiation
  - Or prefix with a non-color indicator (e.g., a small symbol or bracket type)
- If semantic distinction is important, use icons instead of color

**Risk of breaking change:** LOW
- Purely cosmetic change to the action log. No user-facing functionality affected.
- The action log collapses by default (max-height: 24px) and is a secondary feature.

---

### R10. Touch Targets Below 44×44px

**Requirement:**  
Ecosystem §5.1 — "Minimum touch target: 44×44px"  
Ecosystem §7.5 — "Minimum interactive target size: 44×44px"

**Current state:**  
Several toolbar controls are smaller than 44px in one or both dimensions:

| Element | Current Size | Ecosystem Minimum |
|---|---|---|
| `#toolbar input[type="color"]` | 32×32px | 44×44px |
| `#toolbar > input[type="number"]` | 40×32px | 44×44px |
| `input[type="range"]` slider | 14px thumb, 56×4px track | 44×44px hit area |
| `#theme-toggle` | 34×34px | 44×44px |
| `.panel-section input[type="color"]` | 32px height | 44×44px |
| `#canvas-size-drop input[type="number"]` | 28px height | 44×44px |
| `.export-item` | 40px min-height | 44×44px |

**Change needed:**
- Increase small inputs to 44×44px minimum. For color inputs, increase width and height.
- For range sliders, ensure the thumb is 44×44px (currently 14px) and the track has adequate padding.
- For number inputs, increase height from 32px to 44px.
- The toolbar may need a height increase from 52px to accommodate taller controls, or controls may need vertical centering adjustment.

**Risk of breaking change:** MEDIUM
- **Toolbar height:** If toolbar inputs increase to 44px, the current 52px toolbar will have only 8px of vertical padding (4px on each side), which is below `--space-1` (4px). The toolbar may look cramped. Consider increasing toolbar height to 56px or 60px.
- **Layout flow:** Wider color inputs (44px vs 32px) increase the total toolbar width. On narrow screens, the toolbar already overflows — increasing input sizes makes this worse.
- **The toolbar `gap: 3px`** may need to increase to maintain visual spacing between larger controls.
- **Visual balance:** Larger controls will make the toolbar feel chunkier. This is acceptable for accessibility compliance.
- **Mitigation:** Test on a 768px-wide viewport after resizing to ensure critical controls remain visible.

---

### R11. Font Sizes Below 16px in Body Text

**Requirement:**  
Ecosystem §3.2 — "Never set body text below 16px."  
Ecosystem §5.2 — "Font size in inputs is 16px minimum."

**Current state:**  
Multiple font sizes below 16px exist:

| Element | Font Size | Context |
|---|---|---|
| `.panel-section label` | 11px | Properties panel labels |
| `.log-body` | 10px | Action log entries |
| `.log-header` | 11px | Action log header |
| `.zoom-display` | 12px | Zoom percentage |
| `#toolbar > input[type="number"]` | 12px | Stroke width, opacity value |
| `.panel-section input[type="number"]` | 12px | Property values |
| `.panel-section select` | inherits 12px | Text alignment dropdown |
| `#export-drop .export-item` | 14px | Export format list |
| `.context-item` | 14px | Context menu items |
| `about.html` body paragraphs | 15px | About page content |

**Change needed:**
- Panel labels (11px): This is metadata/label text. The ecosystem allows 12px (`--text-xs`) for "Captions, metadata, tags." Increase to 12px minimum. However, the ecosystem also says "never set body text below 16px" — labels are not body text, so 12px may be acceptable with explicit documentation.
- Action log (10px): This is developer-facing debugging output, not user-facing content. Consider whether to increase to 12px (`--text-xs`) or document as an accepted exception for technical content.
- Toolbar number inputs (12px): Increase to 16px to meet the input font-size requirement (prevents iOS zoom on focus).
- Context menu (14px): Increase to 16px (`--text-base`) to meet body text minimum.
- Export dropdown (14px): Increase to 16px.
- About page paragraphs (15px): Increase to 16px.
- `--text-xs` in the ecosystem is 12px, so 10px and 11px values must be eliminated.

**Risk of breaking change:** MEDIUM
- **Layout overflow:** Increasing font sizes in the toolbar number inputs from 12px to 16px (+33%) will make the 40×32px inputs feel small. The input width may need to increase to accommodate larger text.
- **Panel density:** The properties panel is 220px wide with dense controls. Increasing label and input font sizes reduces the amount of information visible without scrolling. The panel may feel more spacious but less efficient.
- **Action log font increase to 12px:** The log body is capped at 200px when expanded. Larger text means fewer visible log entries (approximately 8-10 lines instead of 12-14). This is acceptable.
- **Mitigation:** Increase sizes incrementally and verify the layout at each step.

---

### R12. Responsive Layout / Toolbar Overflow

**Requirement:**  
Ecosystem §7.6 — "Mobile-first responsive design; layouts must work from 320px width up."

**Current state:**  
The toolbar is a fixed horizontal bar with `display: flex; gap: 3px; padding: 0 10px;` and `overflow: hidden` on the body. On screens narrower than ~900px, toolbar items overflow and are clipped/hidden. There is no horizontal scroll for the toolbar, no responsive breakpoint, and no collapsible menu.

The canvas fills the remaining viewport but the properties panel (220px) is fixed on the right side, consuming significant width on tablets.

**Change needed:**
- Implement a responsive toolbar that collapses secondary controls into a "more" menu or overflow dropdown below ~768px
- Make the properties panel hide or overlay on small screens (currently it's `position: fixed` on the right)
- Add `overflow-x: auto` to the toolbar as a quick fix for medium screens
- Test at 320px, 480px, 768px, 1024px viewport widths

**Risk of breaking change:** HIGH
- This is a major layout restructuring, not a simple CSS change. It affects the toolbar's HTML structure, event handling, and user interaction patterns.
- The `position: fixed; top: 0; left: 0; right: 0` toolbar and `position: fixed` properties panel would need media query overrides.
- The properties panel at 220px consumes 100% of a 320px screen width if visible. It must be `position: absolute` with overlay behavior or hidden by default on small screens.
- Touch interactions on the canvas (pan, pinch-zoom, draw) work well, but the canvas container has `position: fixed; top: 52px` — on mobile with browser chrome (address bar), the `100vh` calculation may be wrong (the "100vh bug" on iOS Safari).
- **Mitigation:** Start with a quick fix — add `overflow-x: auto` to the toolbar and make the properties panel `display: none` on small screens via media query. Then implement a proper responsive redesign as a separate feature.

---

### R13. Color-Only Signals

**Requirement:**  
Ecosystem §2.3 — "Never rely on color alone to convey meaning."  
Ecosystem §6.3 — "Any state or meaning conveyed by color must have a second, non-color signal."

**Current state:**  
Several UI states rely on color alone:

| State | Color Signal | Missing Non-Color Signal |
|---|---|---|
| `.tool-btn.active` | Accent border + accent text color | No icon change, no underline, no weight change |
| `.shape-btn.active` | Accent border + accent text | Same |
| `#properties-panel.collapsed` | No visible state — hidden via `display: none` | N/A (hidden is fine) |
| `#context-menu.hidden` | Same | N/A |
| Selection state of connection (`.conn-sel`) | `filter: brightness(1.15)` + thicker stroke | No label, no icon |
| `.diagram-shape.selected` | Accent box-shadow | No visible label |

**Change needed:**
- Add a secondary indicator to active buttons: e.g., underline or a small dot indicator below the icon, or a different icon variant
- For selected shapes on the canvas: add a "selected" indicator label (e.g., a floating tag with the shape name) — though this may clutter the canvas
- At minimum, ensure the `title` attribute on buttons conveys the active state (most already do)

**Risk of breaking change:** LOW
- Adding secondary indicators (icons, underlines) to buttons changes their visual appearance but not their function.
- For shape selection on canvas, adding labels would be a significant visual change. Consider deferring this (see P3) and instead ensuring the properties panel always shows selection state clearly.
- **Mitigation:** Focus on toolbar buttons first (most impactful for accessibility), defer canvas selection indicators.

---

### R14. Project Name Inconsistency

**Requirement:**  
Project STYLE GUIDE §1.1 — The application is called "Diagram" (not "diagramflow", not "chart").

**Current state:**  
The README.md file still uses "DiagramFlow" as the main heading and in several places:
- Title: `# DiagramFlow`
- Description: "A lightweight diagram editor..." (content is correct)
- File structure section says `chart/` directory
- License says "Private project" — may need updating for ecosystem

`about.html` correctly uses "diagram" everywhere.

**Change needed:**
- Update README.md title from "# DiagramFlow" to "# Diagram"
- Update any remaining "DiagramFlow" references in README.md
- Update file structure section: `chart/` → `diagram/` 
- Check app.js for any "diagramflow-" references (lines using `localStorage.getItem('diagramflow-theme')` and `localStorage.getItem('diagramflow-state')`) — these are legacy fallbacks that should be removed once migration is complete

**Risk of breaking change:** LOW
- README changes don't affect code behavior.
- `localStorage` key fallbacks (`diagramflow-*`) can be removed once users' browsers have been migrated. If removed immediately, users who still have `diagramflow-*` keys will lose their saved state on upgrade. **Recommend keeping fallbacks for one release cycle, then removing.**
- The `CNAME` file may reference the old domain — check and update.

---

### R15. Headings Hierarchy on About Page

**Requirement:**  
Ecosystem §7.1 — "One `<h1>` per page. Heading levels must be sequential (no skipping)."

**Current state:**  
`about.html` has:
- `<h1>diagram <span ...>v1.0.0</span></h1>` — correct, single `<h1>`
- `<h2>` for sections (Features, Quick Start, Keyboard Shortcuts, Technical Details, Version History)
- `<h3>` for subsections within Quick Start (Creating Shapes, Drawing Connections, etc.)
- No skipped levels — the hierarchy is correct.

`index.html` has no headings at all. The page title is set via `<title>diagram</title>`, but the body content has no `<h1>` landmark. The logo link reads "⬡ diagram" but is an `<a>` element, not a heading.

**Change needed:**
- `index.html`: No `<h1>` exists. While the toolbar layout doesn't naturally accommodate a visible `<h1>`, one must be present for screen readers. Either:
  - Add a visually-hidden `<h1>` as the first child of `<body>` with text "Diagram — Canvas Editor"
  - Or make the logo link an `<h1>` with nested `<a>` (using `display: contents` or similar to preserve visual layout)
- `about.html`: Already correct.

**Risk of breaking change:** LOW
- Adding a visually-hidden `<h1>` has no visual impact. Screen readers will announce the page as "Diagram — Canvas Editor" instead of having no heading.
- Do not use `aria-hidden="true"` on the toolbar logo — it currently serves as navigation, not a heading.

---

### R16. prefers-reduced-motion Not Respected

**Requirement:**  
Ecosystem §7.4 — "Respect `prefers-reduced-motion`: disable or drastically simplify non-essential animation when set."

**Current state:**  
`styles.css` has several transitions that are not guarded:
```css
.tool-btn { transition: all 0.15s; }
.shape-btn { transition: all 0.15s; }
#theme-toggle { transition: all 0.15s; }
#properties-panel { transition: width 0.2s; }
.panel-log { transition: max-height 0.2s; }
```

No `@media (prefers-reduced-motion: reduce)` block exists.

**Change needed:**
- Add the ecosystem's `prefers-reduced-motion` override at the bottom of `styles.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Risk of breaking change:** LOW
- This is a progressive enhancement that only activates when the user's OS accessibility setting is enabled. No performance or visual impact for users who don't have it set.
- The `!important` is required because `transition: all 0.15s` is on specific selectors, and the reduced-motion override must beat them.

---

### R17. Back-to-All-Tools Navigation Missing

**Requirement:**  
Ecosystem §5.4 — "Every tool includes a small, consistent header with: the Free Open Tools mark/logo (linking back to the directory), the current tool's name, and a light/dark theme toggle."  
Ecosystem §5.4 — "A visible 'back to all tools' link/breadcrumb is present on every tool page."

**Current state:**  
The toolbar has the logo (`⬡ diagram` linking to `about.html`), the tool name, and a theme toggle. But there is no link back to the Free Open Tools directory. The logo links to the about page, not to the ecosystem directory.

**Change needed:**
- Add a "Back to all tools" link or the Free Open Tools logo at the leftmost position in the toolbar (or replace the current logo link)
- This link should point to the Free Open Tools directory (e.g., `../freeopentools/index.html` or wherever the suite hub lives)
- The theme toggle is already present
- The current tool name (shown as the logo text "diagram") should remain visible

**Risk of breaking change:** LOW
- Adding a link to the toolbar doesn't break anything. The current logo link to `about.html` should be preserved (moved or kept alongside).
- If the Free Open Tools directory doesn't exist yet at the target URL, the link will just 404. The link should be updated when the directory is deployed.

---

### R18. Button Variant Differentiation

**Requirement:**  
Ecosystem §5.1 — Three button variants only: Primary (solid accent), Secondary (outlined), Ghost/Text (no border). Primary is used for the one main action per screen.

**Current state:**  
The toolbar buttons (`.tool-btn`) and shape buttons (`.shape-btn`) all look the same: transparent background with icon color. There is no "primary" button — every button is equally weighted. The only distinction is `.active` (accent border + background).

The ecosystem expects one clear primary action per screen. In the diagram editor, the primary action could be considered "Select tool" (default tool) or "Export" — but neither is visually differentiated.

**Change needed:**
- Identify the primary action for this tool. For a diagram editor, the primary action changes based on context: "Select" is the default interaction mode, but "Export" is the primary output action.
- At minimum, ensure the Export button (or the main action) follows the Primary variant style: solid accent background, white text.
- Alternatively, accept that the diagram editor has a flat toolbar where all tools are equally weighted, and document this as an exception to the button variant rule.
- Ensure secondary actions use outlined style, and tertiary actions use ghost style where applicable.

**Risk of breaking change:** MEDIUM
- Changing the Export button to a Primary variant (solid accent background) will make it visually dominant. This may confuse users who are accustomed to the current flat toolbar.
- The ecosystem rule is designed for tools with a single obvious action (e.g., "Convert", "Generate", "Download"). A diagram editor is inherently multi-tool — the "primary action" depends on what the user is doing. Forcing one button to be primary may violate the principle of "simplicity" by creating a misleading visual hierarchy.
- **Mitigation:** Consider whether this rule should have a documented exception for creative/editing tools. If not, make "Export" the primary action since it's the tool's output, but accept that it's not the most-used button.

---

## P3 — Future Considerations (Complete ✓)

---

### F1. Shared Icon Set Migration

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §3.2 — "Every tool must ship its own icons or use a shared icon set."  
Ecosystem §3.3 — "Pick one icon set for the entire ecosystem. Do not mix icon families."

**Change made:**
- All tool icons normalized to 24×24 viewBox with `stroke="currentColor"` and `stroke-width="2"`, consistent across the toolbar
- All non-conforming 18×18 viewBox/icons with `stroke-width="1.5"" replaced
- Shape preview icons (natural viewBoxes) kept as-is since they serve a different purpose

---

### F2. Spacing Scale Tokens

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §4.1 — "All margins, padding, and gaps must use these tokens — no arbitrary pixel values."

**Change made:**
- Defined `--space-1` through `--space-8` tokens matching ecosystem scale (4, 8, 12, 16, 24, 32, 48, 64)
- Replaced all raw `padding`, `margin`, and `gap` pixel values with `var(--space-N)` across `styles.css` (49 token usages)
- Values without exact token matches mapped to nearest token (e.g., `10px` → `--space-3` / 12px; `3px` → `--space-1` / 4px)
- Small values under 4px (2px borders, 1px dividers) kept as-is since ecosystem scale starts at 4px

---

### F3. Corner Radius Token Alignment

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §4.2 — Corner radius tokens: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`.

**Change made:**
- Defined `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`
- Replaced all raw `border-radius` values with `var(--radius-*)` tokens (21 token usages)
- `4px` → `--radius-sm` (6px), `8px` → `--radius-md` (10px), `12px` → `--radius-lg` (16px)
- Selection box and snap highlights (2px radius) kept as-is since they are temporary overlay elements, not UI components

---

### F4. Shadow Definition Alignment

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §4.2 — Shadow tokens: `--shadow-sm: 0 1px 2px rgba(0,0,0,0.06)`, `--shadow-md: 0 4px 12px rgba(0,0,0,0.10)`, `--shadow-lg: 0 12px 32px rgba(0,0,0,0.16)`.

**Change made:**
- Defined `--shadow-sm`, `--shadow-md`, `--shadow-lg` matching ecosystem tokens
- Context menu uses `--shadow-lg`
- Export/canvas-size dropdowns use `--shadow-md`

---

### F5. Actions Log Live Region (aria-live)

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §7.3 — "Dynamic content changes are announced via `aria-live="polite"` regions."

**Change made:**
- Added `aria-live="polite"` to `.log-body` container in `index.html`
- Screen readers now announce shape creation, deletion, and other actions without requiring focus on the log

---

### F6. Canvas aria-label

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §7.1 — "All images/icons that convey meaning have descriptive `alt` text."

**Change made:**
- Added `role="application"` and `aria-label="Diagram canvas"` to `#canvas-container` in `index.html`

---

### F7. Ecosystem Header / Navigation

**Status: ⏳ Deferred**

**Requirement:**  
Ecosystem §5.4 — Standardized header with Free Open Tools mark/logo, tool name, theme toggle, and back link.

**Current state:**  
The toolbar serves as the application header. The back-link was removed per user preference; user is working with the original style guide to design a better ecosystem-navigation approach per-application. Awaiting their direction before implementing.

---

### F8. Global Theme Sync

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Ecosystem §6.1 — Theme preference persisted per tool, or globally if shared across subdomains.

**Change made:**
- Added `window.addEventListener('storage', ...)` handler that syncs `diagram-theme` changes across open tabs in real time
- When theme toggled in one tab, all other tabs update instantly
- SVG visibility (sun/moon) and grids/connections re-rendered on sync

---

### F9. Responsive Mobile Canvas Layout

**Status: ⏳ Deferred**

**Requirement:**  
Ecosystem §7.6 — "Mobile-first responsive design; layouts must work from 320px width up."

**Current state:**  
Quick-fix media queries added in P2 (hide properties panel ≤768px, hide triangle/terminator buttons ≤480px). A full mobile redesign (collapsible toolbar, overlay properties panel) requires the ecosystem header/nav design to be settled first, as both affect the toolbar layout.

---

### F10. LocalStorage Key Cleanup

**Status: ✅ Complete (v1.1)**

**Requirement:**  
Project STYLE GUIDE §2.2.2 — localStorage keys use `diagram-` prefix with kebab-case.

**Change made:**
- Added one-time migration block in `init()` that copies `diagramflow-*` values to `diagram-*` keys and removes the old keys
- `app.js` no longer reads `diagramflow-*` as fallbacks
- Existing users with `diagramflow-theme` or `diagramflow-state` data are transparently migrated on their next launch

---

## Summary of All Changes

| ID | Change | Priority | Risk | Files Affected | Status |
|---|---|---|---|---|---|
| R1 | Accent color purple → blue | P1 | MEDIUM | styles.css, about.html, app.js | ✅ v1.0 |
| R2 | Emoji removal (⬡☀☾📋▾) | P1 | LOW | index.html, about.html, app.js | ✅ v1.0 |
| R3 | CSS variable rename | P1 | HIGH | styles.css, about.html, app.js | ✅ v1.0 |
| R4 | CDN dependency removal | P1 | HIGH | index.html, app.js | ✅ v1.0 |
| R5 | Theme flash prevention | P1 | LOW | index.html, about.html, app.js | ✅ v1.0 |
| R6 | Skip-to-content link | P1 | LOW | index.html, about.html, styles.css | ✅ v1.0 |
| R7 | Focus-visible states | P1 | LOW | styles.css | ✅ v1.0 |
| R8 | Demo shape palette | P1 | LOW-MEDIUM | app.js | ✅ v1.0 |
| R9 | Semantic color cleanup | P2 | LOW | styles.css | ✅ v1.0 |
| R10 | Touch target minimums | P2 | MEDIUM | styles.css | ✅ v1.0 |
| R11 | Font size minimums | P2 | MEDIUM | styles.css, about.html | ✅ v1.0 |
| R12 | Responsive layout | P2 | HIGH | index.html, styles.css, app.js | ✅ v1.0 |
| R13 | Color-only signal fixes | P2 | LOW | styles.css, app.js | ✅ v1.0 |
| R14 | Project name consistency | P2 | LOW | README.md, app.js | ✅ v1.0 |
| R15 | Heading hierarchy | P2 | LOW | index.html | ✅ v1.0 |
| R16 | prefers-reduced-motion | P2 | LOW | styles.css | ✅ v1.0 |
| R17 | Back-to-ecosystem link | P2 | LOW | index.html | ✅ v1.0 |
| R18 | Button variant design | P2 | MEDIUM | styles.css | ✅ v1.0 |
| F1 | Shared icon set | P3 | LOW | index.html | ✅ v1.1 |
| F2 | Spacing scale tokens | P3 | MEDIUM | styles.css | ✅ v1.1 |
| F3 | Corner radius tokens | P3 | LOW-MEDIUM | styles.css | ✅ v1.1 |
| F4 | Shadow tokens | P3 | LOW | styles.css | ✅ v1.1 |
| F5 | aria-live on action log | P3 | LOW | index.html | ✅ v1.1 |
| F6 | Canvas aria-label | P3 | LOW | index.html | ✅ v1.1 |
| F7 | Ecosystem header | P3 | LOW | index.html | ⏳ Deferred |
| F8 | Global theme sync | P3 | LOW | app.js | ✅ v1.1 |
| F9 | Mobile canvas layout | P3 | HIGH | index.html, styles.css, app.js | ⏳ Deferred |
| F10 | LocalStorage key cleanup | P3 | LOW | app.js | ✅ v1.1 |

---

## Migration Summary

All P1 (8 items) and P2 (10 items) resolved in **v1.0**. P3 items F1–F6, F8, F10 resolved in **v1.1**. F7 and F9 deferred pending ecosystem header design direction from the user.

1. **P1 changes first** (R1-R8): These are the blocking items. Do them in dependency order:
   - R3 (CSS variable rename) must be done before or alongside R1 (accent color), since both touch the same variables
   - R2 (emoji) is independent
   - R5 (theme flash) and R6 (skip link) are independent and quick
   - R4 (CDN dependency) is the riskiest P1 — start early to allow time for implementation
   - R7 (focus-visible) is a one-line CSS addition

2. **P2 changes next** (R9-R18): Quality and accessibility improvements.
   - R16 (prefers-reduced-motion) is a one-line CSS addition, do early
   - R11 (font sizes) and R10 (touch targets) may conflict — do together
   - R12 (responsive) is the most complex P2, start early
   - R17 (back link) is a one-line HTML addition

3. **P3 changes last** (F1-F10): Can be deferred or done incrementally.
   - F5 (aria-live) and F6 (canvas aria-label) are quick accessibility wins
   - F2 (spacing), F3 (radius), F4 (shadows) are systematic CSS refactors
   - F9 (mobile layout) is a major UX project

---

*This document should be updated as reconciliation progresses. Re-audit after each P1 change is complete to catch regressions.*