# Right-Click Pan Analysis

## 1. Current State

### Location
The middle-click-to-pan mechanism is a single, self-contained block in **`app.js`**:

**Lines 1112–1120** (in the `pointerdown` handler):
```js
if (e.button === 1) {
    S.isPanning = true;
    S.panStart = { x: e.clientX, y: e.clientY };
    container.style.cursor = 'grabbing';
    e.preventDefault();
    container.setPointerCapture(e.pointerId);
    return;
}
```

This sets `S.isPanning = true`, which is then consumed by the `pointermove` handler at **lines 1386–1390**:
```js
if (S.isPanning) {
    S.panX += e.clientX - S.panStart.x;
    S.panY += e.clientY - S.panStart.y;
    S.panStart = { x: e.clientX, y: e.clientY };
    applyTransform();
    return;
}
```

The actual pan delta application does **not** re-check `e.button` — it simply reads the boolean flag.

### Existing Right-Click Context Menu
Right-click is handled entirely by the `contextmenu` event listener at **lines 1734–1765**:
- Calls `e.preventDefault()` to suppress the native menu
- Hit-tests shapes and connections
- Shows the app's custom context menu at the click position
- Selection logic runs before menu display

### Documentation
The README documents "Middle-mouse drag | Pan" in the keyboard shortcuts table.

---

## 2. Proposed Change

**Goal**: Use right-click to pan the canvas, with a time threshold to differentiate between click (context menu) and drag (pan).

**Mechanism**:
- On right-click `pointerdown`: start a timer (e.g., 200ms), record starting position
- On `pointermove` (right button): if movement exceeds a small threshold (e.g., 5–10px), cancel timer, start panning
- On `pointerup` (right button): if timer expired → start panning; if timer still active and movement small → show context menu

---

## 3. Feasibility Assessment

**Feasibility: ~8/10**

The pattern is well-established (macOS, Figma, Illustrator all use click vs. drag distinction). The main work is restructuring the `pointerdown` early-return block into a stateful decision tree across 3–4 event handlers (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`).

### Complexity Breakdown

| Aspect | Difficulty | Notes |
|---|---|---|
| Timer mechanism | Low | Straightforward `setTimeout` + `clearTimeout` |
| State tracking | Low | Need new flags: `S._rightClickPending`, `S._rightClickStart` |
| Pointer capture | Moderate | Only call `setPointerCapture` once pan is confirmed; release if cancelled |
| Context menu on `pointerup` | Moderate | Must suppress native `contextmenu` and invoke menu logic from `pointerup` |
| `pointercancel` edge case | Moderate | Check pending state in `pointercancel` handler |
| Cursor feedback | Low | Show `'grab'` cursor during pending window |

---

## 4. Compatibility Analysis

| Interaction | Current Behavior | After Change | Impact |
|---|---|---|---|
| Middle-click drag | Pans canvas | No longer pans | ⚠️ Breaking change for existing users |
| Right-click drag | Opens context menu | Would pan canvas | ⚠️ Core change |
| Right-click release | Opens context menu | Would show context menu | ✅ Preserved |
| Two-finger trackpad pan | Uses `wheel` event | Unaffected | ✅ No impact |
| Touchscreen pan | Uses pinch gesture | Unaffected | ✅ No impact |
| Ctrl/Cmd + wheel zoom | Uses `wheel` event | Unaffected | ✅ No impact |
| Plain scroll wheel pan | Uses `wheel` event | Unaffected | ✅ No impact |
| Touch long-press context menu | Uses timer on `pointerdown` | Unaffected | ✅ No impact |
| Left-click shape drag | Uses `e.button === 0` | Unaffected | ✅ No impact |
| Left-click selection box | Uses `e.button === 0` | Unaffected | ✅ No impact |
| Connection drag | Uses `e.button === 0` | Unaffected | ✅ No impact |

---

## 5. Complete Breakage Analysis

### 5.1. `contextmenu` Event Fires Before `pointerup` (HIGH SEVERITY)

**The Core Timing Problem**

The `contextmenu` event fires at different times relative to pointer events across browsers:

| Browser | Timing |
|---|---|
| Chrome | `pointerdown` → `contextmenu` → `pointerup` |
| Firefox | `pointerdown` → `pointerup` → `contextmenu` |
| Safari | `pointerdown` → `contextmenu` → `pointerup` |

In Chrome and Safari, the `contextmenu` event fires **before** we know if the user is going to drag or click. If we suppress the native `contextmenu` unconditionally and try to show the menu on `pointerup`, the UX changes:

- **Before**: menu appears the instant you right-click
- **After**: menu appears when you release the right button

This is a **UX regression** — users may not realize the click registered during the 50–200ms window.

**Mitigation**: Show the menu on `pointerdown` immediately (same as current behavior) and only initiate pan on `pointermove` if the right button is held past a threshold. This eliminates the timing problem entirely.

### 5.2. Context Menu Hit-Testing Must Use Original Click Position (MEDIUM SEVERITY)

The current `contextmenu` handler hit-tests the click position to determine what to show. With deferred pan, the user may drag significantly before releasing. The `pointerup` hit-testing must use the **original click position** (`S._rightClickStart`), not the release coordinates.

**Risk**: If release position is used, the context menu would appear at the wrong location or target the wrong shape.

### 5.3. Left-Click Drag Silently Aborted by Right-Click (MEDIUM SEVERITY, VERY LOW LIKELIHOOD)

When a shape is being dragged (left-click), `container.setPointerCapture(e.pointerId)` is active. If the user then right-clicks:

- The right-click `pointerdown` fires on the container (due to capture)
- `e.pointerId` is the **same** as the left-click pointerId (same mouse)
- `S.pointers[e.pointerId]` gets overwritten, corrupting pinch-tracking state
- The left-click drag state (`S.isDragging`) is still active

When the right-click timer expires, `S.isPanning = true` is set. In `pointerup` at line 1535:

```js
if (S.isPanning) { S.isPanning = false; updateCursor(); container.releasePointerCapture(e.pointerId); return; }
```

This would **abort the left-click shape drag** because `releasePointerCapture` is called.

**Risk level**: Very low — holding a shape while right-clicking is an unusual interaction.

**Mitigation**: In the right-click `pointerdown` handler, check if any `isDragging`/`isResizing`/`isDraggingConn` flags are set. If so, skip the pending pan logic and show the context menu immediately.

### 5.4. `pointercancel` / `lostpointercapture` — Timer Leak (LOW SEVERITY)

The `cleanupPointer` function (line 1703) resets `S.isPanning = false` and other flags, but it **does not clean up any pending right-click timer**. If the browser fires `pointercancel` during the timer window (possible on some touch devices or if the browser tab loses focus), the timer would fire after the user has released the button, potentially showing a context menu at the wrong location or initiating an unintended pan.

**Mitigation**: Add timer cleanup to `cleanupPointer`:
```js
function cleanupPointer(e) {
    delete S.pointers[e.pointerId];
    if (S.pinchStart && Object.keys(S.pointers).length < 2) S.pinchStart = null;
    S.isPanning = false; S.isDragging = false; S.isResizing = false;
    S.isDrawing = false; S.isDraggingConn = false; S.isSelecting = false;
    previewLayer.innerHTML = '';
    updateCursor();
    // New: clean up pending right-click state
    if (S._rightClickTimer) {
        clearTimeout(S._rightClickTimer);
        delete S._rightClickTimer;
        delete S._rightClickStart;
        delete S._rightClickPending;
    }
}
```

### 5.5. Hit-Testing Uses Wrong Coordinate (MEDIUM SEVERITY)

If the user right-click-holds and drags to pan, then releases, the `pointerup` handler would check the **release position** for hit-testing. This position may be far from the original click, causing the context menu to appear at the wrong location or target the wrong shape.

**Mitigation**: Always use `S._rightClickStart` (recorded in `pointerdown`) for hit-testing in the context menu, regardless of where the user released.

### 5.6. Timer Precision and User Perception (LOW SEVERITY)

The timer threshold is the critical UX parameter:
- **Too short** (e.g., 100ms): users who intend to click might accidentally trigger pan
- **Too long** (e.g., 500ms): the menu appears with noticeable delay

**Industry standards**:
- macOS: ~200ms for double-click detection; right-click is instant
- Figma: instant menu, pan on drag
- Illustrator: instant menu, pan on drag
- Google Maps: instant menu, pan on drag

**Risk**: Users accustomed to instant right-click menus might perceive a delay. A 200ms threshold is perceptible.

### 5.7. `updateCursor()` Function (LOW SEVERITY)

When panning starts, the cursor changes to `'grabbing'`. When it ends, `updateCursor()` is called. With the new approach:
- The cursor needs to change to `'grabbing'` when the timer expires (pan starts)
- `updateCursor()` needs to be called when the timer expires (to handle the case where the cursor was already `'grabbing'`)

**Risk**: Low — straightforward to implement.

### 5.8. Selection State in Context Menu (LOW SEVERITY)

The contextmenu handler (line 1746) calls `select(s.id)` if the shape isn't already selected. This is important because context menu actions (duplicate, delete, lock/unlock) operate on `S.selection`.

With the new approach, the `pointerup` handler would need to replicate this selection logic. If hit-testing finds a shape, it must call `select(s.id)` before showing the menu.

**Risk**: Low — straightforward, but easy to forget if the logic is duplicated incorrectly.

### 5.9. Touch Long-Press Interaction (LOW SEVERITY)

The touch long-press timer (line 1310) uses `S._longPressStart` and `S._longPressTimer`. The right-click timer would use different state properties (e.g., `S._rightClickStart` and `S._rightClickTimer`). They share no state.

**However**: The touch long-press mechanism is inside the `pointerdown` handler and fires for all touch pointerdowns where nothing grabbed. If the right-click timer approach adds similar logic to `pointerdown`, it could interfere.

**Mitigation**: Keep the right-click timer logic in `pointerup` instead of `pointerdown`, or ensure the touch long-press timer is cleared before the right-click timer starts.

### 5.10. Keyboard Accessibility — Shift+F10 / Menu Key (NO BREAKAGE)

The `contextmenu` event fires when the user presses Shift+F10 or the context menu key. This is a keyboard accessibility feature. With the new approach:
- Shift+F10 would fire `contextmenu` (not `pointerdown`)
- The `contextmenu` handler still runs and shows the menu
- **No breakage** — keyboard users are unaffected

### 5.11. `e.button` Value on `pointerup` for Right-Click (NO BREAKAGE)

On `pointerup`, `e.button` reports which button changed state (2 for right-click release). `e.buttons` reports which buttons are currently pressed (0 when right-click is released). This is consistent across browsers and is reliable for detecting "right-click just released."

### 5.12. Right-Click on the Context Menu Itself (NO BREAKAGE)

If the context menu is open and the user right-clicks on it:
- The `contextmenu` event fires on the container
- The hit-testing would find no shape (the menu is outside the canvas shapes)
- Nothing would happen — the existing menu stays open

This is the same as current behavior.

### 5.13. The `click` Event Hides the Context Menu (NO BREAKAGE)

Line 1765: `document.addEventListener('click', ...)` hides the context menu when clicking anywhere outside it. This only fires for left-clicks, not right-clicks. So:
- Quick right-click → menu opens
- Left-click elsewhere → menu closes (correct)
- Right-click-hold-drag-release → menu stays open (correct, because no `click` event fires for right-click)

### 5.14. Right-Click on Empty Canvas (NO BREAKAGE)

The current `contextmenu` handler (line 1750–1760) only shows a menu if a shape or connection is hit. On empty canvas, the native context menu is suppressed but nothing is shown.

With the new approach, if the user right-clicks on empty canvas and releases quickly, the `pointerup` handler would:
1. Check the timer — it's still active
2. Check movement — below threshold
3. Hit-test the **original click position** — no shape, no connection
4. **Show nothing** — same as current behavior

### 5.15. Right-Click During Active Pinch (VERY LOW RISK)

The `pointerdown` handler checks `if (ptrCount >= 2)` at the top and starts pinch mode. If a user is pinching (two fingers on trackpad or two-touch) and right-clicks with a mouse:
- The mouse right-click has its own pointerId
- `ptrCount` would increment to 3
- The pinch logic wouldn't trigger (it only looks at `ptrs[0]` and `ptrs[1]`)
- The right-click would enter the pending pan state

**Risk**: Very low. Pinch + right-click simultaneously is extremely rare.

---

## 6. Summary of Actual Breakages

| Issue | Severity | Likelihood |
|---|---|---|
| `contextmenu` fires before `pointerup` (Chrome/Safari) | **High** | 100% — inherent to browser behavior |
| Hit-testing uses wrong coordinate (release vs. click pos) | **Medium** | 100% if not handled |
| Left-click drag silently aborted by right-click | **Medium** | Very low (edge case) |
| Menu appears on release, not press (UX regression) | **Medium** | 100% for Chrome/Safari |
| Timer leak on `pointercancel` | Low | Low |
| Cursor feedback during pending state | Low | Low |
| Touch long-press timer interference | Low | Very low |
| Timer precision / user perception | Low | Low |

---

## 7. Recommended Approach: Deferred Pan

Instead of the timer-based approach, consider **deferred pan**:

1. **On right-click `pointerdown`**: Show the context menu **immediately** (same as current behavior)
2. **On right-click `pointermove`**: If movement exceeds threshold (e.g., 5px), **cancel** the context menu and **start panning**
3. **On right-click `pointerup`**: If the context menu is still open, do nothing (it was already shown). If panning was active, end it.

### Advantages
- The menu appears immediately (no UX regression)
- Panning only triggers if the user actually drags
- No timer precision issues
- `contextmenu` event can be handled naturally
- No `pointercancel` timer leak risk

### Trade-off
The context menu briefly appears and then disappears if the user drags. This is the same behavior as macOS (where the menu appears and then the drag starts, or the menu disappears if you move too far).

### Implementation Notes
- Use `S._rightClickMoved` flag (boolean) to track if movement exceeded the threshold
- In `pointermove`: if `e.button === 2` and distance from start > threshold, set `S._rightClickMoved = true`, cancel context menu, start panning
- In `pointerup`: if `S._rightClickMoved`, end panning; otherwise, do nothing (menu already shown)
- In `cleanupPointer`: reset `S._rightClickMoved`

---

## 8. Files That Would Need Changes

| File | Change |
|---|---|
| `app.js` line 1112–1120 | Restructure from immediate pan to deferred pan logic |
| `app.js` pointermove handler | Add right-click movement threshold detection |
| `app.js` pointerup handler | Add right-click release handling |
| `app.js` cleanupPointer | Add right-click state cleanup |
| `README.md` | Update "Middle-mouse drag \| Pan" to "Right-click drag \| Pan" |
| `README.md` | Update "Zoom & Pan" bullet point |

---

## 9. Testing Checklist

- [ ] Chrome: right-click instant menu, right-click-drag pan
- [ ] Firefox: right-click instant menu, right-click-drag pan
- [ ] Safari: right-click instant menu, right-click-drag pan (test pointer events carefully)
- [ ] Edge: right-click instant menu, right-click-drag pan
- [ ] Two-finger trackpad pan (unchanged)
- [ ] Pinch-to-zoom on touchscreen (unchanged)
- [ ] Scroll wheel pan (unchanged)
- [ ] Ctrl/Cmd + scroll zoom (unchanged)
- [ ] Left-click shape drag (unchanged)
- [ ] Left-click selection box (unchanged)
- [ ] Connection drag (unchanged)
- [ ] Touch long-press context menu (unchanged)
- [ ] Shift+F10 keyboard context menu (unchanged)
- [ ] Right-click on shape → shape context menu
- [ ] Right-click on connection → connection context menu
- [ ] Right-click on empty canvas → no menu (same as current)
- [ ] Right-click on context menu → no change
- [ ] Right-click while dragging shape (edge case)
