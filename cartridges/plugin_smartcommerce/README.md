<div align="center">

# Smart Commerce for SFRA

**Email-code login, price history, alerts, compare, guest tracking, order edits, click & collect and price lock.**

[Setup](#installation) · [Walkthrough](#walkthrough-with-sandbox-screenshots) · [How it works](#how-each-feature-works) · [Known limits](#known-limits)

</div>

![Product page panel with price history, alerts, store pickup and price lock](docs/images/pdp-panel.png)

`plugin_smartcommerce` is an SFRA overlay with eight shopper features. They share one cartridge,
one resource bundle (`smartcommerce.properties`), one storefront script and one OTP helper.

| Feature | Storefront entry | Data | Job |
| --- | --- | --- | --- |
| Email OTP sign-in and registration | `EmailOtp-Show`, button on the login page | `session.privacy` (hashed code), customer external profile `SmartEmailOtp` | — |
| Product price history, lowest price in 30 days | Product page panel, `SmartProduct-PriceHistory?pid=` (JSON) | `SmartPriceHistory` custom object | `SmartCommerce-PriceHistory` (daily) |
| Price-drop alerts | Product page panel | `SmartProductAlert` (type `price`) | Daily and hourly |
| Back-in-stock alerts (per variant) | Product page panel | `SmartProductAlert` (type `stock`) | `SmartCommerce-Hourly` |
| Product comparison (2–4 products) | Compare toggles on tiles and the product page, `ProductCompare-Show?pids=` | Browser `localStorage` | — |
| Order tracking without an account | `OrderLookup-Show`, link in the login page's track-order form | `session.privacy` | — |
| Order modification window | Panel on the order details page | Order export held with `exportAfter` | — |
| Store pickup (click and collect) | Product page panel, BM **Smart Commerce → Store Pickup Desk** | SFRA pickup attributes, order pickup-code hash | — |
| Price lock | Product page panel | `SmartPriceLock` custom object | `SmartCommerce-Hourly` |

## Installation

1. **Build.** `npm run compile:js` compiles `client/default/js/smart-commerce.js`.
2. **Upload.** `npm run uploadCartridge` includes `plugin_smartcommerce`.
3. **Storefront cartridge path.** Put it first:

   ```text
   plugin_smartcommerce:plugin_customwishlist:plugin_chatwidget:plugin_productreviews:app_storefront_base
   ```

4. **Business Manager cartridge path.** Add `plugin_smartcommerce` to the Business Manager site's
   path (**Administration → Sites → Manage the Business Manager Site**) for the pickup desk, then
   grant the **Store Pickup Desk** module to the store-staff role
   (**Administration → Organization → Roles & Permissions → Business Manager Modules**).
5. **Metadata.** Change `site-id` in `metadata/smart-commerce/jobs.xml`, then import:

   ```sh
   cd metadata && zip -r /tmp/smart-commerce.zip smart-commerce
   ```

   | File | Imports |
   | --- | --- |
   | `meta/custom-objecttype-definitions.xml` | `SmartPriceHistory`, `SmartProductAlert` (90-day retention), `SmartPriceLock` (90-day retention) |
   | `meta/system-objecttype-extensions.xml` | Site preferences group **Smart Commerce**; Order pickup-code attributes; SFRA pickup attributes `ProductLineItem.fromStoreId`, `Shipment.fromStoreId`, `Shipment.shipmentType`, `Store.inventoryListId`, `ShippingMethod.storePickupEnabled` (same IDs as SFRA's in-store pickup plugin, so base basket validation already uses them) |
   | `jobs.xml` | `SmartCommerce-PriceHistory` (daily 01:00 UTC), `SmartCommerce-Hourly` |

6. **Site preferences** (**Merchant Tools → Site Preferences → Custom Preferences → Smart Commerce**):

   | Preference | Default | Purpose |
   | --- | --- | --- |
   | `smartOrderEditWindowMinutes` | 15 | Modification window after placement |
   | `smartAlertExpiryDays` | 30 | Alert subscription lifetime |
   | `smartCompareAttributes` | — | Comma-separated attribute IDs, e.g. `metal,karatage,grossWeight,stone,diamondClarity` |
   | `smartPickupShippingMethodID` | — | Pickup shipping method. Leave empty to hide pickup |
   | `smartPriceLockHours` | 24 | Lock duration |
   | `smartPriceLockFreeGroups` | — | Customer groups that lock for free |
   | `smartPriceLockFeeProductID` | — | Fee product for paid locks. Leave empty for free-group-only locks |

7. **Store pickup data.** Mark the pickup shipping method `storePickupEnabled = true`. Give each
   store an inventory list and set the store's `inventoryListId`.
8. **Email.** All emails go through `emailHelpers.sendEmail`, so an `app.customer.email` hook
   (ESP integration) receives them too. The sender is the `customerServiceEmail` preference.

## Walkthrough with sandbox screenshots

Captured on sandbox `zyeu-002`, site `RefArch_Practice`, on October 7–8, 2026. Every step ran
against the deployed cartridge; the emails arrived in a real inbox and the orders are real
SFCC orders (00000103, 00000201, 00000202).

### 1. Email OTP sign-in and registration

The login page gets an email-code button next to the password form and social logins.

![Login page with the Sign in with an email code button](docs/images/login-email-code-button.png)

Registration asks for a name and an email; sign-in asks for the email only.

![Create an account with an email code](docs/images/otp-register-request.png)

The verify page never says whether the email has an account. A wrong code is rejected and
counts toward the 5 allowed attempts.

![Code sent page](docs/images/otp-verify.png)

![Wrong code rejected](docs/images/otp-wrong-code.png)

The right code signs into the existing password account for that email — no password typed.

![Signed in to My Account with the emailed code](docs/images/otp-signed-in.png)

### 2. Product page panel

One panel below Add to Cart, reloaded for each selected variant. Guests see sign-in prompts
for features that need an account.

![Product page with the Smart Commerce panel](docs/images/pdp-panel.png)

### 3. Price history and lowest price in 30 days

The daily job recorded $99.00; after the price book changed to $79.00 the next run recorded
the drop. The same data is public JSON at `SmartProduct-PriceHistory?pid=`.

![Lowest price in the last 30 days with the price history list](docs/images/price-history-panel.png)

![Price history JSON API](docs/images/price-history-api.png)

### 4. Price-drop alert

Subscribing stores the current price. When the job saw $79.00, it sent one email.

![Price-drop alert subscribed](docs/images/price-alert-subscribed.png)

![Price drop email](docs/images/email-price-drop.png)

### 5. Back-in-stock alert for one variant

Size 15L (`74974310M-3`) was out of stock. Subscribing twice is deduplicated. When stock
returned, the hourly job sent one email.

![Back-in-stock form on an unavailable variant](docs/images/stock-alert-form.png)

![Second subscription deduplicated](docs/images/stock-alert-deduplicated.png)

![Back in stock email](docs/images/email-back-in-stock.png)

### 6. Compare 2–4 products

Compare toggles appear on every tile, with a tray at the bottom of the page. The compare page
shows the configured attributes, price, availability, offers and delivery estimate.

![Listing page with compare toggles and the compare tray](docs/images/compare-listing-tray.png)

![Compare page](docs/images/compare-page.png)

### 7. Store pickup (click & collect)

With the postal code left empty, the browser location finds stores that stock the selected
variant. Choosing a store reserves from that store's inventory list.

![Stores near the shopper with stock counts](docs/images/pickup-stores-near-me.png)

The shipping form at checkout was submitted with a Burlington address; the order still carries
the store's address and the Store Pickup method, because pickup shipments are pinned to the store
right before the order is created. A pickup code was emailed.

![Pickup order confirmation with the store address](docs/images/pickup-order-confirmation.png)

Store staff enter the order number and the customer's code in Business Manager.

![Store Pickup Desk in Business Manager marking order 00000103 collected](docs/images/bm-pickup-desk.png)

### 8. Price lock

A registered shopper locks today's price for 24 hours (free here for the `Registered` group).

![Price lock offer](docs/images/price-lock-offer.png)

![Price locked until the next day](docs/images/price-lock-active.png)

The price later rose from $135.00 to $150.00. The order placed with the lock paid $135.00 and
used up the lock.

![Order line paid at the locked price](docs/images/price-lock-order-line.png)

### 9. Order tracking without an account

The base track-order form links to the code-based lookup. Order number plus the order email
or billing phone; the code always goes to the order email.

![Track with a one-time code link](docs/images/track-order-link.png)

![Order lookup](docs/images/order-lookup.png)

![Code sent to the order email](docs/images/order-lookup-verify.png)

### 10. Order modification window

The verified guest sees the change panel on the order page for 15 minutes. Here the address
was changed to 22 Cambridge Street.

![Guest changed the delivery address](docs/images/order-edit-guest-address-saved.png)

The signed-in owner sees the same panel under My Account, and cancelled the whole order.
No variant swap is offered because no sibling size has the same price and stock.

![Change panel for a registered order](docs/images/order-edit-account-panel.png)

![Order cancelled](docs/images/order-edit-cancelled.png)

## How each feature works

**Email OTP.** The shopper enters an email address. To register, they also enter a first and last
name. A 6-digit code is emailed. Only a salted SHA-256 hash of the code is kept in `session.privacy`.
The code is valid for 10 minutes, allows 5 attempts and is single use. Resends within 60 seconds keep
the same code. The verified email signs into its account through `CustomerMgr.loginExternallyAuthenticatedCustomer`
with provider ID `SmartEmailOtp`. Password accounts get that external profile linked on first use.
If no account exists, one is created with the names entered. The responses do not reveal whether an
account exists until the code is verified.

**Price history.** The daily job stores a price change point only when the price-book price
(without promotions) differs from the last recorded price. Points are kept for 90 days. "Lowest in 30
days" counts every price in force during the window, including the price at the window start and
the current price. Masters have no price history of their own. The panel shows the history of the
selected variant.

**Alerts.** Each subscription is one custom object keyed `type|SKU|email`, so repeated
subscriptions are deduplicated. Masters are rejected, which makes every alert variant-specific.
Status moves from `pending` to `sent`, `expired` or `failed`, and an alert is never sent twice.
Price alerts trigger below the price at the time of subscription.

**Compare.** The selection stays in the browser and opens `ProductCompare-Show?pids=a,b,c`. The page
has no personal data, so it uses the promotion-sensitive page cache. Rows show the configured
attributes (only those with at least one value), price (base pricing template), availability,
promotion callouts and the delivery estimate (`ShippingMethod.custom.estimatedArrivalTime`).

**Order tracking.** The shopper enters the order number and either the order email or the billing
phone (the last 10 digits are compared). The code always goes to the order email. After
verification, the session stores the order number and token, and later reads use
`OrderMgr.getOrder(orderNo, orderToken)`. The first lookup has no token, as in base `Order-Track`.
With **Limit Storefront Order Access** active, test that lookup on your instance.

**Modification window.** Placement sets `exportAfter` to the end of the window, so fulfilment does
not export the order while it can still change. Until then, the owner or the OTP-verified session can:
- change the delivery address (country and state are fixed because they set the tax);
- cancel one item, offered only when the order has no order-level discounts or bonus items;
- swap to a sibling variant with the same price, keeping the item's discounts;
- cancel the whole order with `OrderMgr.cancelOrder`, which rolls back inventory.

Edits never re-price the order, so the total can only stay the same or go down. After an item
cancellation, the payment amount is lowered.

**Store pickup.** The shopper searches stores by postal code (base store locator) and sees only
stores with stock (`ATS` of the store inventory list). Postal codes need Store Locator Data for
the shopper's country (the sandbox has Germany and the US only); with the field empty, the
browser's location is used, else the IP location. Choosing a store adds the SKU to a shipment
for that store. The shipment uses the store's address and the pickup method, and the line reserves
from the store's inventory list. Just before the order is created, every pickup shipment gets the
store address and method again, whatever the shipping form submitted. When the order is placed, a
6-digit pickup code is emailed and only its hash is saved on the order. At the desk, staff enter
the order number and code. A correct code marks the order collected (`smartPickupCollectedAt`,
shipping status SHIPPED). Five wrong codes lock the handover.

**Price lock.** A signed-in shopper locks today's price of a variant. Members of
`smartPriceLockFreeGroups` lock for free and the lock is active at once. Other shoppers get the fee
product added to the cart, and the lock activates when that order is placed. This means any payment
integration on the site collects the fee. While a lock is active, basket calculation
(`basketCalculationHelpers.calculateTotals`, wrapped) adds a custom price adjustment `smart-price-lock`
worth `(current − locked) × quantity`. Placing an order uses the lock. Expired locks stop applying
straight away, and the hourly job sets their status.

## Extension points used

| Base file or route | How |
| --- | --- |
| `scripts/checkout/checkoutHelpers` `createOrder`, `placeOrder` | `module.superModule` wrapper |
| `scripts/helpers/basketCalculationHelpers` `calculateTotals` | `module.superModule` wrapper |
| `app.template.afterFooter` hook | Loads the script and config on every page |
| `account/orderDetails.isml` | Copy of base plus one remote include (`OrderEdit-Panel`) |
| `account/components/oauth.isml` | Copy of base plus the email-code button |
| `account/components/trackOrderFormBillingZipCode.isml` | Copy of base plus the OTP tracking link |

The product page panel is inserted by the script after `.prices-add-to-cart-actions` and reloaded on
`product:afterAttributeSelect`. No product template is overridden, so it works alongside the wishlist
and reviews plugins.

## Known limits

Each of these is marked in the code with a `ponytail:` comment.

- OTP resend throttling is per session.
- Phone lookups send the code by email; there is no SMS provider.
- A cancelled item, or the variant swapped out, stays allocated until the next inventory import or
  an OMS update.
- Order cancellation does not void the payment at the gateway.
- With an empty home-delivery shipment, base checkout still shows the shipping form. Pickup shipments
  are corrected before the order is created. Dedicated pickup checkout templates would remove the form.
- The price lock fee is not credited against the later purchase.

## Verified on a sandbox

Confirmed on `zyeu-002` (see the walkthrough):

- `loginExternallyAuthenticatedCustomer` with the custom provider ID `SmartEmailOtp` signs in
  without an OAuth2 provider configured.
- Placed `NEW` orders accept address changes, line removal and `OrderMgr.cancelOrder`.
- The `smart-price-lock` custom price adjustment survives promotion calculation and is copied to the order.
- Both `app.template.afterFooter` implementations (this plugin and the wishlist) render.

Not exercised live: the variant swap (`replaceProduct`), because no same-price sibling was in stock.

## Tests

```sh
npx mocha 'test/unit/plugin_smartcommerce/**/*.js'
```

The tests cover the OTP lifecycle, price-history recording, pruning and the 30-day low, alert
deduplication, sending and expiry, price-lock adjustments, order lookup matching, order authorization
and the modification window.
