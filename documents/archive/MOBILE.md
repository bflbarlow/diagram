# Mobile Accessibility

## Current State

The diagram editor has partial mobile support but the properties panel is **completely hidden on screens ≤768px** (`display: none !important`). This means phone users cannot access shape properties, layer management, or custom SVG controls.

## Known Issues

### Properties Panel Hidden on Phones
- CSS rule at `styles.css:1072`: `#properties-panel { display: none !important; }` inside `@media (max-width: 768px)`
- Users on phones have zero access to the properties panel, layers tab, or custom SVG input
- The panel is also hidden at ≤480px for the export button, triangle/terminator shape buttons

### Canvas Interaction
- `touch-action: none` on `#canvas-container` prevents browser gestures (scroll, pinch-zoom) — this is intentional for canvas control but conflicts with pinch-to-zoom feature
- Resize handles are 22px (touch-friendly) but may still be hard to target precisely on small screens
- No visual feedback difference between touch and pointer input

### Toolbar
- Toolbar spans full width with all buttons visible
- At ≤480px, export button and triangle/terminator buttons are hidden
- No hamburger menu or scrollable overflow for dense toolbars

## What Works

- Pointer Events API unifies mouse + touch + pen input
- Pinch-to-zoom support on touchscreens
- Touch-friendly resize handles (22px)
- Touch long-press right-click (500ms hold → context menu)
- Larger touch targets (40px+) for toolbar buttons and context menu items
- Touch-action manipulation on body for double-tap zoom prevention

## Recommendations

### Short-Term Fixes

1. **Make properties panel accessible on mobile**
   - Replace `display: none` with a slide-out sheet or bottom sheet pattern
   - Use `position: fixed; bottom: 0; left: 0; right: 0; height: 60vh;` for a bottom sheet
   - Add a drag handle at the top for resizing the sheet height
   - Add a backdrop overlay to dismiss

2. **Add a mobile toolbar toggle**
   - Collapse toolbar into a scrollable row or hamburger menu at ≤480px
   - Keep essential tools (select, line, text, save) always visible

3. **Increase touch target sizes**
   - Resize handles: 22px → 44px minimum
   - All buttons: minimum 44x44px (WCAG 2.1 target size)

### Medium-Term Improvements

4. **Add a "Mobile Mode" toggle**
   - Auto-detect touch devices and offer a simplified UI
   - Larger controls, bottom sheet properties, gesture-based navigation

5. **Improve context menu for touch**
   - Context menu currently appears on right-click or long-press
   - On touch, the 500ms long-press may conflict with scrolling
   - Consider a dedicated "Edit" button in toolbar for selected shapes

6. **Add zoom controls for touch**
   - Pinch-to-zoom works but has no visual feedback
   - Add +/- zoom buttons in toolbar for users who prefer tap over pinch

### Long-Term Goals

7. **Full responsive layout**
   - Properties panel as a bottom sheet on phones
   - Collapsible toolbar with essential tools visible
   - Layers panel as an overlay drawer

8. **Orientation handling**
   - No current handling for landscape vs portrait
   - Consider layout adjustments for landscape mode (wider canvas area)

9. **Accessibility**
   - VoiceOver / TalkBack labels on all touch targets
   - Focus indicators for keyboard navigation on tablets
   - High-contrast mode support

## Technical Notes

### Current Media Queries

```css
@media (max-width: 768px) {
    #properties-panel { display: none !important; }
}

@media (max-width: 480px) {
    .export-wrap .tool-btn-primary,
    .shape-btn[data-shape="triangle"],
    .shape-btn[data-shape="terminator"] { display: none; }
}
```

### Properties Panel Structure

The panel has four tabs/sections:
- **Properties** — shape/selection properties (position, size, fill, stroke, opacity, text)
- **Layers** — layer management (reorder, lock, visibility)
- **Custom SVG** — custom shape input with viewBox controls
- **Project** — project name, canvas dimensions, save/load/export

All four are inaccessible on mobile with current CSS.

### Touch Event Flow

1. `pointerdown` → long-press timer starts (500ms for right-click)
2. If pointer moves before timer fires → grab shape/start drawing
3. `pointermove` → pan canvas or resize shape
4. `pointerup` → commit changes, stop long-press timer
5. If long-press fires without movement → show context menu

The long-press gesture conflicts with scroll on touch devices. Consider requiring long-press to start at a stationary point for a minimum duration before allowing movement.
