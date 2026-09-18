# Z-Height Uniqueness — Technical Analysis

**Status:** Analysis / pre-implementation
**Scope:** `app.js` (v1.1.5, 3,657 lines), `index.html`, `styles.css`
**Goal:** Guarantee that no two stackable elements (shapes, lines/connections, and
anything added later) ever share the same z-height.

---

## 1. Requirement and invariant

Let `E` be the set of all z-participating elements (every shape and every
connection), and `z(x)` the stored `zHeight` of element `x`.

> **INVARIANT (required):** `z` is injective over `E` — for all `a ≠ b` in `E`,
> `z(a) ≠ z(b)`. Ordering is ascending: a higher `zHeight` renders on top.

The current code does **not** satisfy this invariant. It satisfies a weaker,
*render-time* invariant only: `computeZOrder()` produces a dense, unique DOM
`z-index` for the current frame, but the persisted `zHeight` values on the
objects routinely collide (in the default demo alone, all 6 shapes share
`zHeight: 0`).

This distinction is the crux of the whole analysis: **the DOM stack is unique;
the data model is not.**

---

## 2. Current model, as built

### 2.1 Data

| Element | Field | Default | Source |
|---|---|---|---|
| Shape | `zHeight` (int) | `0` | `addShape()`, `app.js:971` |
| Connection | `zHeight` (int) | `connDefaultZ(from,to)` = max endpoint shape z | `addConn()`, `app.js:994` |
| Legacy connection (pre-change file) | `zHeight` undefined | derived at read time | `getConnZHeight()`, `app.js:1404` |

There is no uniqueness enforcement anywhere: no normalization pass, no
allocation counter, no collision check on write, no validation on load/import.

### 2.2 Read / sort paths

| Location | What it does | Tie-break |
|---|---|---|
| `findNearestShape()` `app.js:402-407` | sorts shapes desc by z for hit priority | array index |
| `renderLayouts()` `app.js:1325-1331` | sorts shapes asc by z for Layers list | array index |
| `renderShapes()` `app.js:1431-1438` | sorts visible shapes asc by z for DOM order | array index |
| `computeZOrder()` `app.js:1411-1429` | merges shapes + connections, assigns DOM `z-index` `1..N` | `conn` before `shape`, then array index |
| `connDefaultZ()` `app.js:1397` | derives a connection default from endpoints | — |

Every one of these relies on a tie-break because ties are the normal case, not
the exception.

### 2.3 Write paths (the collision surface)

| Location | Operation | Collision behaviour |
|---|---|---|
| `addShape()` `app.js:971` | new shape | **always `0`** → collides with every default shape |
| `addConn()` `app.js:994` | new line | takes an endpoint's z → **collides with that shape by design** |
| `dup()` `app.js:1017-1029` | duplicate shape | `JSON.parse(JSON.stringify(o))` copies `zHeight` → collides with original |
| `copySelection()` / `pasteClipboard()` `app.js:1031-1083` | copy/paste | clones `zHeight` verbatim → collides with source |
| `propZHeight` change `app.js:2964-2973` | type a Z | accepts any int; no check |
| `.layer-z` change `app.js:2990-3003` | type a Z | accepts any int; no check |
| `connZInput` change `app.js:3140-3153` | type a Z | accepts any int; no check |
| `toFront()` `app.js:1086` | max **shape** z + 1 | ignores connections; repeat calls can still collide if values jump |
| `toBack()` `app.js:1094` | min **shape** z − 1, seeded at `0` | two "send to back" on distinct shapes can both land on `-1` |
| `forward()` `app.js:1102` | `z + 1` | can land on an occupied value |
| `backward()` `app.js:1108` | `z − 1` | can land on an occupied value |
| load `app.js:576` / import `app.js:3288+` | restore JSON | trusts file values; no normalization |
| `undo()` / `redo()` `app.js:934-951` | restore snapshot | restores whatever was stored, including collisions |
| demo seed `app.js:3612-3614` | creates 6 lines | every line derives `0` → collides with every shape |

### 2.4 Rendering

`computeZOrder()` is a *band-aid over* the collision problem, not a fix:

```js
// app.js:1411 (current)
function computeZOrder() {
    var entries = [];
    S.shapes.forEach(... z: s.zHeight || 0 ...);
    S.connections.forEach(... z: getConnZHeight(c) ...);
    entries.sort(function (a, b) {
        if (a.z !== b.z) return a.z - b.z;
        if (a.kind !== b.kind) return a.kind === 'conn' ? -1 : 1; // hidden policy
        return a.order - b.order;                                 // hidden policy
    });
    // map id -> 1..N
}
```

Two *implicit* ordering policies live only here, in tie-breaks that will
silently disappear once the invariant holds:

1. **Connections render below shapes at the same z** (`conn` before `shape`).
2. **Array creation order breaks remaining ties.**

If uniqueness is enforced but these policies are not promoted into the stored
value, the visual result of enforcing uniqueness will be decided by whatever
`normalize` tie-break is chosen — and could differ from today's rendering.

---

## 3. Why the render-level fix is insufficient

`computeZOrder()` guarantees a sane *frame*, but it cannot fix:

1. **UI lies.** The Properties panel and Layers panel show the raw colliding
   values (`propZHeight`, `.layer-z`, `conn-zHeight`). Two elements show `Z 0`.
2. **Reorder commands are wrong.** `forward()`/`backward()` do `±1` on the raw
   value. With three shapes at `0`, "bring forward" gives `1`, then `1` again
   for the next, and relative order is decided by array index, not by the
   command.
3. **`toFront`/`toBack` ignore connections.** A line can never be "sent to
   back" relative to shapes, and shape ordering ignores line z entirely.
4. **Portability.** Exported files contain duplicates; importing into a future
   strict renderer would need the same band-aid.
5. **Reasoning.** Users cannot look at two elements and know which is on top
   from their `Z` values alone.

---

## 4. Design options

### Option A — Dense global ranks + normalize after mutation (recommended, incremental)

Treat `zHeight` as a **rank**, not an arbitrary key. Keep it stored per object,
but after every structural or z mutation, reassign the set `{0,1,…,N-1}` to the
elements in their current order.

- **Pros:** Small diff; no new persisted structure; invariant is provable;
  `forward`/`backward`/`toFront`/`toBack` become trivial; render tie-breaks
  become dead code.
- **Cons:** Any edit can renumber unrelated elements (the value is a position,
  so `100` snaps to `N-1`); noisy JSON diffs; the "type an absolute value"
  affordance changes meaning.
- **Mitigation:** Present Z as an ordinal ("position in stack"), clamp inputs to
  `0..N-1`, and add up/down buttons.

### Option B — Sparse unique keys + insertion/shift

Keep arbitrary unique integers. New elements allocate `maxZ+1`. Moving an
element to a target value removes it, shifts the occupied range to open a gap,
and inserts.

- **Pros:** Preserves most user values; only a suffix shifts on insert; gaps are
  allowed so delete is free.
- **Cons:** Much more complex move/insert logic; unbounded gap growth needs
  periodic compaction; "insert just below a shape" requires capturing the
  reference z before shifting it.
- **Best when:** absolute z values are a product requirement (e.g., parallax
  layers, z as a semantic depth in world units).

### Option C — Single ordered id list; `zHeight` derived

Make the canonical state `S.zOrder = [id, id, …]` spanning shapes + connections.
`zHeight` is the array index, computed on read.

- **Pros:** Uniqueness is structurally impossible to violate; reorder is
  `splice`; no normalize pass; no per-object drift.
- **Cons:** Largest refactor; new persisted field + reconciliation on load;
  every current `zHeight` reader must change; hidden/anchor handling must be
  defined.
- **Best when:** the app is willing to do a one-time refactor for a permanent
  invariant.

### Option D — Fractional indexing (midpoint keys)

`zHeight` becomes a float/string; insert between neighbors by averaging.

- **Pros:** O(1) insert, no renumbering.
- **Cons:** Breaks the integer number input UX; precision rebalancing still
  needed; float noise; overkill here.

### Comparison

| Criterion | A (dense) | B (sparse) | C (list) | D (fractional) |
|---|---|---|---|---|
| Guarantees uniqueness structurally | ✅ (post-pass) | ✅ | ✅ | ~ (until precision) |
| Diff size | small | medium | large | medium |
| Preserves absolute values | ✗ | ✅ | ✗ | ✅ |
| Reorder complexity | low | medium | low | low |
| Persistence change | none | none | new `zOrder` | none (type change) |
| Fits current codebase | ✅✅ | ✅ | ✅ | ✗ |

**Recommendation: Option A now, Option C later if rank churn becomes painful.**
Option A gives the requested guarantee with the least risk, and it makes the
existing `computeZOrder()` tie-breaks redundant.

---

## 5. Recommended design (Option A)

### 5.1 Canonical ordering

One function is the single source of truth for "what order is everything in":

```js
// Deterministic order used by every sort and by normalization.
// Primary: current zHeight (effective, incl. connection default).
// Tie-break (only matters before the first normalize / for legacy data):
//   connections below shapes, then creation index.
function zElementList() {
    var list = [];
    S.shapes.forEach(function (s, i) {
        list.push({ kind: 'shape', obj: s, id: s.id, z: s.zHeight || 0, order: i });
    });
    S.connections.forEach(function (c, i) {
        if (!connEndpoints(c)) return; // orphaned
        list.push({ kind: 'conn', obj: c, id: c.id, z: getConnZHeight(c), order: i });
    });
    list.sort(function (a, b) {
        if (a.z !== b.z) return a.z - b.z;
        if (a.kind !== b.kind) return a.kind === 'conn' ? -1 : 1;
        return a.order - b.order;
    });
    return list;
}
```

### 5.2 Normalization

```js
// Enforce: zHeight values are exactly {0..N-1}, unique, ascending by stack order.
function normalizeZHeights() {
    var list = zElementList();
    list.forEach(function (e, rank) {
        e.obj.zHeight = rank;          // rank 0 = bottom, N-1 = top
    });
}
```

`normalizeZHeights()` must run:

- once at the end of `loadFromLocalStorage()` and the file-import handler,
  after backfilling legacy connection z;
- after **every** mutation that creates, deletes, duplicates, pastes, or
  reorders an element;
- before `pushUndo()` so snapshots are already normalized.

### 5.3 Movement primitives (rank-based)

With normalization, reorder no longer manipulates `zHeight` arithmetic:

```js
function zIndexOf(id)        { return zElementList().findIndex(e => e.id === id); }

function moveZToRank(id, rank) {
    var list = zElementList();
    var from = list.findIndex(e => e.id === id);
    if (from < 0) return;
    var to = clamp(rank, 0, list.length - 1);
    var [el] = list.splice(from, 1);
    list.splice(to, 0, el);
    list.forEach(function (e, i) { e.obj.zHeight = i; });
}

function stepZ(id, dir)      { moveZToRank(id, zIndexOf(id) + dir); }
function toFront(id)         { moveZToRank(id, zElementList().length - 1); }
function toBack(id)          { moveZToRank(id, 0); }
```

All four current functions (`toFront`, `toBack`, `forward`, `backward`)
collapse into `moveZToRank`; the `±1`/`min-1`/`max+1` logic is deleted.

### 5.4 Allocation for new elements

- **New shape:** `normalizeZHeights()` after `S.shapes.push(s)`. The shape's
  initial `zHeight` is irrelevant; its position in the array determines its
  rank among ties. To preserve today's "new shape near the bottom" feel, push
  then normalize and optionally `moveZToRank(s.id, 0)`.
- **New connection:** this is the hard case — see §6.

### 5.5 Rendering simplification

Once unique, `computeZOrder()` reduces to "sort and assign `0..N-1`", which is
exactly `normalizeZHeights()` + direct assignment. The renderer can set
`el.style.zIndex = obj.zHeight + 1` (offset to keep it ≥ 1) and drop the
tie-break branches. Keep `computeZOrder()` only if you want a defensive
recompute for frames where state was mutated without normalizing.

---

## 6. The connection-default problem (key consequence)

Today a new line's default z equals the **max z of its two endpoint shapes**,
which intentionally makes it render *just below* the topmost shape it connects
(§2.4 tie-break #1). Under strict uniqueness this default is now **illegal** —
it collides with that shape by construction.

Options, in order of fidelity to today's look:

1. **Insert just below the topmost endpoint.** Capture the endpoint's current
   rank `r`, shift every element at rank `≥ r` up by one, and place the line at
   `r`. Preserves "line tucks under the shape."
2. **Insert just above the topmost endpoint.** Line draws over the shape it
   connects. Changes the look.
3. **Append to top** (rank `N-1`). Simple, but lines will cover shapes.
4. **Prepend to bottom** (rank `0`). Simple, but lines will hide behind
   unrelated shapes.

Recommendation: **option 1**, implemented as an `insertZBelowShape(conn, shape)`
helper built on `moveZToRank`. Note this shifts other elements' z by one — which
is acceptable under rank semantics and must be reflected in the panel.

Free-drawn lines whose endpoints are internal **anchor shapes** have no
meaningful reference shape; default them to rank `0` (bottom) or just above the
anchor's rank.

---

## 7. Anchors, hidden elements, and scope of `E`

The invariant needs an explicit domain, because this app has two categories of
"invisible" shapes:

- **Hidden shapes** (`s.hidden === true`, toggled in Layers). Recommendation:
  **include them in `E`.** Otherwise a hidden shape and a visible one could share
  z, and unhiding would silently break the invariant.
- **Anchor shapes** (`s.isAnchor === true`; created automatically when a line
  endpoint is detached or drawn on empty canvas — `app.js:2146`, `2468`, `2476`).
  These are implementation details, not user objects. Two choices:
  - **(a) Include them.** Simplest; but every detached endpoint consumes a z
    rank and shifts user-visible values on normalize. Confusing.
  - **(b) Exclude them from `E`.** Give anchors `zHeight = null` and render them
    at their connection's z (or just below it). Requires the renderer and
    `zElementList()` to special-case `isAnchor`. **Recommended.**

Decision needed from product before implementation.

---

## 8. Migration and persistence

### 8.1 Legacy data

Existing `diagram-state` in localStorage and imported `.json` files contain
duplicates (typically many `0`s) and connections with no `zHeight`. Migration:

1. Backfill missing connection `zHeight` with `connDefaultZ(from,to)` (already
   done lazily by `getConnZHeight`; make it explicit on load).
2. Run `normalizeZHeights()` once. The deterministic tie-break in
   `zElementList()` defines the migration order:
   `(effective z, connections-before-shapes, creation index)`.
3. Persist the normalized result on the next `saveState()`.

This will change the numeric Z of every existing element but preserves relative
stacking. Document it in the changelog.

### 8.2 Persistence

No schema change is strictly required for Option A — `zHeight` stays on each
object. Persist normalized values (normalize before `saveState()`), so files on
disk always satisfy the invariant.

### 8.3 Multi-tab sync

`storage` events call `loadFromLocalStorage()` (`app.js:624+`). Normalization
must run there too, so a read-only tab never renders a colliding state. Because
`saveState()` already writes normalized data, this is mostly a no-op — but the
call must exist for imported/legacy payloads.

---

## 9. Undo / redo

`pushUndo()` snapshots `{shapes, connections}` (`app.js:907`). If normalization
runs *after* a mutation but *before* `pushUndo()`, every snapshot is normalized,
undo/redo restore normalized states, and redo cannot reintroduce a collision.

Rule: **mutate → normalize → pushUndo**. Never normalize inside `undo()`/`redo()`
(the snapshot is already valid, and re-normalizing would make redo diverge from
the forward edit).

One subtlety: `pushUndo()` is called from many handlers *after* mutation (e.g.
`connZInput` `app.js:3150`, `propZHeight` `app.js:2971`). Those call sites must
gain a `normalizeZHeights()` before `pushUndo()` (or `pushUndo()` itself can
normalize as a defensive choke point — simpler and safer, at the cost of doing
it on non-z mutations too).

---

## 10. UI / UX implications

1. **Z is now an ordinal, not a free number.** Inputs should clamp to
   `0..N-1` and reflect renumbering immediately after any edit.
2. **Duplicate entry.** If a user types a value already taken, define the
   result: recommended is "move this element to that rank, shift others"
   (`moveZToRank`), which is intuitive.
3. **Layers panel lists only shapes** (`renderLayouts()` `app.js:1325`). To make
   line z coherent, either:
   - add connections to the Layers list (with a line icon and their own z
     input), or
   - keep the panel shape-only but accept that line reordering happens only via
     the Properties panel and that line z values shift when shapes reorder.
   Recommendation: add connections to the Layers list; it is the natural place
   to see a single global stack.
4. **Up/down buttons** are a better fit than raw integer entry under rank
   semantics and remove the duplicate-entry question entirely.
5. **`toFront`/`toBack`/`forward`/`backward` in the context menu** currently
   apply to shapes only (`app.js:3359-3362`). Under a unified model they should
   operate on whichever element is selected, including connections.

---

## 11. Change matrix (function-by-function)

| Function / site | Current | Required |
|---|---|---|
| `addShape()` `954` | `zHeight: 0` | drop literal; push then normalize (optionally move to bottom) |
| `addConn()` `984` | `zHeight: connDefaultZ(...)` | insert relative to endpoint via `insertZBelowShape` / rank allocation |
| `deleteShape()` `1001` | removes shape + conns | normalize after removal |
| `deleteConn()` `1010` | removes conn | normalize after removal |
| `dup()` `1017` | clones `zHeight` | clone then normalize (assign unique rank) |
| `copySelection()` `1031` | clones z into clipboard | fine (clipboard is a template) |
| `pasteClipboard()` `1051` | inserts clones with same z | normalize after insertion |
| `toFront/toBack/forward/backward` `1086-1112` | arithmetic on shapes only | replace with `moveZToRank` over all elements |
| `findNearestShape()` `402` | sorts shapes by z, index tie-break | keep; tie-break becomes dead but harmless |
| `renderLayouts()` `1325` | shapes only; `.layer-z` input | include connections; clamp/normalize on edit |
| `connDefaultZ()` `1397` | returns endpoint z (collides) | repurpose as *insertion reference*, not a stored value |
| `getConnZHeight()` `1404` | lazy fallback for legacy | keep for migration; after normalize every conn has a value |
| `computeZOrder()` `1411` | tie-break merge | simplify to sort + assign; or call `normalizeZHeights` |
| `renderShapes()` `1431` | sort + map z-index | use normalized rank + 1 |
| `renderConns()` `1491` | sort + map z-index | use normalized rank + 1 |
| `syncStyleControlsToConn()` `1552` | shows effective z | show normalized rank |
| `propZHeight` listener `2964` | raw assign | `moveZToRank` |
| `.layer-z` listener `2990` | raw assign | `moveZToRank` |
| `connZInput` listener `3140` | raw assign | `moveZToRank` |
| `loadFromLocalStorage()` `576` | raw restore | backfill + normalize |
| import handler `3288+` | raw restore | backfill + normalize |
| `pushUndo()` `907` | snapshot raw | normalize (defensive) before snapshot |
| `saveState()` `458` | persists raw | persists normalized (guaranteed by above) |
| demo seed `3612-3614` | 6 lines all derive `0` | normalize after seeding |

---

## 12. Testing plan

1. **Invariant property test.** Generate random sequences of
   create/duplicate/paste/delete/front/back/forward/backward/typed-z/undo/redo
   on a mixed shape+connection set; assert after every step that the multiset of
   `zHeight` over all elements has no repeats and equals `{0..N-1}`.
2. **Unit tests** for `zElementList`, `normalizeZHeights`, `moveZToRank`,
   `insertZBelowShape`, including: empty set, single element, ties, orphaned
   connections (endpoint shape deleted), anchors, hidden shapes.
3. **Migration fixtures.** JSON with all-zero shapes, connections missing
   `zHeight`, connections sharing a shape's z, negative z, sparse z; assert
   deterministic post-migration order and uniqueness.
4. **Regression.** Load the current demo; confirm the visible stacking matches
   today's `computeZOrder` output before normalization (i.e., migration is
   visually stable).
5. **Persistence round-trip.** Save → reload → assert identical normalized
   values and order.
6. **Multi-tab.** Simulate `storage` event with a legacy payload; assert the
   read-only tab normalizes before render.

---

## 13. Risks and open questions

Status: **resolved and implemented** (see §15). Decisions taken:

- **Rank churn vs. absolute values.** Accepted: Z means *stack position*. Edits
  renumber unrelated elements.
- **Connection default look.** Resolved without a dedicated insert helper: a new
  connection inherits the topmost endpoint shape's effective z, and the stable
  tie-break in `zElementList()` (connections before shapes at equal z) plus
  normalization places it directly below that shape.
- **Anchors in `E`.** Excluded (`isAnchor` shapes never participate).
- **Hidden shapes in `E`.** Excluded (`hidden` shapes never participate). They
  keep their stored `zHeight` and rejoin the stack on unhide.
- **Undo snapshot churn.** Accepted; normalization runs in `pushUndo()` but is
  idempotent, so style-only edits do not actually rewrite values.
- **Layers panel scope.** Connections are **not** added to the Layers panel; it
  stays shape-only. The global stack is still unique across shapes *and*
  connections.
- **Performance.** Non-issue at this scale.

---

## 14. Appendix — implementation order (as executed)

1. Added `isZParticipant()`, `zElementList()`, `normalizeZHeights()`,
   `moveZToRank()`, and reworked `computeZOrder()` to derive from the list.
2. Made `addShape()` place new shapes on top and reworked `addConn()`'s default
   via `connDefaultZ()` (anchors/hidden count as 0).
3. Made `pushUndo()` normalize defensively (mutate → normalize → snapshot).
4. Replaced `toFront`/`toBack`/`forward`/`backward` with `moveZToRank`-based
   implementations (now generic over shapes and connections).
5. Replaced raw assignments in all three Z inputs (`#prop-zHeight`,
   `.layer-z`, `#conn-zHeight`) with `moveZToRank` (direct assign only for
   non-participants).
6. Normalized after load in **both** load paths — `loadFromLocalStorage()`,
   the startup init block, and the import handler.
7. Filtered anchors out of `renderLayouts()`; connections left out entirely.
8. Verified with a headless-Chromium integration test (load, add, reorder,
   clamp, unhide, hidden-edit) — all participant sets unique.

Note: step 7 in the original plan (`insertZBelowShape` for `addConn`) was not
needed; the tie-break handles insertion.

---

## 15. Implemented behaviour (final)

**Participating set `E`** = visible non-anchor shapes + every connection with
both endpoints present. Anchors and hidden shapes are excluded and keep
whatever `zHeight` they already had.

**Invariant.** After every mutation (via `pushUndo()`) and on every load/import,
`E` is assigned the dense ranks `0..N-1`, unique and ascending by stack order.

**Ordering rules.**
- New shapes are placed on top (`moveZToRank(id, N-1)`).
- New connections default to the higher endpoint shape's z, which the
  conn-before-shape tie-break turns into "just below that shape".
- Any Z edit is a *rank* edit and clamps to `[0, N-1]`.
- Hidden/anchor Z edits are stored directly and do not disturb `E`.

**Rendering.** `computeZOrder()` maps each participant to `rank + 1` for
`z-index`; non-participant anchors fall back to `1` (they have
`pointer-events:none`, so this is invisible).

**Layers panel.** Shape-only; anchors are filtered out.

**Helpers available.** `isZParticipant(obj)`, `zElementList()`,
`normalizeZHeights()`, `moveZToRank(id, rank)`, `zElementRank(id)`,
`zElementLabel(id)`.
