# Bootstrap 5 Migration Guide for Storefront Reference Architecture

SFRA uses [Bootstrap 5](https://getbootstrap.com/). This guide helps merchants migrate a
storefront that overlays or customizes the SFRA base cartridge from Bootstrap 4 to Bootstrap 5.

Bootstrap 5 drops jQuery, renames data attributes and a set of utility classes, and replaces the
custom form-control classes with standard form classes. Most of these are mechanical class and
attribute renames. The JavaScript component API (modals, carousels) changed shape and requires
manual conversion. This guide covers both.

It assumes your overlay is on Bootstrap 4 and targets Bootstrap 5.3. It covers the renames and
conversions that SFRA's own cartridge needed; for the complete list of framework changes, see
Bootstrap's [Migrating to v5](https://getbootstrap.com/docs/5.3/migration/) reference.

* [Before You Start](#before-you-start)
* [Data Attribute Renames](#data-attribute-renames)
* [Utility Class Renames](#utility-class-renames)
* [Form Class Renames](#form-class-renames)
* [Close Button Markup](#close-button-markup)
* [Manual JavaScript API Changes](#manual-javascript-api-changes)
  * [product/quickView.js](#productquickviewjs)
  * [product/base.js](#productbasejs)
  * [cart/cart.js](#cartcartjs)
  * [components/consentTracking.js](#componentsconsenttrackingjs)
  * [carousel.js](#carouseljs)
* [Optional Modal and Carousel Helper](#optional-modal-and-carousel-helper)
* [Update the Bootstrap Dependency](#update-the-bootstrap-dependency)
  * [Make bootstrap Available to the Client Modules](#make-bootstrap-available-to-the-client-modules)
* [Testing Checklist](#testing-checklist)
* [Common Errors](#common-errors)

-------------------

## Before You Start

- Work on a branch, and commit before you begin so you can diff and revert.
- Apply the renames to your own cartridge overlay under `cartridges/`, not to a fresh copy of the
  base cartridge.
- Bootstrap 5 has no Internet Explorer support. Confirm that your supported-browser matrix no longer
  targets IE before migrating.
- Scope the class and attribute renames in these sections to markup and class strings. The class names overlap
  common words and event names (`close`, for example, is both the dismiss-button class and a jQuery
  event name), so a blind find-and-replace across `.js` files corrupts event bindings and text.
  Rename only inside `class="..."`, `classList` token operations, and the attribute names
  themselves.

## Data Attribute Renames

Bootstrap 5 namespaces every component data attribute with `bs`. Rename these attribute names
wherever they appear in `.isml`, `.html`, and inline HTML strings in `.js`:

| Bootstrap 4 | Bootstrap 5 |
| --- | --- |
| `data-toggle` | `data-bs-toggle` |
| `data-dismiss` | `data-bs-dismiss` |
| `data-target` | `data-bs-target` |
| `data-slide` | `data-bs-slide` |
| `data-slide-to` | `data-bs-slide-to` |
| `data-ride` | `data-bs-ride` |
| `data-parent` | `data-bs-parent` |
| `data-backdrop` | `data-bs-backdrop` |
| `data-keyboard` | `data-bs-keyboard` |
| `data-interval` | `data-bs-interval` |
| `data-pause` | `data-bs-pause` |
| `data-wrap` | `data-bs-wrap` |
| `data-offset` | `data-bs-offset` |
| `data-spy` | `data-bs-spy` |
| `data-content` | `data-bs-content` |

## Utility Class Renames

Rename these utility classes in markup, class strings, and SCSS `@extend` targets. The directional
utilities changed from left/right to start/end for right-to-left language support.

| Bootstrap 4 | Bootstrap 5 |
| --- | --- |
| `sr-only` | `visually-hidden` |
| `sr-only-focusable` | `visually-hidden-focusable` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `float-left` (and `float-{sm,md,lg,xl}-left`) | `float-start` (and responsive variants) |
| `float-right` (and `float-{sm,md,lg,xl}-right`) | `float-end` (and responsive variants) |
| `border-left` | `border-start` |
| `border-right` | `border-end` |
| `rounded-left` | `rounded-start` |
| `rounded-right` | `rounded-end` |
| `ml-*` (and `ml-{sm,md,lg,xl}-*`) | `ms-*` (and responsive variants) |
| `mr-*` (and `mr-{sm,md,lg,xl}-*`) | `me-*` (and responsive variants) |
| `pl-*` (and `pl-{sm,md,lg,xl}-*`) | `ps-*` (and responsive variants) |
| `pr-*` (and `pr-{sm,md,lg,xl}-*`) | `pe-*` (and responsive variants) |
| `no-gutters` | `g-0` |
| `font-weight-bold` (and `-bolder`, `-normal`, `-light`, `-lighter`) | `fw-bold` (and `fw-bolder`, `fw-normal`, `fw-light`, `fw-lighter`) |
| `font-italic` | `fst-italic` |
| `badge-*` (e.g. `badge-primary`) | `text-bg-*` (e.g. `text-bg-primary`) |

## Form Class Renames

Bootstrap 5 removed the custom-control form family; the standard form classes now carry the styling.

| Bootstrap 4 | Bootstrap 5 |
| --- | --- |
| `custom-control-input` | `form-check-input` |
| `custom-control-label` | `form-check-label` |
| `custom-control custom-checkbox` | `form-check` |
| `custom-control custom-radio` | `form-check` |
| `custom-checkbox` | `form-check` |
| `custom-radio` | `form-check` |
| `custom-control` | `form-check` |
| `custom-select` | `form-select` |
| `custom-range` | `form-range` |
| `custom-switch` | `form-switch` |
| `form-control-label` | `form-label` |

Bootstrap 5 also removed the `.form-group` class. If your overlay uses it, either replace each
`.form-group` with the `mb-3` spacing utility or redefine `.form-group` in your own SCSS as a
compatibility shim.

## Close Button Markup

The close-button class changed from `close` to `btn-close`, and `.btn-close` renders its own icon,
so the old `&times;` span is removed. Rename the class only inside `class="..."` — the word "close"
also appears as event names and link text that must not be touched.

**Before (Bootstrap 4):**
```html
<button type="button" class="close" data-dismiss="modal">
    <span aria-hidden="true">&times;</span>
</button>
```

**After (Bootstrap 5):**
```html
<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
```

## Manual JavaScript API Changes

Bootstrap 5's JavaScript components are vanilla-JS classes rather than jQuery plugins. Each
`$(...).modal(...)` and `$(...).carousel(...)` call must be converted by hand — the correct
replacement depends on how each element is referenced. The SFRA base cartridge had these call sites;
your overlay likely mirrors them.

The conversions in this section reference a global `bootstrap` object (`bootstrap.Modal`,
`bootstrap.Carousel`). That global comes from a small shim you set up in
[Make bootstrap available to the client modules](#make-bootstrap-available-to-the-client-modules) —
set it up there, then convert the call sites here.

### product/quickView.js

**Before (Bootstrap 4):**
```javascript
$('#quickViewModal').modal('show');
$('#quickViewModal').modal('hide');
```

**After (Bootstrap 5):**
```javascript
// Show modal
bootstrap.Modal.getOrCreateInstance(document.getElementById('quickViewModal')).show();

// Hide modal
bootstrap.Modal.getOrCreateInstance(document.getElementById('quickViewModal')).hide();
```

`getOrCreateInstance` returns the existing instance or creates one, so it works whether or not the
modal was opened through the data API first. Prefer `getOrCreateInstance` over `getInstance`, which returns `null` when
no instance exists yet and would make the call silently no-op.

### product/base.js

**Before (Bootstrap 4):**
```javascript
$(carousel).carousel('dispose');
$(carousel).carousel();
$('#chooseBonusProductModal').modal('show');
$('#chooseBonusProductModal').modal('hide');
```

**After (Bootstrap 5):**
```javascript
// Carousel dispose — dispose only what already exists, so guard with getInstance
var carouselEl = carousel[0];
var existingCarousel = bootstrap.Carousel.getInstance(carouselEl);
if (existingCarousel) existingCarousel.dispose();

// Carousel initialize
bootstrap.Carousel.getOrCreateInstance(carouselEl);

// Modal show
bootstrap.Modal.getOrCreateInstance(document.getElementById('chooseBonusProductModal')).show();

// Modal hide
bootstrap.Modal.getOrCreateInstance(document.getElementById('chooseBonusProductModal')).hide();
```

Dispose is the one case that keeps `getInstance` + a guard: You only want to tear down an instance
that actually exists. Everywhere else, `getOrCreateInstance` is the safe default.

### cart/cart.js

**Before (Bootstrap 4):**
```javascript
$('#editProductModal').modal('show');
$('#editProductModal').modal('hide');
```

**After (Bootstrap 5):**
```javascript
// Show modal
bootstrap.Modal.getOrCreateInstance(document.getElementById('editProductModal')).show();

// Hide modal
bootstrap.Modal.getOrCreateInstance(document.getElementById('editProductModal')).hide();
```

### components/consentTracking.js

**Before (Bootstrap 4):**
```javascript
$('#consent-tracking').modal('show');
```

**After (Bootstrap 5):**
```javascript
bootstrap.Modal.getOrCreateInstance(document.getElementById('consent-tracking')).show();
```

### carousel.js

**Before (Bootstrap 4):**
```javascript
$(this).carousel('next');
$(this).carousel('prev');
```

**After (Bootstrap 5):**
```javascript
bootstrap.Carousel.getOrCreateInstance(this).next();

bootstrap.Carousel.getOrCreateInstance(this).prev();
```

## Optional Modal and Carousel Helper

If you have many call sites, a small utility keeps them terse without reintroducing jQuery:

```javascript
// utils/bootstrapHelper.js
module.exports = {
    showModal: function (selector) {
        var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        var modal = bootstrap.Modal.getOrCreateInstance(el);
        modal.show();
        return modal;
    },

    hideModal: function (selector) {
        var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        var modal = bootstrap.Modal.getOrCreateInstance(el);
        modal.hide();
        return modal;
    },

    getCarousel: function (selector) {
        var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        return bootstrap.Carousel.getOrCreateInstance(el);
    }
};
```

## Update the Bootstrap Dependency

Bump `bootstrap` to `^5.3.x` in `package.json` and reinstall. Bootstrap 5's components no longer
depend on jQuery, so the jQuery Bootstrap plugin import goes away. Keep `@popperjs/core` as a
dependency (Modal, Popover, and Tooltip pull it in), and keep jQuery itself if your own storefront
code still uses it. Import only the Bootstrap 5 components your storefront uses (see the next
section), not the full bundle — the bundle includes `Dropdown`, whose document-level keydown
listener conflicts with SFRA's custom menu keyboard handling. Rebuild the client assets and confirm
the SCSS compiles against Bootstrap 5.

### Make `bootstrap` Available to the Client Modules

The `bootstrap.Modal` / `bootstrap.Carousel` calls in the preceding sections reference a global `bootstrap` object. The
SFRA base cartridge provides it through a small third-party module that imports the components it
uses and assigns them to `window.bootstrap`, so every client module can call
`bootstrap.Modal.getOrCreateInstance(...)` without importing Bootstrap itself:

```javascript
// cartridges/.../client/default/js/thirdParty/bootstrap-v5.js
import Carousel from 'bootstrap/js/src/carousel.js';
import Modal from 'bootstrap/js/src/modal.js';
// ...import the other components your storefront uses

window.bootstrap = { Carousel: Carousel, Modal: Modal /* , ... */ };
```

Import only the components you use. The SFRA base cartridge's shim imports 11 — `Alert`,
`Button`, `Carousel`, `Collapse`, `Modal`, `Offcanvas`, `Popover`, `ScrollSpy`, `Tab`, `Toast`, and
`Tooltip` — because its own markup drives all of them through the data API; `Carousel` and `Modal` are only
what the manual conversions in this guide reference. If your overlay mirrors base, match base's set,
then trim to the components your storefront actually uses. Deliberately leave out `Dropdown`:
Importing it registers a document-level keydown listener that conflicts with SFRA's custom menu
keyboard handling.

Import that module once from your client entry point (`main.js`) so it runs before the modules that
use `bootstrap`.

## Testing Checklist

After migrating, verify these interactions:

- [ ] Quick view modal opens and closes
- [ ] Bonus product modal works
- [ ] Cart edit modal functions
- [ ] Consent tracking modal appears
- [ ] Product image carousels work
- [ ] Touch gestures on carousels (mobile)
- [ ] Keyboard navigation for modals
- [ ] Category mega-menu, country selector, and account dropdown open by mouse and keyboard (arrow keys, Enter/Space, Escape)
- [ ] Accessibility (focus management)

## Common Errors

These are the errors SFRA's own migration surfaced. If you hit one, it usually points back to a
specific preceding step.

**Console warning: `Blocked aria-hidden on an element because its descendant retained focus`.**
Bootstrap 5's Modal manages background inertness itself, so a manual or baked-in `aria-hidden` on a
modal, dropdown menu, or popover subtree now double-marks an element whose descendant still holds
focus. Remove the manual `aria-hidden` and let Bootstrap manage it. If the warning fires when a
modal closes, blur the focused control before hiding the modal.

**`Uncaught TypeError: Cannot read properties of undefined (reading 'parentNode')` on arrow-key or
Escape navigation of a menu.** Bootstrap's `Dropdown` was imported into the component shim. Its
document-level keydown listener resolves the owning toggle only through `data-bs-toggle="dropdown"`;
SFRA's menus don't carry that attribute, so it builds a `Dropdown` around a null element and throws.
Leave `Dropdown` out of the shim (see [Make bootstrap available to the client
modules](#make-bootstrap-available-to-the-client-modules)).

**A modal or carousel does nothing after migration.** A `$(...).modal(...)` or `$(...).carousel(...)`
call was left unconverted. Re-check every call site against [Manual JavaScript API
Changes](#manual-javascript-api-changes).

**A close button shows two icons.** `.btn-close` renders its own icon, but the old inner
`<span>&times;</span>` is still in the markup. Remove it per [Close Button Markup](#close-button-markup).

**A form field's `pattern` stops validating in Chrome, or the console reports an invalid regular
expression.** Not a Bootstrap change, but this migration surfaced it during Chrome testing, so it is
worth knowing. Chrome now compiles the HTML `pattern` attribute (and the `regexp=` constraints in
SFRA's form definition XML that render into it) with the RegExp `v` flag. Under `v`, a literal `-`
inside a character class must be escaped even in a position that was previously treated as literal,
so an unescaped `[a-z.%+-]` now throws instead of matching. Escape the hyphen (`[a-z.%+\-]`) in the
affected `pattern` / `regexp=` values.
