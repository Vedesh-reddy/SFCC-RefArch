# app_custom_storefront

Storefront redesign overlay for SFRA: SCSS tokens, an SVG icon set, template overrides, licensed photography, and small controller extensions that feed product carousels from the catalog. Base and plugin cartridges are not modified.

## Install

1. Build: `npm run compile:scss`. To build this cartridge only: `npx sgmf-scripts --compile css --cartridgeName app_custom_storefront`.
2. Upload: `npx sgmf-scripts --uploadCartridge app_custom_storefront`.
3. In Business Manager, go to Administration > Sites > Manage Sites > your site > Settings, and put `app_custom_storefront` first in the cartridge path.
4. Invalidate the page cache.

No site import is needed. Copy lives in `templates/resources/storefront.properties`. Carousels read the catalog through `scripts/helpers/productCarouselHelpers.js`. Photos are in `static/default/images/store/`; credits are in [NOTICE.md](NOTICE.md).

`cartridges/*/cartridge/static/` is git-ignored because it normally holds build output. Add these photos with `git add -f cartridges/app_custom_storefront/cartridge/static/default/images/store` or they will not reach a fresh checkout.

## What each page does

| Page | Layout |
|---|---|
| Home | Sliding hero, benefit marquee, category rail, three product carousels, editorial banners, feature cards |
| Category and search | Title band with category links, toolbar, filter drawer, card grid |
| Product | Sticky gallery with thumbnails, hover zoom and full view, share and wishlist on the image, size buttons, stock status, price trend chart, collapsible alert, pickup and price-lock actions, related carousel |
| Cart | Total-first summary, totals panel, animated empty state, carousel |
| Login | Photo panel beside one form column, order lookup collapsed |
| Account | Greeting band, shortcut tiles, restyled cards |
| Footer | Signup band, trust strip, links to every working feature, payment marks |

## ISML rules learned the hard way

- A literal `#` in markup can break template compilation with no useful error. Write `${'#'}icon-bag`, as base does.
- `isloop` needs a `var` attribute.
- `isset` does not reliably keep object or array literals. Pass data from a controller, or use `isscript` in the same template.

## Design tokens

All tokens are in `client/default/scss/_theme-variables.scss`. They load before base, so base's `!default` variables and Bootstrap pick them up.

| Token | Value | Use |
|---|---|---|
| `$theme-ink` | `#1d1d1f` | Body text and headings |
| `$theme-ink-soft` | `rgba(0, 0, 0, 72%)` | Navigation and footer links |
| `$theme-ink-muted` | `#6e6e73` | Secondary text |
| `$theme-surface` | `#f5f5f7` | Light tiles, footer |
| `$theme-surface-dark` | `#000` | Dark tiles |
| `$theme-hairline` | `#d2d2d7` | Dividers, card borders |
| `$theme-action` | `#0071e3` | Primary buttons |
| `$theme-action-strong` | `#06c` | Links, button hover, outline buttons |
| `$theme-action-on-dark` | `#2997ff` | Outline buttons on dark tiles |
| `$theme-radius-pill` | `980px` | Buttons |
| `$theme-radius-field` | `0.6875rem` | Inputs, menus |
| `$theme-radius-card` | `0.5rem` | Cards, product images |
| `$theme-nav-height` | `3.25rem` | Header bar, icon targets |
| `$theme-radius-panel` | `1.125rem` | Product cards, feature cards, panels |
| `$theme-tile-gap` | `0.75rem` | Space between home tiles |
| `$theme-status-green` | `#007600` | In stock, discounted prices, savings, selected compare |
| `$theme-status-red` | `#b12704` | Out of stock, errors, price rising |
| `$theme-status-amber` | `#a35200` | Back order, pre-order, warnings |
| `$theme-rating` | `#d9730d` | Review stars |

Each status colour reaches at least 4.5:1 on white and on `$theme-surface`, and has a `-soft` background token. The action colour has one too, `$theme-action-soft`.

Type scale, as size/line height at desktop:

| Mixin | Desktop | Phone |
|---|---|---|
| `theme-type-hero` | 56/60, semibold | 40/44 |
| `theme-type-section` | 40/44, semibold | 28/32 |
| `theme-type-lead` | 28/32, regular | 21/25 |
| Body | 17/25, regular | 17/25 |
| `theme-type-small` | 14/18 | 14/18 |
| `theme-type-micro` | 12/16 | 12/16 |

Fonts use the system stack. The cartridge does not load or bundle any web font.

## Responsive behaviour

Breakpoints are unchanged from base, because base JS reads them.

| Width | Header | Home tiles | Product grid |
|---|---|---|---|
| 992px and up | Logo, centered categories, search, account, bag. Flyout panel on hover or arrow keys | Two columns, hero 692px tall | Three or four columns, filters in a drawer |
| 769px to 991px | Same bar, with categories scrolling inside it instead of wrapping | Two columns, 580px tall | Three columns, filters in a drawer |
| Below 769px | Menu button, centered logo, bag. Off-canvas menu | One column, 480px tall | Two columns, filters in a drawer |
| Below 544px | Search moves to its own row, which scrolls away with the page | One column | Two columns |

## Template overrides

| Template | Why |
|---|---|
| `components/header/site-header-bar.isml` | New shared partial: the single-row sticky header |
| `components/header/pageHeader.isml`, `pdStorePageHeader.isml`, `pageHeaderNomenu.isml` | Use the new bar. The banner sits outside it so only the bar sticks |
| `home/homePage.isml` | Slider, rails and feature sections, no import needed |
| `components/icons/sprite.isml` | SVG icon set, included once by the header |
| `components/product-carousel.isml` | Shared product carousel |
| `components/header/miniCart.isml`, `account/header.isml` | SVG icons and account menu. `account/header.isml` also replaces the version in `plugin_wallet`, so keep its wallet block |
| `smart/product/panel.isml` | Replaces the `plugin_smartcommerce` panel with the price chart and collapsible actions; its form classes must stay |
| `account/accountDashboard.isml` | Greeting and shortcuts above the base cards |
| `search/searchResults.isml`, `search/searchResultsNoDecorator.isml`, `search/components/productTiles.isml`, `search/sortOrderMenu.isml` | Plain title with no photo banner, toolbar, filter drawer, four-column cards. The sort menu is skipped when a site has no sort rules |
| `product/productDetails.isml` | Breadcrumb above the gallery, price under the name, shipping and pickup rows, registry button below the Add to Cart bar |
| `cart/cart.isml` | Total-first summary, items beside a totals panel, empty state with a way back |
| `account/login.isml` | One centered column, no photo banner |
| `components/footer/pageFooter.isml` | Keeps the four-column footer independent of whichever base is deployed |
| `product/components/imageCarousel.isml` | Gallery markup for thumbnails, zoom, share and wishlist. Also names the slide buttons and drops an invalid `listbox` role |
| `product/components/productAvailability.isml` | Gives `store-ui.js` the in-stock label it compares messages with |
| `product/components/ratings.isml`, `product/components/productRating.isml`, `experience/components/commerce_assets/product/productTileRating.isml` | Empty on purpose. Base ratings are a hash of the product ID, not customer data |
| `wishlist/button.isml` | Replaces the `plugin_customwishlist` button with an icon for the product image |
| `cart/productCard/cartProductCardAvailability.isml` | Marks stock messages that are not plain in stock, so they can be amber |
| `search/noResultsProduct.isml` | Adds category links to the no-results page |
| `checkout/customer/customerCard.isml` | Accessibility fix: links the guest email label to its input |

`common/layout/page.isml` is deliberately not overridden, because `plugin_chatwidget` owns it.

## Compatibility notes

- `plugin_seller` is first on the usual cartridge path, so its `product/components/addToCartButtonExtension.isml` hides the copies in `plugin_customwishlist` and `plugin_socialgifting`. That is why the wishlist button is on the product image and the registry button is in `product/productDetails.isml`.
- `store-ui.js` hides the variation select and shows buttons in its place. The select stays in the page and still drives base's variation requests.
- The hover zoom shows the catalog's large image at 2x, so its sharpness depends on that image's size.
- Overlay templates emit both `data-bs-*` and `data-*` attributes, and `global.scss` maps `.custom-select`, so it works whether the deployed base is Bootstrap 4 or 5. This matters on a shared sandbox, where another developer's base upload can change the version.
- Keep these classes if you change the header, because base JS selects them: `.navbar-header`, `.user`, `.country-selector`, `.main-menu`, `.menu-toggleable-left`, `.navbar-toggler`, `.search-mobile`.
- The sticky header uses `z-index` 1020. Anything fixed to the top of the page needs a higher value.
- `.btn-block` and `.text-left` are kept for footer content assets that still use Bootstrap 4 classes. Remove them once those assets are updated.
- Page Designer component stylesheets under `experience/` are still served from base. They get the new colors from `global.css` and `skin.css`, but their own compiled values are unchanged.
