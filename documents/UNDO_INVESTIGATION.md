# Undo Investigation

## The "Double Undo" Problem for Move/Resize

### Root Cause

The undo system pushes state **after** an operation completes, not before. Here's the exact flow:

1. **pointerdown** → Sets `isDragging`/`isResizing` flag, records origin
2. **pointermove** → Updates shape pos/size live, calls `render()` (no undo push)
3. **pointerup** → Calls `pushUndo()` which saves the **current (post-operation)** state to `undoStack`, then clears `redoStack`

**The bug:** `pushUndo()` is called **at the end** of pointerup. This means the state pushed to the undo stack is the state **after** the move/resize. The previous state was never explicitly saved.

When you undo:
- **First undo:** Restores the state that was in the undo stack before this operation (the pre-move state). This is correct.
- **Second undo:** Goes back one more step, which is unexpected.

This is actually the **expected behavior** of a well-implemented undo system — each undo pops one entry. The user's perception of "double undo" likely comes from:
- The visual feedback during drag is immediate (no "before" state visible)
- The first undo restores the pre-move state which may feel like "nothing happened" because the visual change is already committed

### Current undo coverage by action type

#### ✅ Actions that ARE undoable (call `pushUndo()`)

| Action | Where `pushUndo` is called |
|--------|---------------------------|
| Move shapes (drag) | `pointerup` handler, line ~1871 |
| Resize shapes | `pointerup` handler, line ~1871 |
| Drag connection endpoint | `pointerup` handler, line ~1951 |
| Drag connection body | `pointerup` handler, line ~1951 |
| Create shape (click to place) | `click` handler, line ~1608 |
| Duplicate (btn) | btn-duplicate handler, line ~2186 |
| Delete (btn) | btn-delete handler, line ~2192 |
| Text edit (commit) | textInput blur, line ~2124 |
| Line tool (commit connection) | click handler, line ~2026 |
| Z-order (toolbar buttons) | Various handlers, lines ~2513, ~2523 |
| Layout panel actions | Various, lines ~2782, ~2799 |
| Keyboard shortcuts (Ctrl+D, Ctrl+]) | Keydown handler, lines ~2825-2828 |

#### ❌ Actions that are NOT undoable (only call `scheduleSave()`)

| Action | Where |
|--------|-------|
| **Create shape** (toolbar button) | `addShape()` at line ~830 — only `scheduleSave()`, no `pushUndo()` |
| **Create connection** (line tool drag) | `addConn()` at line ~849 — only `scheduleSave()`, no `pushUndo()` |
| **Delete shape** | `deleteShape()` at line ~855 — only `scheduleSave()`, no `pushUndo()` |
| **Delete connection** | `deleteConn()` at line ~863 — only `scheduleSave()`, no `pushUndo()` |
| **Change fill/stroke/color/opacity** | `applyStyleToSelected()` — only `scheduleSave()`, no `pushUndo()` |
| **Change text** (properties panel) | Direct property assignment — only `scheduleSave()`, no `pushUndo()` |
| **Change z-height** (properties panel) | Direct property assignment — only `scheduleSave()`, no `pushUndo()` |
| **Rename shape** | propNameInput change handler — only `scheduleSave()`, no `pushUndo()` |
| **Toggle grid/snap** | btn-grid/btn-snap handlers — only `scheduleSave()`, no `pushUndo()` |
| **Canvas size change** | canvasWidth/canvasHeight change — only `scheduleSave()`, no `pushUndo()` |
| **Project name change** | projectNameInput change — only `scheduleSave()`, no `pushUndo()` |

## Action Log Coverage

### ✅ Actions that ARE logged to action log

| Category | Actions |
|----------|---------|
| `add` | Created shape, Connected X → Y, Duplicated, Pasted |
| `del` | Deleted shape/connection |
| `move` | Moved shapes, Resized shapes, Attached/detached connections, Z-order changes |
| `edit` | Text edits, Renamed shape, Z-height change |
| `sys` | Export, Tool change, Grid/snap toggle, Auto-save status, Read-only status |

### ❌ Actions NOT logged to action log

| Action | Reason |
|--------|--------|
| Style changes (fill, stroke, opacity, etc.) | No `logAction` call — only `scheduleSave()` |
| Canvas size changes | No `logAction` call |
| Project name changes | No `logAction` call |
| Shape name changes via properties panel | Logged as "Renamed X → Y" — actually **IS** logged |
| Zoom/pan changes | No `logAction` call |

## Key Code Locations

- **`pushUndo()`** — line 781: pushes `{shapes, connections}` to undo stack, clears redo stack
- **`undo()`** — line 787: pops from undoStack, pushes current to redoStack, restores state
- **`redo()`** — line 796: pops from redoStack, pushes current to undoStack, restores state
- **`scheduleSave()`** — line 359: saves to localStorage (debounced 300ms)
- **`saveState()`** — line 343: writes to localStorage + auto-save file
- **`logAction()`** — line 94: logs to in-app action log (max 500 entries)

## Summary

1. **Move/resize undo works correctly** — one undo = one operation reversal. The "double undo" perception is likely UX-related (visual feedback during drag makes the first undo feel redundant).

2. **Significant gap:** Shape creation (toolbar), deletion, and all property/style changes are **not undoable** — they only call `scheduleSave()` for persistence, not `pushUndo()` for undo history.

3. **Action log is well-covered** for structural changes (add/del/move/edit) but misses style/property changes entirely.

## Verified Bug: Clicks Create Spurious Undo Entries

After adding the console logs, the user confirmed the exact issue. Here's what happens when you simply **click** a shape (no drag):

```
[ACTION-START] MOVE | shapes: RoundRect 5     ← pointerdown hits shape, sets isDragging=true
[ACTION-DONE] MOVE | shapes affected: 1        ← pointerup sees isDragging still true
[UNDO-PUSH] Stack depth: 1                     ← pushUndo() saves state — but nothing changed!
```

The sequence above repeats for *every click on a shape*. The pointerup handler (line ~1879) has no way to distinguish a click from a drag — it just sees `isDragging === true` and calls `pushUndo()` regardless.

### Root cause

In `pointerdown` (line ~1534), clicking a selectable, unlocked shape sets `S.isDragging = true` unconditionally:

```js
if (!hit.locked) {
    S.isDragging = true;              // ← set on ANY click, even without a drag
    S.dragStart = { x: pos.x, y: pos.y };
    ...
}
```

Then in `pointerup` (line ~1879), the handler checks `isResizing || isDragging` and fires `pushUndo()` without checking whether the shape actually changed position:

```js
if (S.isResizing || S.isDragging) {
    logAction('Moved ...', 'move');   // ← logged even for clicks!
    ...
    pushUndo(); render();              // ← undo entry created for a no-op
    return;
}
```

So every click pushes an undo snapshot. When the user hit undo, the first undo restores the pre-move state (the real move). The second undo restores a state that differs only by a click — which looks like nothing changed, making it feel like a "double undo."

### Proposed fix

Check if the shape actually moved before logging and pushing undo:

```js
if (S.isResizing || S.isDragging) {
    var _hasMoved = S.dragOrigin && S.dragOrigin.some(function(orig, i) {
        var s = findShape(shapeSel()[i]);
        return s && (s.x !== orig.x || s.y !== orig.y);
    });
    if (!_hasMoved) {
        // Click with no drag — just deselect the drag state, no undo push
        S.isResizing = false; S.isDragging = false;
        container.releasePointerCapture(e.pointerId);
        return;
    }
    // Actual move/resize — proceed as before
    ...
}
```

## Suggested Console Logs for Troubleshooting

Add these `console.log` statements to `app.js` to trace the exact undo flow. Each log includes a short tag for easy filtering.

### 1. In `pushUndo()` (line ~781) — what gets saved to undo stack

```js
function pushUndo() {
    var snapshot = JSON.stringify({ shapes: S.shapes, connections: S.connections });
    console.log('[UNDO-PUSH] Stack depth:', S.undoStack.length + 1, '| shapes:', S.shapes.length, '| conns:', S.connections.length);
    S.undoStack.push(snapshot);
    if (S.undoStack.length > CONFIG.maxUndo) S.undoStack.shift();
    S.redoStack = [];
    scheduleSave();
}
```

### 2. In `undo()` (line ~787) — what state is being restored

```js
function undo() {
    if (!S.undoStack.length) return;
    console.log('[UNDO-POP] Before: stack depth:', S.undoStack.length, '| shapes:', S.shapes.length, '| conns:', S.connections.length);
    S.redoStack.push(JSON.stringify({ shapes: S.shapes, connections: S.connections }));
    var d = JSON.parse(S.undoStack.pop());
    console.log('[UNDO-RESTORE] After: shapes:', d.shapes.length, '| conns:', d.connections.length);
    S.shapes = d.shapes; S.connections = d.connections; S.selection = [];
    logAction('Undo', 'sys');
    saveState();
    render();
}
```

### 3. In `pointerup` handler (line ~1867-1871) — what triggered the undo push

```js
if (S.isResizing || S.isDragging) {
    var actionTag = S.isDragging ? 'MOVE' : 'RESIZE';
    console.log('[ACTION-DONE]', actionTag, '| shapes affected:', shapeSel().length, '| selected ids:', shapeSel().join(','));
    if (S.isDragging) logAction('Moved ' + shapeSel().length + ' shape(s)', 'move');
    if (S.isResizing) logAction('Resized ' + shapeSel().map(shapeName).join(', '), 'edit');
    S.isResizing = false; S.isDragging = false;
    pushUndo(); render();
    container.releasePointerCapture(e.pointerId);
    return;
}
```

### 4. In `pointerdown` handler (line ~1469 and ~1534) — what started the drag/resize

```js
// Around line 1469 (resize start)
if (hitHandle) {
    S.isResizing = true;
    S.resizeHandle = hitHandle.dataset.handle;
    S.resizeStart = { mx: pos.x, my: pos.y, sx: hit.x, sy: hit.y, sw: hit.width, sh: hit.height };
    console.log('[ACTION-START] RESIZE | handle:', S.resizeHandle, '| shape:', hit.id, '(', hit.type, ')', '| rect:', hit.x, hit.y, hit.width, hit.height);
    select(hit.id, e.shiftKey);
    e.preventDefault();
    container.setPointerCapture(e.pointerId);
    return;
}

// Around line 1534 (drag start)
if (!hit.locked) {
    S.isDragging = true;
    S.dragStart = { x: pos.x, y: pos.y };
    S.dragOrigin = shapeSel().map(function(id) {
        var sh = findShape(id);
        return sh ? { x: sh.x, y: sh.y } : null;
    }).filter(Boolean);
    console.log('[ACTION-START] MOVE | shapes:', shapeSel().map(function(id){ return shapeName(id); }).join(','));
}
```

### 5. For connection drag (line ~1493 and ~1504) — endpoint vs body

```js
// Around line 1493 (endpoint drag)
S.isDraggingConn = true;
S.dragConnId = interceptConn.id;
S.dragStart = { x: pos.x, y: pos.y };
S.dragConnEnd = iD1 < iD2 ? 'from' : 'to';
console.log('[ACTION-START] CONN-DRAG | endpoint:', S.dragConnEnd, '| conn:', S.dragConnId);

// Around line 1504 (body drag)
S.isDraggingConn = true;
S.dragConnId = interceptConn.id;
S.dragStart = { x: pos.x, y: pos.y };
S.dragConnEnd = null;
console.log('[ACTION-START] CONN-BODY | conn:', S.dragConnId);
```

### 6. For connection drag pointerup (line ~1951)

```js
console.log('[ACTION-DONE] CONN-DRAG | conn:', S.dragConnId);
pushUndo(); render();
```

### 7. For actions that are NOT undoable — confirm they skip pushUndo

Add a `console.log` to `addShape()`, `deleteShape()`, `deleteConn()`, and `applyStyleToSelected()` to verify they do NOT call `pushUndo()`:

```js
// In addShape() around line 830
console.log('[NO-UNDO] addShape:', s.id, '(', s.type, ') — only scheduleSave()');

// In deleteShape() around line 855
console.log('[NO-UNDO] deleteShape:', id, '(', s ? s.type : '?', ') — only scheduleSave()');

// In deleteConn() around line 863
console.log('[NO-UNDO] deleteConn:', id, '— only scheduleSave()');

// In applyStyleToSelected() — add at function entry
console.log('[NO-UNDO] style:', prop, '=', val, '| shapes affected:', shapeSel().length);
```

### 8. For pointermove — track live changes during drag (optional, high volume)

```js
// In pointermove handler, inside the isDragging / isResizing blocks
if (S.isDragging) {
    console.log('[DRAG] MOVE | shapes:', shapeSel().map(function(id){ return shapeName(id); }).join(','));
}
if (S.isResizing) {
    console.log('[DRAG] RESIZE | handle:', S.resizeHandle);
}
```

> **Note:** Log #8 is high-volume — only enable while actively debugging a specific drag. Use `console.group('MOVE')` / `console.groupEnd()` to collapse the output.

### Quick Filter Commands for DevTools Console

```
[UNDO-PUSH
[UNDO-POP
[UNDO-RESTORE
[ACTION-START
[ACTION-DONE
[NO-UNDO
```

These let you isolate undo events, action start/end, and non-undoable operations respectively.

---

## Database App Undo Analysis

This section applies the same investigative methodology to the **database app** (`/Users/bflbarlow/Websites/database/app.js`), whose undo system was reviewed after the user reported that undo still requires **two presses** to take effect.

### Database Undo Architecture (Snapshot-Free, Action-Based)

Unlike the diagram app's snapshot-based undo (entire state serialized on each push), the database app uses an **action-log-based** undo:

```js
// /Users/bflbarlow/Websites/database/app.js — line 184
function pushUndo(action, data) {
  undoStack.push({ action: action, data: data });
  if (undoStack.length > 10) undoStack.shift();
  var btn = document.getElementById('btn-undo');
  if (btn) btn.style.display = 'inline-flex';
}
```

Each undo entry stores an action type (`'delete-row'`, `'edit-column'`, `'delete-table'`, etc.) and the data needed to reverse it. The undo handler (`undoLastAction`, line 191) dispatches on `entry.action` and applies the inverse operation.

### What is Undoable

| Action | pushUndo called at | Undo handler case |
|--------|-------------------|-------------------|
| Delete a row | `pushUndoRowDelete()` line 1983 | `'delete-row'` — re-INSERTs the row |
| Delete all rows | `deleteAllRows()` line 2013 | `'delete-all-rows'` — bulk INSERT |
| Delete a table | `confirmDeleteTable()` line 2060 | `'delete-table'` — re-runs CREATE TABLE + data INSERT |
| Edit a column (schema) | `modal.colEditorSave` click handler line 2459 | `'edit-column'` — `rebuildTable()` with old defs |
| Delete a column | Column list delete button line 2609 | `'delete-column'` — `rebuildTable()` with old defs |
| Add a relationship | `saveRelationship()` line 436 | `'add-relationship'` — calls `deleteRelationshipById()` |
| Delete a relationship | `deleteRelationshipById()` line 448 | `'delete-relationship'` — re-pushes rel object to array |

### What is NOT Undoable

| Action | Why |
|--------|-----|
| Create table (via toolbar/modal) | No `pushUndo` call anywhere in `createTable()` |
| Rename table | No `pushUndo` in `renameTable()` |
| Duplicate table | No `pushUndo` in `duplicateTable()` |
| Add empty row | No `pushUndo` in `addEmptyRow()` |
| Edit cell values (inline editing) | No `pushUndo` in the cell edit/blur handler |
| Column metadata-only changes (description, displayField) | `setColMeta()` is called but `pushUndo` is only invoked when schema changes |
| Change column hidden/shown state | No `pushUndo` in the hide/show handler |
| Reorder columns via drag | No `pushUndo` in `setColOrder()` |

### Bug: Undo Entry Pushed Before Confirmation (Phantom Entries)

In `confirmDeleteTable()` (line 2053), the undo entry is pushed **before** the user confirms the deletion:

```js
function confirmDeleteTable(name) {
  if (db) {
    try {
      // ... gather table info ...
      if (createSql) pushUndo('delete-table', { ... });  // ← LINE 2060: PUSHED HERE
    } catch (e) { /* */ }
  }
  modal.confirmTitle.textContent = 'Delete table "' + name + '"?';  
  modal.confirmMsg.textContent = '...';
  modal.confirm.classList.add('open');                                 // ← Modal opens AFTER the push
  pendingCallback = function () { deleteTable(name); };
}
```

If the user clicks **Cancel**, the undo entry is **still in the stack** — a phantom entry for a table that was never deleted. The next real action pushes a second entry. Now undo requires two presses:

1. **First undo** → pops the phantom `delete-table` entry → tries to CREATE TABLE (may fail silently if table still exists, or succeed awkwardly)
2. **Second undo** → pops the real entry → actual operation is reversed

This is the root cause of the "two undos needed" experience for table deletion.

### Bug: `edit-column` Undo Does Not Capture Metadata

When the column editor saves, `setColMeta()` is called for description and displayField **before** the `pushUndo('edit-column')` call:

```js
// line 2428-2430
setColMeta(selectedTable, oldName, 'description', newDesc || null);
setColMeta(selectedTable, oldName, 'displayField', newDisplayField || null);

// ... check if schema changed ...

if (typeChanged || requiredChanged || defaultChanged || nameChanged) {
  // ...
  pushUndo('edit-column', { tableName: selectedTable, oldColDefs: oldCols, oldFks: oldFks });  // ← NO metadata in here!
```

The undo entry only stores `oldColDefs` (column names, types, notnull, pk, default) and `oldFks` (foreign keys). It does **not** store the old description or displayField values. When the user undoes an edit-column:

1. Schema is restored via `rebuildTable()`
2. But description and displayField metadata **remain changed**
3. The UI still shows the new description → user thinks undo "didn't fully work"

Additionally, unique indexes are not captured in the undo entry. If a unique index was added/removed as part of the column edit, undoing the schema won't restore the old index state.

### Bug: `edit-column` Undo Does Not Restore Relationship Field References

When a column is renamed, the save handler updates relationship references in memory and meta (line ~2478):

```js
if (nameChanged) {
  relationships.forEach(function (rel) {
    var changed = false;
    if (rel.fromTable === selectedTable && rel.fromField === oldName) { rel.fromField = newName; changed = true; }
    if (rel.toTable === selectedTable && rel.toField === oldName) { rel.toField = newName; changed = true; }
    // ...
    if (changed) metaSet('rel:' + rel.id, JSON.stringify(rel));
  });
}
```

But the undo handler for `'edit-column'` only calls `rebuildTable()` with the old column definitions — it does **not** revert the relationship field references back to the old name. So after undoing a column rename, the schema is restored but relationships still point to the new (now non-existent) column name.

### Summary of Remaining Issues

1. **Phantom undo entries from `confirmDeleteTable`** — undo pushed before user confirmation causes cancel to leave a stale entry, requiring extra undo presses.
2. **`edit-column` undo is incomplete** — does not capture old metadata (description, displayField), unique index state, or relationship field references.
3. **Many operations have no undo at all** — table create/rename/duplicate, row add, cell edits, column hide/reorder, metadata-only changes. These create gaps in the undo history, making it unreliable.
4. **No `redoStack`** — unlike the diagram app, the database app has no redo capability at all. Once undone, the action cannot be reapplied.
5. **Stack is limited to 10 entries** — hardcoded in `pushUndo()` (line 185: `if (undoStack.length > 10) undoStack.shift()`). No feedback when entries are dropped.

**Verdict:** The undo system for the database app does not fully solve the "two presses needed" problem. The phantom entry bug in `confirmDeleteTable` directly causes it for table deletion, while the incomplete `edit-column` undo makes undoing feel unreliable across all column operations.

---

## Complete Resolution Plan

This section defines the technical path to a correct, predictable undo system across **both** apps. The guiding principles are:

1. **Every discrete move, resize, create, delete, and property/style change is its own undo entry.** No operation should be silently bundled into another, and no operation should be missing from the undo stack.
2. **Selection is never an undo-able action.** Selecting/deselecting shapes, rows, or columns must never push an undo entry, and must never be part of the state a `pushUndo()` snapshot diffs against.
3. **An undo entry is only pushed for a *committed, value-changing* action.** No entry is pushed for pointer-down, click-without-drag, or opening a confirmation dialog.
4. **Undo must fully reverse the action it represents** — schema, metadata, and relationship references must all round-trip together, not partially.

### 1. Diagram App — Formalize the "commit, not intent" rule

The diagram app already fixed the literal move/resize double-undo bug (see `pointerup`, line ~1867: it now checks `_didChange` before calling `pushUndo()`). The remaining work is to apply that **same discipline** everywhere else so every property change is individually undo-able:

**Rule:** `pushUndo()` may only be called at the point a change is *committed* (pointerup, blur, change event, button click that performs the action) — never at the point a change is *started* (pointerdown, focus, input event while typing). This is already correctly followed for move/resize; it must be extended to styles and structural actions that currently only call `scheduleSave()`.

**Concrete changes needed in `/Users/bflbarlow/Websites/diagram/app.js`:**

| Function | Current behavior | Fix |
|----------|------------------|-----|
| `addShape()` (line 807) | Only `scheduleSave()` | Add `pushUndo()` immediately after `S.shapes.push(s)` |
| `addConn()` (line 836) | Only `scheduleSave()` | Add `pushUndo()` immediately after `S.connections.push(c)` |
| `deleteShape()` (line 852) | Only `scheduleSave()` | Add `pushUndo()` immediately after the filter/splice |
| `deleteConn()` (line 861) | Only `scheduleSave()` | Add `pushUndo()` immediately after the filter |
| `applyStyleToSelected()` (line 1344) | Only `render()` (no save, no undo) | Push **one** undo entry per *commit*, not per keystroke — see pattern below |
| Rename shape (propNameInput handler) | Only `scheduleSave()` | Add `pushUndo()` on `change`/`blur`, not on `input` |
| Canvas size / project name change | Only `scheduleSave()` | Add `pushUndo()` on `change`, not on `input` |
| z-height / grid / snap toggles | Only `scheduleSave()` | Add `pushUndo()` at the point the toggle is applied |

**Pattern for style controls (fill, stroke, opacity, text color, font size, etc.):**

These are bound to `<input type="color">` / `<input type="range">` / `<select>` elements which fire many `input` events while the user drags a slider or picks a color, but only one meaningful `change` event when they let go / confirm. Undo must be tied to `change`, not `input`, mirroring how drag/resize is tied to `pointerup`, not `pointermove`:

```js
// Before (line ~2317 and surrounding style inputs):
fillInput.addEventListener('change', function() { scheduleSave(); });

// After — apply the style AND commit one undo entry per change event:
fillInput.addEventListener('change', function() {
    applyStyleToSelected('fill', fillInput.value);
    pushUndo();
});
```

Apply the same `change`-only pattern to every `propX.addEventListener('change', ...)` call currently only calling `scheduleSave()` (fill, stroke, stroke width, opacity, fill/stroke opacity, text color, font size, text padding, custom SVG code/viewBox). Do **not** attach `pushUndo()` to `input` events on these controls — that would recreate the diagram app's original bug (many spurious entries per single logical change) for sliders/color pickers instead of clicks.

**Selection must remain undo-free:** `select()` and any function that only mutates `S.selection` must never call `pushUndo()` or `scheduleSave()`. Audit `select()`, `shapeSel()`, and marquee-selection (`isSelecting`) code paths to confirm no undo/save call exists on the selection path alone — selection changes should be purely transient UI state, not part of `{shapes, connections}` snapshots.

### 2. Database App — Convert Every Mutating Action to a Paired Undo Entry

The database app's action-log undo (`pushUndo(action, data)`, line 184) is the right shape, but three structural problems must be fixed:

**a) Move the undo push to the point of actual commitment, not before confirmation.**

`confirmDeleteTable()` (line 2053) must stop pushing undo before the modal opens. Move the `pushUndo('delete-table', ...)` call into `deleteTable()` itself (or into the `pendingCallback`), so it only fires when the user actually confirms:

```js
function confirmDeleteTable(name) {
    modal.confirmTitle.textContent = 'Delete table "' + name + '"?';
    modal.confirmMsg.textContent = 'This permanently deletes the table and all its data.';
    modal.confirm.classList.add('open');
    pendingCallback = function () {
        // Gather undo data and push it HERE, at confirm time — not at dialog-open time
        if (db) {
            try {
                var result = db.exec("SELECT * FROM " + escId(name) + " ORDER BY rowid;");
                var schemaResult = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='" + name.replace(/'/g,"''") + "';");
                var createSql = (schemaResult.length && schemaResult[0].values.length) ? schemaResult[0].values[0][0] : null;
                var cols = getTableColumns(name);
                if (createSql) pushUndo('delete-table', { tableName: name, createSql: createSql, backup: (result.length && result[0].values.length) ? result[0].values : [], cols: cols, selectedBefore: selectedTable });
            } catch (e) { /* */ }
        }
        deleteTable(name);
    };
}
```

This eliminates phantom entries from cancelled confirmations entirely, and is the direct fix for the "two undos needed" symptom on table deletion.

**b) Give every currently-silent mutation its own `pushUndo()` call**, so each is individually reversible:

| Function | Add |
|----------|-----|
| `createTable()` | `pushUndo('create-table', { tableName: name })` — undo handler runs `deleteTable(name)` |
| `renameTable()` | `pushUndo('rename-table', { oldName: oldName, newName: newName })` — undo handler renames back |
| `duplicateTable()` | `pushUndo('duplicate-table', { tableName: destName })` — undo handler drops `destName` |
| `addEmptyRow()` | `pushUndo('add-row', { tableName: selectedTable, rowid: <new rowid> })` — undo handler deletes that row |
| Cell inline-edit commit (blur handler) | `pushUndo('edit-cell', { tableName, rowid, colName, oldValue })` — undo handler writes `oldValue` back |
| Column hide/unhide | `pushUndo('hide-col' / 'unhide-col', { tableName, colName })` — undo handler toggles back |
| Column reorder (`setColOrder`) | `pushUndo('reorder-col', { tableName, oldOrder })` — undo handler restores `oldOrder` |
| Metadata-only column edit (description/displayField with no schema change) | `pushUndo('edit-col-meta', { tableName, colName, oldDescription, oldDisplayField })` |

Each of these is a single committed action (a click, a blur, a modal confirm) — exactly one `pushUndo()` call per action, matching the "every move/property change individually undo-able" requirement.

**c) Make `edit-column` and `delete-column` undo entries complete.**

Currently `pushUndo('edit-column', { tableName, oldColDefs, oldFks })` omits metadata and relationship references. Extend the captured data and the undo handler to round-trip everything the save handler can change:

```js
// At commit time — capture everything that could change:
var oldDescription = getColMeta(selectedTable, oldName, 'description');
var oldDisplayField = getColMeta(selectedTable, oldName, 'displayField');
var oldUnique = /* query sqlite_master for existing unique index on this column */;
var oldRelRefs = relationships
    .filter(function(r) { return (r.fromTable === selectedTable && r.fromField === oldName) ||
                                  (r.toTable === selectedTable && r.toField === oldName); })
    .map(function(r) { return { id: r.id, fromField: r.fromField, toField: r.toField }; });

pushUndo('edit-column', {
    tableName: selectedTable, oldColDefs: oldCols, oldFks: oldFks,
    oldName: oldName, oldDescription: oldDescription, oldDisplayField: oldDisplayField,
    oldUnique: oldUnique, oldRelRefs: oldRelRefs
});
```

```js
// In undoLastAction(), case 'edit-column':
case 'edit-column':
    rebuildTable(entry.data.tableName, entry.data.oldColDefs, entry.data.oldFks || []);
    setColMeta(entry.data.tableName, entry.data.oldName, 'description', entry.data.oldDescription);
    setColMeta(entry.data.tableName, entry.data.oldName, 'displayField', entry.data.oldDisplayField);
    if (entry.data.oldUnique) { /* re-create the unique index */ }
    (entry.data.oldRelRefs || []).forEach(function (ref) {
        var rel = relationships.find(function (r) { return r.id === ref.id; });
        if (rel) { rel.fromField = ref.fromField; rel.toField = ref.toField; metaSet('rel:' + rel.id, JSON.stringify(rel)); }
    });
    renderRelationships();
    notify('Undo: field restored.', 'success');
    break;
```

**d) Selection must remain undo-free in the database app too.** `selectTable()` (row/table selection) and `selectRow()` must never call `pushUndo()`. Confirmed by code review: neither currently does — this must remain true as new undo entries are added, and any new code added under (b)/(c) must not fire on selection-only interactions (e.g. clicking a row to select it vs. clicking a cell to edit it are different code paths and must stay that way).

### 3. Shared Safeguard — Automated Regression Check

To prevent regressions in both apps, add a lightweight manual QA checklist (or scripted test where feasible) that exercises the following for every action type: **click-select only → 0 undo entries created**; **one committed change → exactly 1 undo entry created**; **1 undo press → exactly reverses that 1 change with no residual state (metadata, relationships, indexes) left behind**. This should be re-run whenever a new mutating action is added to either app, since the root cause of every bug found above is a mutation that was added without updating the undo path alongside it.

### 4. Add Redo Support to the Database App

Since the diagram app already has `redo()` (line 796) built on the same `pushUndo()` calls, once every database-app mutation pushes a proper `{action, data}` undo entry (per section 2), redo can be added symmetrically: introduce a `redoStack`, and on `undoLastAction()` push the *inverse* of the entry being undone onto `redoStack` before applying it, then implement `redoLastAction()` that pops from `redoStack`, re-applies the forward action, and pushes the original entry back onto `undoStack`. This is deferred until sections 1–2 are complete, since redo correctness depends on every undo entry being complete and self-contained.

---

## Follow-Up Review: The Fix Was Only Partially Applied, and Introduced a New Double-Push Bug

**Status: the diagram app still exhibits a "two things to undo" problem after the plan in this document was implemented.** A fresh code review of the current `/Users/bflbarlow/Websites/diagram/app.js` confirms the user's report is correct — what was built does not fully work. There are two distinct, still-open problems.

### 4a. `addShape()` / `addConn()` / `deleteShape()` / `deleteConn()` now push undo TWICE per action

The resolution plan (Section 1) said to add `pushUndo()` **inside** `addShape()`, `addConn()`, `deleteShape()`, and `deleteConn()` so each is individually undo-able. That change **was made**:

```js
// line 807-830 — addShape()
S.shapes.push(s);
pushUndo();                     // <-- added per the plan
logAction('Created '+s.name, 'add');

// line 836-849 — addConn()
S.connections.push(c);
pushUndo();                     // <-- added per the plan
logAction('Connected ...', 'add');

// line 852-859 — deleteShape()
...
pushUndo();                     // <-- added per the plan
if (s) logAction('Deleted '+s.name, 'del');

// line 861-866 — deleteConn()
...
pushUndo();                     // <-- added per the plan
logAction('Deleted '+connName(id), 'del');
```

**But every call site that invokes these functions was never updated to remove its own, now-redundant `pushUndo()` call.** The old call sites still call `pushUndo()` a second time right after calling `addShape`/`addConn`/`deleteShape`/`deleteConn`. Confirmed still present in the current code:

| Call site | Line (approx.) | Calls | Redundant push? |
|---|---|---|---|
| Text tool click | ~1608 | `addShape()` then `pushUndo()` | Yes — 2 entries for 1 shape |
| Drag-to-create shape (tiny drag) | ~1989 | `addShape()` then `pushUndo()` | Yes |
| Drag-to-create shape (normal drag) | ~2005 | `addShape()` then `pushUndo()` | Yes |
| Line tool commit | ~2045 | `addShape()` (x0–2), `addConn()`, then `pushUndo()` | Yes — up to 4 entries for 1 connection |
| Click-to-place pending shape | ~2191 | `addShape()` then `pushUndo()` | Yes |
| `btn-delete` handler | ~2210 | `deleteShape()`/`deleteConn()` (each already pushes) then `pushUndo()` again | Yes |
| Context menu delete/duplicate/etc. | ~2803 | `deleteShape()`/`dup()` then `pushUndo()` | Yes |
| `Delete`/`Backspace` keydown | ~2820 | `deleteShape()`/`deleteConn()` (each already pushes) then `pushUndo()` again | Yes |

**Net effect:** creating or deleting a single shape via the toolbar, drag-to-draw, or Delete key now pushes **two** undo snapshots for one logical action (three or four for a line-tool connection, since `addShape()` is called once or twice for anchor points before `addConn()` is called). This is the direct, still-present cause of "two things having to be undone" — not a perception issue, but a real duplicate-entry bug, and arguably worse than the original single point noted in the "Verified Bug" section above, because it now affects create/delete of every shape and connection, not just clicks.

### 4b. `dup()` and `pasteClipboard()` were never given their own `pushUndo()`, but their callers still push once — masking a second, opposite gap

Unlike `addShape`/`deleteShape`, the plan's table for `dup()` (line 868) and `pasteClipboard()` (line 902) does not list them as needing an internal `pushUndo()`, and indeed neither function calls it internally today. Every caller of `dup()`/`pasteClipboard()` still adds exactly one `pushUndo()` after the loop (`btn-duplicate` ~2204, `Ctrl+D` ~2847, `Ctrl+V` ~2846, context-menu duplicate ~2803). That part is correct and NOT double-pushed.

However, this inconsistency — some primitives (`addShape`, `addConn`, `deleteShape`, `deleteConn`) push their own undo internally while sibling primitives (`dup`, `pasteClipboard`, `toFront`/`toBack`/`forward`/`backward`) do not — means every call site has to be individually re-audited to know whether it should still call `pushUndo()` itself. That audit was not done. The result is the inconsistent, partially-doubled state described in 4a: some call sites correctly assume the primitive already pushed (none currently do this correctly for `addShape`/`deleteShape`/etc.), while others still add a redundant call.

### 4c. `applyStyleToSelected()` style-drag path still has a latent multi-push risk

Section 1's prescribed pattern ("apply on `input`, `pushUndo()` only on `change`") **was implemented correctly** for the single-shape style inputs (`fillInput`, `strokeInput`, `swInput`, `opacityInput`, `textColorInput`, and their `prop*` panel twins at lines ~2317–2399). Each fires exactly one `pushUndo()` per `change` event, with no double call. This part of the plan **did work as intended** and is not part of the remaining bug.

### 4d. Why the user still sees "two things to undo"

Given 4a, the reproducible symptom today is:

1. User creates a shape (toolbar click, drag-to-draw, or the text tool) → **two** undo-stack entries are pushed for that one shape (one from inside `addShape()`, one from the call site).
2. User presses Undo once → pops the second (identical, redundant) snapshot → nothing visibly changes, because the state before and after that entry is the same.
3. User has to press Undo a **second** time to actually remove the shape.

The same doubling applies symmetrically to deletion (`deleteShape`/`deleteConn` plus the caller's own `pushUndo()`), and is worse (3–4x) for line-tool connections, which internally call `addShape()` for each unresolved anchor endpoint plus `addConn()`, each pushing its own snapshot, on top of the call site's final `pushUndo()`.

### 4e. Required fix (not yet applied)

Pick exactly one layer to own the `pushUndo()` call per action, and remove it from the other:

- **Option A (recommended, matches the plan's original intent):** keep `pushUndo()` inside `addShape()`, `addConn()`, `deleteShape()`, `deleteConn()`, and **remove** the redundant `pushUndo()` call from every call site listed in the table in 4a. Multi-step actions (line tool creating 0–2 anchor shapes + 1 connection; bulk delete of several selected shapes/connections) will then need `S.suppressUndo` guard or a `beginBatch()/endBatch()` pattern so that e.g. a single line-tool commit still results in exactly **one** undo entry covering all of the anchors + the connection together, not three or four separate entries.
- **Option B:** revert `addShape`/`addConn`/`deleteShape`/`deleteConn` to not call `pushUndo()` internally at all, and rely solely on each call site's existing `pushUndo()` — this restores the pre-fix single-push behavior but reintroduces the original gap this document set out to close (some call sites, if any are added later without a trailing `pushUndo()`, would silently become non-undoable again).

Either option requires an explicit sweep of every call site in the table above; this has not been done, and until it is, the diagram app's undo system will continue to require two (or more) undo presses for a single create or delete action, exactly as the user reports.
