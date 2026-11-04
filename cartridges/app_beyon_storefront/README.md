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

## PDP

One template covers all three designs, chosen from the product:

| Design | Used when |
|---|---|
| `PDPnew` | The product has variation attributes |
| `PDPnocustomise` | The product has no variation attributes |
| `PDPoos` | The product isn't available |

Real data: name, description, images, price, list price, size and colour variations (base `Product-Variation`), and Add to Bag (base `Cart-AddProduct`). The first available value of each attribute is selected on load, so Add to Bag works straight away.

Placeholders, as in the design's sample data:

| Item | Current behaviour |
|---|---|
| Metal, diamond and weight specs, price breakup | Fixed sample values in rupees |
| Gold finish, diamond shape, diamond size | Select locally, don't affect the product |
| Stack It products, brand image | Fixed design images and prices |
| Pincode check | The design's sample list, then a random result |
| Customisation and design request forms | Validate in the browser and show the confirmation. Nothing is sent |
| Wishlist hearts, ribbon, offer tag | Client-side only |

`sizes.html` and `ring-size-guide-1080x1440.html` aren't built because no design page links to them. The PDP's own size chart is included.

## Deliberate differences from the design

- At 390px the design pushes the cart icon off screen because search can't shrink. Search shrinks here so the cart stays visible.
- Sign Out is hidden for guests.
- The PDP pincode box keeps its CHECK button inside the box at 390px, where the design lets it overflow by 4px.
