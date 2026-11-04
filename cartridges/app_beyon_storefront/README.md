# app_beyon_storefront

UI overlay that applies the Beyon designs to the `Vedesh_Beyon` site. It holds markup and styling only; anything the design simulates stays a client-side placeholder until the backend is built.

## Install

1. Build: `npx sgmf-scripts --compile css --cartridgeName app_beyon_storefront && npx sgmf-scripts --compile js --cartridgeName app_beyon_storefront`
2. Upload: `npx sgmf-scripts --uploadCartridge app_beyon_storefront`
3. In Business Manager, go to Administration > Sites > Manage Sites > Vedesh's beyon > Settings and put `app_beyon_storefront` first in the cartridge path, in place of `app_custom_storefront`.

Images are in `static/`, which is git-ignored because it normally holds build output. Add them with `git add -f cartridges/app_beyon_storefront/cartridge/static/default/images/beyon`.

## Conventions

- SCSS is mobile-first and uses `min-width` queries only.
- Design breakpoints live in `client/default/scss/_beyon-variables.scss`. SFRA's `md` is 769px and the designs switch at 768px, so these pages don't use SFRA's breakpoint mixins.
- Layout uses flexbox and Bootstrap utilities, not CSS Grid.

## Header placeholders

| Item | Current behaviour |
|---|---|
| Category and mega menu links | Open the full product list, because the catalog has no jewellery categories yet |
| Wishlist badge | Fixed at 2 |
| Beyon Facts, Gifting, NeuPass | No destination yet |

## PLP placeholders

The grid shows real catalog products, prices and images, and Load More uses the base `Search-UpdateGrid` route. These parts are client-side only:

| Item | Current behaviour |
|---|---|
| Filter drawer | Chips select and list under the toolbar, but the grid isn't filtered |
| Sort | Price and New Arrivals reorder loaded cards. Best Sellers and Popularity keep best-match order |
| Wishlist hearts | Kept in `sessionStorage` for the visit |
| Ribbons, colour dots, offer tag, first card's Available On Request | Set by grid position, as in the design's sample data |
| In-grid banners | Fixed copy on the design's gradient |

## Deliberate differences from the design

- At 390px the design pushes the cart icon off screen because search can't shrink. Search shrinks here so the cart stays visible.
- Sign Out is hidden for guests.
