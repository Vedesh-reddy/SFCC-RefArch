---
name: bootstrap-5-migration
description: Migrate a Storefront Reference Architecture (SFRA) storefront from Bootstrap 4 to Bootstrap 5. Use when a merchant's SFRA cartridge overlay still uses Bootstrap 4 markup, utility classes, or jQuery-based Bootstrap component calls, and they want to upgrade to Bootstrap 5 — or when asked to run the SFRA Bootstrap 5 migration, upgrade Bootstrap in an SFRA site, or remove jQuery from a storefront's Bootstrap usage.
---

# bootstrap-5-migration — upgrade an SFRA storefront from Bootstrap 4 to Bootstrap 5

Bootstrap 5 drops jQuery, namespaces data attributes with `bs`, renames a set of utility and form
classes, and replaces the jQuery component plugins (modal, carousel) with vanilla-JS classes. This
skill drives the upgrade for a storefront that overlays or customizes the SFRA base cartridge: apply
the mechanical class and attribute renames, convert the JavaScript component calls by hand, then
verify against a checklist.

The companion reference is `bootstrap-5-migration.md` at the repository root — it carries the full
before/after for the manual JavaScript conversions this skill points you to.

## When to use

- A merchant's SFRA cartridge overlay uses Bootstrap 4 and they want Bootstrap 5.
- Markup still uses `data-toggle` / `data-dismiss` / `data-target`, utility classes like `sr-only`,
  `text-left`, `no-gutters`, or the custom-control form classes.
- JavaScript still calls `$(...).modal('show')` or `$(...).carousel(...)`.

## When NOT to use

- The storefront is not SFRA (a different framework's Bootstrap usage is out of scope).
- The site is already on Bootstrap 5 (check `bootstrap` in `package.json`).
- You only need to change a single class by hand — the full-pass ceremony isn't worth it.

## Inputs

- The merchant's SFRA project checkout, with the cartridge overlay under `cartridges/`.
- A clean git working tree, so every change shows up as a reviewable diff.

## Step 1 — Confirm the starting state

Check `bootstrap` in `package.json`. If it is already `^5.x`, stop — the site is migrated. Confirm
the working tree is clean (`git status`) and commit any pending work first, so every rename below is
reviewable as a diff.

## Step 2 — Rename data attributes, utility classes, and form classes

Apply the renames from the tables in `bootstrap-5-migration.md` (Data attribute renames, Utility
class renames, Form class renames) across `.isml`, `.html`, `.js`, and `.scss` files under
`cartridges/`, skipping `node_modules` and `static`.

**Scope every rename to markup and class strings — never a blind whole-word replace.** The class
names overlap common words and event names: `close` is both the dismiss-button class and a jQuery
event name (`$el.on('close', ...)`), and directional tokens appear in prose and identifiers. Rename
only inside `class="..."` / `className` values, `classList` token operations, and the data-attribute
names themselves. A blind find-and-replace across `.js` corrupts event bindings, string literals, and
link text. When in doubt, present the specific occurrences and confirm each is a class token before
rewriting it.

## Step 3 — Update the close-button markup

`.btn-close` renders its own icon, so renaming the class is not enough. For each dismiss button,
rename `close` → `btn-close`, rename `data-dismiss` → `data-bs-dismiss`, remove the inner
`<span>&times;</span>`, and add `aria-label="Close"`. The before/after is in `bootstrap-5-migration.md`
under "Close button markup".

## Step 4 — Convert the JavaScript component calls by hand

The jQuery Bootstrap plugin API is gone. Replace every `$(...).modal(...)` and `$(...).carousel(...)`
with the vanilla `bootstrap.Modal` / `bootstrap.Carousel` API. The correct replacement depends on how
each element is referenced, so this is manual. Follow the per-file before/after in
`bootstrap-5-migration.md` (quick view, product base, cart, consent tracking, carousel). If your
overlay has many call sites, the guide's optional `bootstrapHelper.js` utility keeps them terse
without reintroducing jQuery.

## Step 5 — Update the Bootstrap dependency and build

Bump `bootstrap` to `^5.3.x` in `package.json`, reinstall, and drop the jQuery Bootstrap plugin
import. Import only the Bootstrap 5 components your storefront uses (the `window.bootstrap` shim in
`bootstrap-5-migration.md`), not the full bundle — the bundle includes `Dropdown`, which conflicts
with SFRA's custom menu keyboard handling. Keep `@popperjs/core` as a dependency. Rebuild the client
assets and confirm the SCSS compiles.

## Step 6 — Verify against the testing checklist

Work through the testing checklist at the end of `bootstrap-5-migration.md`: modals open and close,
carousels advance, touch gestures work on mobile, keyboard navigation and focus management behave.
Anything that fails points back to a manual JavaScript conversion missed in Step 4.

## Failure modes

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Modal or carousel does nothing after migration | A `$(...).modal(...)` / `$(...).carousel(...)` call was not converted | Re-check Step 4 against every call site |
| Close button shows two icons | `.btn-close` renders its own icon and old `&times;` markup remains | Remove the inner `<span>&times;</span>` per Step 3 |
| A jQuery event handler or string literal broke | A class rename in Step 2 matched the word outside a class attribute | Scope renames to class tokens only; revert the over-broad edit |
| Styling breaks after the dependency bump | SCSS still imports the Bootstrap 4 entry, or `.form-group` was dropped without a shim | Switch to the Bootstrap 5 import; shim or replace `.form-group` per the guide |

## What this skill does NOT do

- **Does not migrate a non-SFRA storefront.**
- **Does not convert the JavaScript component calls automatically.** Those are manual (Step 4).
- **Does not bump the Bootstrap dependency for you** beyond telling you to — review and commit that
  change yourself.
