# app_beyon_storefront

UI overlay that applies the Beyon designs to the `Vedesh_Beyon` site. It holds markup and styling only; anything the design simulates stays a client-side placeholder until the backend is built.

## Install

1. Build: `npx sgmf-scripts --compile css --cartridgeName app_beyon_storefront && npx sgmf-scripts --compile js --cartridgeName app_beyon_storefront`
2. Upload: `npx sgmf-scripts --uploadCartridge app_beyon_storefront`
3. In Business Manager, go to Administration > Sites > Manage Sites > Vedesh's beyon > Settings and put `app_beyon_storefront` first in the cartridge path, in place of `app_custom_storefront`.

Images are in `static/`, which is git-ignored because it normally holds build output. Add them with `git add -f cartridges/app_beyon_storefront/cartridge/static/default/images/beyon`.

## Fonts

From the Beyon Revamp design set: Geom is bundled in `static/default/fonts`, and Oooh Baby and Didact Gothic load from Google Fonts. `static/` is git-ignored, so add font files with `git add -f`.

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
| Find Store | Opens the Beyon store locator in a new tab, as the design and story 28 specify |

## PLP placeholders

The grid shows real catalog products, prices and images, 12 per page, and Load More uses the base `Search-UpdateGrid` route. These parts are client-side only:

| Part | Current behaviour |
| --- | --- |
| Filters (sidebar and sheet) | Controls stay in step and list under the title, but the grid isn't filtered. Facets and counts are the design's sample values |
| Sort | Price orders the loaded cards and New Arrivals reverses them. Best Sellers, Popularity and Discount keep best-match order |
| Wishlist hearts | Saved in `sessionStorage` for the browser session |
| Bag button and Select Size popup | The three sizes come from the design. Confirm shows the toast and adds nothing to the basket |
| Request Design popup | Validates in the browser and shows the toast. Nothing is sent |
| Ribbons, offer tag, fourth card's request state | Set by grid position, as in the design's sample data |

To review states with no live trigger, add `?preview=no-results` or `?preview=wishlisted` to the listing URL.

## PDP

Product name, images, price, sizes and Add to Bag are real, and sizes and Add to Bag use the base `Product-Variation` and `Cart-AddProduct` routes. Colour pickers stay hidden, as in the design's default view, and the script picks the first colour so the product can still be added. These parts are placeholders:

| Part | Current behaviour |
| --- | --- |
| Product Details, Price Breakup, Customise pickers | Sample values from the design |
| Coupons | Sample coupons. Copy only shows a toast |
| Delivery check | The design's sample pincodes, with a random result for others |
| Gold Exchange calculator | Validates in the browser and uses the design's sample rates and its Rs 49,389 price, not the catalog price. Nothing is sent |
| Personalise and Request Design popups | Validate in the browser and show a toast. Nothing is sent |
| Buy Now | Shows the design's toast |
| Wishlist hearts | Toggle on the page only |
| Reviews, Stack It, FAQ | Sample content from the design |
| Size Chart | Always opens the ring guide |

To review states with no live trigger, add one of these to the product URL as `?preview=`: `oos`, `withcustom`, `nooffer`, `rose14`, `white14`, `silver925`, `pin-ok`, `pin-fail`, `exchange`, `exchange-error`, `guide-ring`, `guide-bangle`, `guide-bracelet`, `guide-chain`.

## Login

The header's Login links open the design's sign-in card as a popup over the current page, with no reload. `beyon-header.js` fetches the markup from `Login-Show` by AJAX on first use, loads `beyon-login.css` and `beyon-login.js`, and keeps the popup in the page after closing. If the fetch fails, the link opens the full page. Direct visits and account redirects still get `Login-Show` as a page.

Nothing here reaches the server yet, so **no shopper can sign in on this site until the backend exists**. Account pages redirect to this screen.

| Item | Current behaviour |
|---|---|
| Send code | Checks the number format in the browser, then shows the code screen. No code is sent |
| Verify & sign in | Shows a placeholder note. The design shows a demo alert |
| Marketing and personalisation choices | Not saved |
| Terms and Privacy Notice links | No destination yet |

The background is a blurred static capture of the PDP design. The design uses a live iframe of that page.

## Cart

Cart and checkout use `common/layout/beyon-bare`, the base page layout without the site header, because the designs have their own header. The SFRA footer stays.

Real data: items, images, line prices, quantity, size, subtotal and Remove (base `Cart-RemoveProductLineItem`).

| Item | Current behaviour |
|---|---|
| Grand Total | Shows the subtotal minus the placeholder coupon. Real shipping and tax aren't included yet, to match the design's FREE and Included rows |
| Coupons | The design's three sample codes change the numbers shown here and are remembered for checkout. The basket itself isn't changed |
| Move to Wishlist | Removes the line from the basket and shows the message. Nothing is saved to a wishlist yet |
| Pincode check | The design's sample list, then a random result |
| Weight and metal badge | Fixed sample values, repeating over four designs including 925 Silver |
| Promo banner | Rotates the design's three messages, shared with the listing page |

Coupon amounts are the design's rupee values applied to the site's USD prices, so GOLD500 can take a low total to 0.

## Checkout and order confirmation

Real data: order items, images, quantities, line prices and subtotal from the base `Checkout-Begin` route.

Everything else is a placeholder from the design's sample data. **No order is created and the basket isn't changed.** Place Order only shows the confirmation screen.

| Item | Current behaviour |
|---|---|
| Addresses | Two samples kept in the page. Add, edit, delete and select work until reload |
| PAN | The design's sample list. Nothing is sent to a tax service |
| NeuCoins | Fixed balance of 500. 1 coin takes 1 unit off the displayed total |
| Payment options | Select locally. No gateway |
| Coupon discount | Read from the cart's placeholder value |
| Order number | `BYN` plus the last 6 digits of the time |

The base `Order-Confirm` template isn't restyled, because this flow never reaches it.

### Previewing design states

`NoAddress.html` and `edge cases.html` are states with no live trigger yet, so they can be opened with a query parameter on `Checkout-Begin`:

| Parameter | State |
|---|---|
| `?preview=no-address` | No saved addresses |
| `?preview=popup-1` | International delivery alert |
| `?preview=popup-2` | Items out of stock |
| `?preview=popup-3` | Items can't be shipped internationally |
| `?preview=popup-4` | Some items out of stock, remove and continue |

## Deliberate differences from the design

- The Revamp `Login/` folder has no font files, so its HTML renders in a system font. The live page uses Geom, the font the rest of the design set specifies, so its body text is slightly narrower.
- Cart coupons are the codes in `cart.html` (WELCOME10, GOLD500, FIRSTORDER). Story 21 names different codes, and the HTML takes priority.
- The login button says Send code, from the HTML. Story 29 says Get OTP.
- At 390px the design pushes the cart icon off screen because search can't shrink. Search shrinks here so the cart stays visible.
- Sign Out is hidden for guests.
- Edge case popups list the shopper's real basket items, not the design's three samples.
- The PDP pincode box keeps its CHECK button inside the box at 390px, where the design lets it overflow by 4px.
