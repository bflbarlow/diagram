# Properties Panel — Field Width & Layout Review

**Target files:** `index.html` (lines 101–169), `styles.css` (lines 435–700)
**Date:** 2025-09-10
**Scope:** The right-side properties panel (`#properties-panel`) — all input fields, their widths, and space efficiency.

---

## Current State

The properties panel is **240px wide** (resizable via `#panel-resize-handle`). Inside it, every `prop-row` uses `display: flex` with `gap: 8px`, and each `<label>` inside a `prop-row` has `flex: 1` — meaning the label stretches to fill available space. The input/select inside each label also has `flex: 1`.

This means **every field takes up 100% of the available row width**, regardless of whether the field's content actually needs that much space.

### Key CSS Rules (styles.css)

```css
.prop-row {
    display: flex;
    gap: var(--space-2);        /* 8px */
    margin-bottom: var(--space-2);
    align-items: center;
}

.prop-row label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;                    /* ← This is the problem */
    font-size: 12px;
    color: var(--color-text-muted);
}

.prop-row label input,
.prop-row label select,
.prop-row label textarea {
    flex: 1;                    /* ← Also stretches */
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 16px;
    min-height: 44px;           /* ← Tall inputs */
    outline: none;
    font-family: inherit;
}
```

---

## Field Inventory — Current vs. Appropriate Width

### Geometry Section

| Field | Type | Current Width | Max Value Range | Recommended Width | Rationale |
|-------|------|---------------|-----------------|-------------------|-----------|
| **X** | `number` | 100% (full row) | ~10,000 (5 digits + sign) | **50px** | Even at 10,000px canvas, max is `-9999` to `9999` — 5 chars + sign = 6 chars. A 50px input comfortably fits this. |
| **Y** | `number` | 100% (full row) | ~10,000 (5 digits + sign) | **50px** | Same as X. |
| **W** | `number` | 100% (full row) | ~10,000 (5 digits + sign) | **50px** | Same range as X/Y. |
| **H** | `number` | 100% (full row) | ~10,000 (5 digits + sign) | **50px** | Same range as X/Y. |
| **Z** | `number` | 100% (full row) | `-999` to `999` (4 digits + sign) | **45px** | Max 4 digits + sign. 45px is plenty. |

**Current layout:** X and Y are on the same row (two fields), W and H are on the same row. Both rows stretch each field to fill the full 240px width.

**Problem:** Each number field gets ~110px of width when 50px would suffice. That's **~60% wasted space per field**.

### Text Section

| Field | Type | Current Width | Max Value Range | Recommended Width | Rationale |
|-------|------|---------------|-----------------|-------------------|-----------|
| **Font Size** | `number` | 100% (full row) | 8–72 (2 digits) | **55px** | Max 2 digits + label "Font Size" = ~45px needed. 55px is comfortable. |
| **Padding** | `number` | 100% (full row) | 0–40 (2 digits) | **50px** | Max 2 digits. 50px is plenty. |
| **Align** | `select` | 100% (full row) | ~15 options, ~18 chars max | **Auto (flex)** | Select menus need more width for readability. This one is fine as-is. |

**Current layout:** Font Size and Padding each get their own full-width row.

**Problem:** These are 1–2 digit numbers getting ~110px of width each. **~55% wasted space.**

### Style Section

| Field | Type | Current Width | Max Value Range | Recommended Width | Rationale |
|-------|------|---------------|-----------------|-------------------|-----------|
| **Fill** | `color` | 100% (full row) | Color picker swatch | **44px (fixed)** | Color inputs are already `min-width: 44px`. This is fine. |
| **Outline** | `color` | 100% (full row) | Color picker swatch | **44px (fixed)** | Same as Fill. Already correct. |
| **Outline W** | `number` | 100% (full row) | 0–20 (2 digits) | **45px** | Max 2 digits. 45px is plenty. |
| **Opacity** | `number` | 100% (full row) | 10–100 (2–3 digits) | **55px** | Max 3 digits. 55px is plenty. |
| **Fill Op** | `number` | 100% (full row) | 0–100 (3 digits) | **55px** | Max 3 digits. 55px is plenty. |
| **Stroke Op** | `number` | 100% (full row) | 0–100 (3 digits) | **55px** | Max 3 digits. 55px is plenty. |
| **Text Color** | `color` | 100% (full row) | Color picker swatch | **44px (fixed)** | Already correct. |

**Current layout:** Outline W and Opacity share a row. Fill Op and Stroke Op share a row. Each field stretches to fill ~110px.

**Problem:** Number fields for opacity/stroke-width get far more width than needed.

### Connection Section

| Field | Type | Current Width | Max Value Range | Recommended Width | Rationale |
|-------|------|---------------|-----------------|-------------------|-----------|
| **Name** | `text` | 100% (full row) | Variable | **Auto** | Connection names can be descriptive. This is fine as-is. |
| **Color** | `color` | 100% (full row) | Color picker swatch | **44px (fixed)** | Already correct. |
| **Width** | `number` | 100% (full row) | 1–20 (2 digits) | **45px** | Max 2 digits. 45px is plenty. |
| **Start Arrow** | `checkbox` | 100% (full row) | on/off | **Compact** | See checkbox section below. |
| **End Arrow** | `checkbox` | 100% (full row) | on/off | **Compact** | See checkbox section below. |

---

## Checkbox Analysis

### Current State

Checkboxes in the properties panel use the `.checkbox-label` class:

```css
.prop-row .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: var(--space-2);       /* 8px */
    cursor: pointer;
    color: var(--color-text) !important;
    font-size: 12px !important;
}
.prop-row .checkbox-label input[type="checkbox"] {
    width: auto;
    accent-color: var(--color-accent);
}
```

**Problem:** The checkbox row still has `flex: 1` on the label, and the entire `prop-row` is 240px wide. A single checkbox with its label text takes maybe 120–160px of horizontal space. The remaining 80–120px is wasted.

**Checkboxes found in the panel:**
1. `#conn-arrow-start` — "Start Arrow" (Connection section)
2. `#conn-arrow-end` — "End Arrow" (Connection section)

### Checkbox Space Analysis

Each checkbox row currently consumes:
- **Row height:** `min-height: 44px` (inherited from the input rule)
- **Horizontal space:** The label text + checkbox + ~80px of wasted space to the right

For the Connection section's two arrow checkboxes, they could be **paired on one row** (side-by-side), reducing vertical space by 50%.

---

## Design Principle: Stretch with Min-Width

The core idea: **fields should stretch to fill available space, but not collapse below a sensible minimum.** This means:

- A row with **one field** → that field stretches to fill 100% of the row width (an effective floor, no constraint needed).
- A row with **two fields** → each stretches to share the space evenly, but neither can shrink below its `min-width`.
- A row with **four fields** → each gets ~25%, but none can go below `min-width`.

This is superior to fixed widths because:
- The panel is **resizable** (drag handle) — fixed widths waste space when the panel is wide, and overflow when it's narrow.
- Fields naturally flex to fill what's available, avoiding awkward dead space on the right.
- The `min-width` acts as a safety net, preventing 4-field rows from squeezing tiny inputs into unreadable slivers.

**Implementation:** Remove the `flex: 1` from the `<label>` wrapper and instead put `flex: 1; min-width: ...` on the `<input>` itself. The label text stays sized naturally (`shrink: 0`), and the input stretches to fill remaining row space.

### Proposed Layout Changes

### Geometry Section — 4 on one row

**Current:**
```
┌──────────────────────────────────────┐
│  X [                    ]  Y [      ]│
│  W [                    ]  H [      ]│
│  Z [                              ] │
└──────────────────────────────────────┘
```

**Proposed:**
```
┌──────────────────────────────────────┐
│  X [~~~~~~~~~~~~~]  Y [~~~~~~~~~~~~~]│
│  W [~~~~~~~~~~~~~]  H [~~~~~~~~~~~~~]│
│  Z [~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~] │
└──────────────────────────────────────┘
```

- All four (X, Y, W, H) on one row — each gets roughly 25% and stretches to fill.
- Z on its own row or paired with another singleton field — stretches 100%.
- Each numeric input: `flex: 1; min-width: 50px;` 

### Text Section — 3 on one row

**Current:**
```
┌──────────────────────────────────────┐
│  Font Size [                      ]  │
│  Padding [                       ]   │
│  Align [                          ]  │
└──────────────────────────────────────┘
```

**Proposed:**
```
┌──────────────────────────────────────┐
│  Font [~~~~~~]  Pad [~~~~~]  Align [~~~~~~~~~~~]│
└──────────────────────────────────────┘
```

- Font Size (`min-width: 55px`), Padding (`min-width: 50px`), and Align (no min-width needed, naturally wider) on one row.
- Each stretches to fill its share; padding/font size won't squish below their min.

### Style Section — Tighter Pairing

**Current:**
```
┌──────────────────────────────────────┐
│  Fill [44]  Outline [44]            │
│  Outline W [                  ] Op [ ]│
│  Fill Op [                    ] StrOp │
│  Text Color [44]                    │
└──────────────────────────────────────┘
```

**Proposed:**
```
┌──────────────────────────────────────┐
│  Fill [44]  Stroke [44]  SW [~~~~~~] Op [~~~~~~]│
│  FillOp [~~~~~~]  StrokeOp [~~~~~~]  TxtCol [44]│
└──────────────────────────────────────┘
```

- All fields on 2 rows instead of 4.
- Color inputs stay at `min-width: 44px` (already correct — they naturally don't stretch).
- Number inputs: `flex: 1; min-width: 50px;`

### Connection Section — Checkbox Pairing

**Current:**
```
┌──────────────────────────────────────┐
│  Name [                          ]    │
│  Color [44]  Width [45]             │
│  ☐ Start Arrow                      │
│  ☐ End Arrow                        │
└──────────────────────────────────────┘
```

**Proposed:**
```
┌──────────────────────────────────────┐
│  Name [~~~~~~~~~~~~~~~~~~~~~~~~~~~~]  │
│  Color [44]  Width [~~~~~~~~~~~~]     │
│  ☐ Start     ☐ End                   │
└──────────────────────────────────────┘
```

- Arrow checkboxes paired on one row, side-by-side, each with `flex: 1` so they stretch evenly.
- Labels shortened to "Start" / "End" — tooltips for clarity.
- Width field: `flex: 1; min-width: 50px;`

---

## Technical Implementation Plan

### Phase 1: CSS-Only Width Fixes (Low Risk, High Impact)

**File:** `styles.css`

Add a class that applies the "stretch with min-width" pattern:

```css
/* Compact number input — stretches to fill, but won't collapse below min */
.prop-row .num-compact {
    flex: 1;
    min-width: 50px;
}

/* Even smaller number — for values that fit in 1–3 digits */
.prop-row .num-tiny {
    flex: 1;
    min-width: 45px;
}

/* Avoid applying flex:1 on the label itself — keep it on the input */
.prop-row label {
    flex: 1;        /* ← keep this so the label wrapper stretches */
}

/* But for color inputs, keep them fixed */
.prop-row label input[type="color"] {
    flex: 0;        /* don't stretch color swatches */
}

/* Checkbox pair — two checkbox labels sharing a row */
.prop-row .checkbox-pair {
    display: flex;
    gap: var(--space-3);
    flex: 1;
}
.prop-row .checkbox-pair label {
    flex: 1;        /* each checkbox label stretches to fill its half */
    min-width: 60px;
    white-space: nowrap;
}
```

**Key insight:** The `min-width` on the `<input>` (not the `<label>`) is what prevents the input from collapsing when the row has many siblings. The `flex: 1` on the `<label>` still allows the wrapper to stretch, but the inner input won't shrink below its minimum.

**HTML changes needed:**
- Add `class="num-compact"` to X, Y, W, H, Z inputs
- Add `class="num-tiny"` to Font Size, Padding, Outline W
- Add `class="num-compact"` to Opacity, Fill Op, Stroke Op, Connection Width
- Wrap arrow checkboxes in a `<div class="checkbox-pair">` or just put both `<label>` elements side by side in the same `.prop-row`

### Phase 2: Layout Restructuring (Medium Risk)

**File:** `index.html`

Restructure rows to pack fields horizontally:

```html
<!-- Geometry — all four on one row, each stretches with min-width floor -->
<div class="prop-row">
    <label>X <input type="number" id="prop-x" class="num-compact"></label>
    <label>Y <input type="number" id="prop-y" class="num-compact"></label>
    <label>W <input type="number" id="prop-width" class="num-compact" min="10"></label>
    <label>H <input type="number" id="prop-height" class="num-compact" min="10"></label>
</div>
<div class="prop-row">
    <label>Z <input type="number" id="prop-zHeight" class="num-tiny" value="0" min="-999" max="999"></label>
</div>

<!-- Text — all three on one row -->
<div class="prop-row">
    <label>Font <input type="number" id="prop-fontSize" class="num-tiny" min="8" max="72"></label>
    <label>Pad <input type="number" id="prop-textPad" class="num-tiny" min="0" max="40"></label>
    <label>Align <select id="prop-textAlign"></select></label>
</div>

<!-- Style — 4 then 3 per row -->
<div class="prop-row">
    <label>Fill <input type="color" id="prop-fill"></label>
    <label>Stroke <input type="color" id="prop-stroke"></label>
    <label>SW <input type="number" id="prop-sw" class="num-tiny" min="0" max="20"></label>
    <label>Op <input type="number" id="prop-opacity" class="num-compact" min="10" max="100"></label>
</div>
<div class="prop-row">
    <label>F.Op <input type="number" id="prop-fillOpacity" class="num-compact" min="0" max="100" value="100"></label>
    <label>S.Op <input type="number" id="prop-strokeOpacity" class="num-compact" min="0" max="100" value="100"></label>
    <label>Txt Color <input type="color" id="prop-textColor"></label>
</div>

<!-- Connection arrows — paired in the row, each stretches evenly -->
<div class="prop-row">
    <label style="flex:1"><input type="checkbox" id="conn-arrow-start"> Start Arrow</label>
    <label style="flex:1"><input type="checkbox" id="conn-arrow-end"> End Arrow</label>
</div>
```

---

## Space Savings Estimate

| Section | Current Rows | Proposed Rows | Space Saved |
|---------|-------------|---------------|-------------|
| Geometry | 3 rows | 2 rows | ~33% fewer rows |
| Text | 4 rows | 1 row | ~75% fewer rows |
| Style | 4 rows | 2 rows | ~50% fewer rows |
| Connection (arrows) | 2 rows | 1 row | ~50% fewer rows |
| **Total vertical reduction** | | | **~25–30% fewer rows in panel** |

This would make the panel feel significantly less cramped, especially when many sections are visible at once.

---

## Additional Considerations

### 1. Input `min-height: 44px` is excessive for number fields

The CSS rule `.prop-row label input` sets `min-height: 44px` for all inputs. For number inputs that only display 2–5 characters, this creates **excessive vertical whitespace**.

**Recommendation:** Reduce `min-height` to `28px` for number inputs, keeping `44px` only for text inputs, selects, and color pickers.

```css
.prop-row label input[type="number"] {
    min-height: 28px;
    font-size: 14px;  /* slightly smaller for numbers */
}
```

### 2. Labels can be abbreviated for numeric fields

For fields where the label is obvious (X, Y, W, H, Z, Op, Pad), consider:
- Shortening labels: "Width" → "W", "Height" → "H", "Font Size" → "Font", "Padding" → "Pad"
- Using abbreviations with tooltips for clarity

### 3. Color inputs are already appropriately sized

The `input[type="color"]` rule already sets `min-width: 44px; min-height: 44px` which is a reasonable size for color picker swatches. No changes needed here.

### 4. The `min-width` pattern elegantly solves the root cause

`.prop-row label` has `flex: 1`, which forces every label wrapper to stretch. The fix isn't to remove this (it's useful for text/select fields that benefit from stretching) — it's to add a **`min-width` on the `<input>` itself** so that labels with compact inputs don't collapse their child input into a tiny sliver when sharing a row.

On a row with 4 labels, each gets 25% of the row width. Without a `min-width`, a number input gets 25% of 240px = 60px — fine. But if there are 6 labels or the panel is narrowed, it could collapse to 30px. The `min-width: 50px` prevents this.

### 5. Resize behavior is naturally handled

Since the panel is resizable (240px default, adjustable via handle), `flex: 1` with `min-width` is ideal:
- **Panel widened to 320px:** Each field proportionally grows — a 4-field row goes from 60px per field to 80px per field.
- **Panel narrowed to 200px:** Fields shrink to share the space, but `min-width` prevents any field from collapsing illegibly.
- Fixed widths (`flex: 0 0 auto; width: 50px`) would leave dead space when the panel is wide and overflow when narrow. The `min-width` pattern adapts naturally.

---

## Priority Order

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Compact widths for X/Y/W/H/Z number fields | 15 min | High — biggest visual win |
| **P0** | Reduce `min-height` for number inputs | 5 min | High — reduces vertical bloat |
| **P1** | Pair arrow checkboxes on one row | 10 min | Medium — saves a full row |
| **P1** | Compact Font Size / Padding fields | 15 min | Medium |
| **P1** | Compact opacity / stroke-width fields | 15 min | Medium |
| **P2** | Restructure layout rows for horizontal packing | 30 min | High — but more invasive |
| **P3** | Abbreviate labels (W, H, Pad, Op, etc.) | 10 min | Low — cosmetic |
