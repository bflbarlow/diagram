# Version Update Process

## Versioning Policy

Versioning is **prescribed by the project owner**, not by semantic versioning rules. The owner decides when and how to bump the version. No assumptions about MAJOR/MINOR/PATCH meaning apply — follow the owner's direction.

## Where Version Appears — Update Checklist

Every release requires updating **all** of the following locations. If even one is missed, the user will see stale version numbers.

### 1. `app.js` — Line ~8 (single source of truth)

```js
var VERSION = '1.1.2';  // v1.1.2: priority attachment ports, connection-over-shape click, syntax fix
```

- **What to update:** The version string and the comment.
- **Why it matters:** This is the single source of truth. It is used by `saveState()` to write the version into saved project metadata, by `loadFromLocalStorage()` for fallback versioning, and by `updateMetadata()` during save.
- **Comment format:** `vX.Y.Z: <brief summary of key changes in this release>`

### 2. `about.html` — Line ~387 (displayed version)

```html
<h1>diagram <span class="version" id="version-display">v1.1.3</span></h1>
```

- **What to update:** The version text inside `<span class="version">`.

### 3. `about.html` — Version History section (lines ~474–555)

```html
<div class="changelog">
    <div class="changelog-entry">
        <span class="ver">1.1.3</span><span class="date">current</span>
        <ul>
            <li>Right-click deferred pan — pan canvas by right-click and drag...</li>
            ...
        </ul>
    </div>
    ...
</div>
```

- **What to update:** Add a new `<div class="changelog-entry">` block at the **top** of the changelog (before the current `1.1.3` entry, which should have its date set to the actual release date and its `<span class="date">` changed from `current` to the date).
- **Format:**
  ```html
  <div class="changelog-entry">
      <span class="ver">X.Y.Z</span><span class="date">YYYY-MM-DD</span>
      <ul>
          <li>Feature or fix description</li>
          ...
      </ul>
  </div>
  ```
- **Order:** Newest first — new entries go above all existing ones.
- **Date:** Use `YYYY-MM-DD` format. Only the newest version gets `current` as its date initially; once released, replace `current` with the actual date.

### 4. `README.md` — Line ~1 (title) and changelog section

```markdown
# Diagram — v1.1.3
```

And the changelog section near the bottom of the file:

```markdown
### v1.1.3 (2026-09-08)
<add release notes here>
```

- **What to update:** The title version on line 1, and add a new changelog entry at the top of the history section.
- **Changelog format:** `### vX.Y.Z (YYYY-MM-DD)` followed by bullet points of changes.

## Common Mistakes to Avoid

| Mistake | Consequence |
|---------|-------------|
| Updating `VERSION` in `app.js` but forgetting `about.html` | About page shows stale version |
| Updating `about.html` but forgetting `README.md` title | README shows wrong version |
| Forgetting the about.html Version History section | Version history is out of sync |
| Not setting the previous "current" entry's date | Version history shows "current" for an old release |
| Forgetting to add a changelog entry | No release notes for users |
| Updating version in multiple commits | Inconsistent state during review |
| Not grepping for old version string | Stale references remain in docs |

## Quick Reference — What Each `VERSION` Reference Does

| Location | Purpose |
|----------|---------|
| `app.js` `VERSION` constant | Source of truth; written to saved project metadata on every save |
| `about.html` `<span class="version">` | Displayed to users on the About page (hardcoded) |
| `about.html` Version History | Full changelog of all releases |
| `README.md` title | Shown on the project root / GitHub |
| `README.md` changelog | Documents what changed per release |
| `S.metadata.version` (in saved state) | Stored in localStorage / files; used for future compatibility checks |

## Style Guide & Conventions

### `VERSION` Constant (app.js)

- **Format:** `var VERSION = 'MAJOR.MINOR.MINOR2';`
- **Comment:** Always include a trailing comment summarizing the release:
  ```js
  var VERSION = '1.2.0';  // v1.2.0: new terminator shape, fixed undo on click
  ```
- **Comment style:** Use `vX.Y.Z:` prefix followed by a colon, then a comma-separated list of key changes in lowercase (bug fix, feature name, or issue reference).
- **Keep it brief:** The comment is a quick reference — detailed notes belong in the changelog.

### Changelog Entries (README.md)

- **Header format:** `### vX.Y.Z (Mon DD, YYYY)` (e.g., `### v1.1.4 (Sep 7, 2026)`)
- **Date style:** `Mon DD, YYYY` (e.g., `Sep 7, 2026`), not ISO 8601 or relative dates.
- **Entry structure:**
  ```markdown
  ### v1.2.0 (2026-01-15)
  - Added terminator shape type
  - Fixed undo skipping on shape click (double-undo bug)
  - Improved connection port snapping precision
  ```
- **Bullet style:** Start with a verb (Added, Fixed, Improved, Changed, Removed, Deprecated).
- **Order:** List most impactful changes first (features before fixes).
- **Scope:** Only include user-visible changes. Internal refactors belong in commit messages, not the changelog.

### about.html Version History Entries

- **Version format:** `<span class="ver">X.Y.Z</span>` — no `v` prefix, just the numbers.
- **Date format:** `<span class="date">Mon DD, YYYY</span>` (e.g., `Sep 7, 2026`) or `<span class="date">current</span>` for the newest unreleased entry.
- **Bullet style:** Start with a bold summary followed by a dash and details:
  ```html
  <li><strong>Right-click deferred pan</strong> — pan canvas by right-click and drag; context menu appears immediately</li>
  ```
- **Order:** Newest first — new entries go at the top, above all existing ones.
- **Date for new releases:** Replace `current` with the actual release date when the version is published.

### Commit Messages

- **Format:** `type: brief description`
- **Types:**
  - `feat:` — new feature
  - `fix:` — bug fix
  - `chore:` — version bump, docs, tooling
  - `refactor:` — code restructuring
  - `style:` — formatting, whitespace
- **Examples:**
  ```
  feat: add terminator shape type
  fix: undo skipping on shape click
  chore: bump to v1.2.0
  ```
- **Version bump commits:** Always include all files in the commit message:
  ```
  chore: bump to v1.2.0
  ```
  Do NOT include version changes in feature/fix commits — keep them separate.

### General Conventions

- **Never leave the version out of sync.** All locations must match before merging.
- **Changelog dates are the release date**, not the date of the last change in that version.
- **Keep the changelog at the top** of the version history section (newest first).
- **Test the version change** by opening `about.html` and verifying the displayed version matches `app.js`.
- **Grepping for old version strings** before merging is mandatory — stale references break user trust.

## Future Improvement

Consider making `about.html` read `VERSION` dynamically instead of hardcoding it. This would eliminate one of the manual update locations. For example:

```js
// In about.html — after loading app.js or defining VERSION
document.getElementById('version-display').textContent = 'v' + VERSION;
```

This would reduce the update checklist from 5 locations to 4.
