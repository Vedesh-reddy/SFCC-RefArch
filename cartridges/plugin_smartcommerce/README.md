<div align="center">

# Smart Commerce for SFRA

**Email-code login, price history, alerts, compare, guest tracking, order edits, click & collect and price lock.**

[Features](#features) · [Setup](#installation) · [Extension points](#extension-points-used) · [Standalone repository](https://github.com/Vedesh-reddy/sfcc-smart-commerce)

</div>

![Product page panel with price history, alerts, store pickup and price lock](docs/images/pdp-panel.png)

`plugin_smartcommerce` is an SFRA overlay cartridge. Its features share one cartridge, one
resource bundle (`smartcommerce.properties`), one storefront script (`smart-commerce.js`) and
one one-time-code helper. No base cartridge file is edited.

It uses the repository's root `package.json`, build configuration and `dw.json`.

## Features

Each feature below is self-contained: what it does, how a shopper or store employee uses it,
what to configure, what it stores, and the rules it enforces. Screenshots were captured on
sandbox `zyeu-002`, site `RefArch_Practice`, on October 7–8, 2026, against the deployed
cartridge; the emails arrived in a real inbox and the orders are real SFCC orders.

| # | Feature | Shopper entry point | Data | Job |
| --- | --- | --- | --- | --- |
| 1 | [Email OTP sign-in and registration](#1-email-otp-sign-in-and-registration) | Login page button, `EmailOtp-Show` | Session (hashed code), external profile `SmartEmailOtp` | — |
| 2 | [Price history and lowest price in 30 days](#2-price-history-and-lowest-price-in-30-days) | Product page panel, `SmartProduct-PriceHistory` API | `SmartPriceHistory` | `SmartCommerce-PriceHistory` |
| 3 | [Price-drop alerts](#3-price-drop-alerts) | Product page panel | `SmartProductAlert` (`price`) | Both jobs |
| 4 | [Back-in-stock alerts](#4-back-in-stock-alerts) | Product page panel | `SmartProductAlert` (`stock`) | `SmartCommerce-Hourly` |
| 5 | [Product comparison](#5-product-comparison) | Tiles, product page, `ProductCompare-Show` | Browser storage | — |
| 6 | [Order tracking without an account](#6-order-tracking-without-an-account) | Track-order form link, `OrderLookup-Show` | Session | — |
| 7 | [Order modification window](#7-order-modification-window) | Order details page | Order (`exportAfter`) | — |
| 8 | [Store pickup (click & collect)](#8-store-pickup-click--collect) | Product page panel; BM Store Pickup Desk | Order pickup-code hash | — |
| 9 | [Price lock](#9-price-lock) | Product page panel | `SmartPriceLock` | `SmartCommerce-Hourly` |

Features 2, 3, 4, 8 and 9 share one **product page panel**, inserted below Add to Cart and
reloaded whenever the shopper selects another variant, so every action applies to the exact SKU.

![Product page panel](docs/images/pdp-panel.png)

---

### 1. Email OTP sign-in and registration

**What it does.** Shoppers sign in or create an account with a 6-digit code sent to their email
instead of a password.

**Shopper flow**

1. The login page shows **Sign in with an email code instead** next to the password form.

   ![Login page with the email-code button](docs/images/login-email-code-button.png)

2. To sign in, the shopper enters an email. To register, they also enter a first and last name.

   ![Registration with an email code](docs/images/otp-register-request.png)

3. The code page never says whether the email has an account. A wrong code is rejected.

   ![Code sent](docs/images/otp-verify.png)

   ![Wrong code rejected](docs/images/otp-wrong-code.png)

4. The right code signs the shopper in. Here it signed into an existing password account.

   ![Signed in with the emailed code](docs/images/otp-signed-in.png)

**Configuration.** None. The sender address is the `customerServiceEmail` site preference.

**What it stores.** Only a salted SHA-256 hash of the code, in `session.privacy`. Verified
customers get an external profile with provider ID `SmartEmailOtp` and their email as ID.

**Rules**

- A code is valid for 10 minutes, allows 5 attempts and works once.
- Requesting again within 60 seconds keeps the code already sent.
- An existing password account is linked on first use; without an account, registering creates
  one with the entered name. Signing in with no account asks the shopper to register.
- Disabled or locked accounts are refused.

**Limits.** The resend throttle is per session, not per email address.

---

### 2. Price history and lowest price in 30 days

**What it does.** Records every price change per SKU and shows the lowest price of the last
30 days and the change history on the product page, with the same data as a public JSON API.

**Shopper flow**

1. The panel shows **Lowest price in the last 30 days** and an expandable price history. Here
   the job recorded $99.00, then $79.00 after the price book changed.

   ![Lowest price and price history](docs/images/price-history-panel.png)

2. Integrations read `SmartProduct-PriceHistory?pid=<SKU>`:

   ![Price history JSON](docs/images/price-history-api.png)

   ```json
   { "productID": "74974310M-1", "currencyCode": "USD", "current": 79, "lowest30": 79,
     "history": [{ "date": "2026-10-08T05:29:09.967Z", "price": 79 }, { "date": "2026-10-07T15:21:18.816Z", "price": 99 }] }
   ```

**Configuration.** Schedule `SmartCommerce-PriceHistory` (imported to run daily at 01:00 UTC).

**What it stores.** One `SmartPriceHistory` custom object per SKU and currency, keyed
`productID|currency`, holding the change points as JSON.

**Rules**

- A point is written only when the price-book price (without promotions) differs from the last one.
- Points older than 90 days are dropped, except the one in force at the cutoff.
- "Lowest in 30 days" counts every price in force during the window, including the price at the
  window start and today's price.
- Masters and sets have no history of their own; the panel shows the selected variant's.

---

### 3. Price-drop alerts

**What it does.** A shopper leaves an email on a product and gets one email when its price
falls below the price at the time of subscribing.

**Shopper flow**

1. The shopper enters an email (prefilled when signed in) and subscribes.

   ![Price-drop alert subscribed](docs/images/price-alert-subscribed.png)

2. When the price dropped from $99.00 to $79.00, the next job run sent one email.

   ![Price drop email](docs/images/email-price-drop.png)

**Configuration.** `smartAlertExpiryDays` (default 30). The send step runs in both jobs.

**What it stores.** A `SmartProductAlert` keyed `price|SKU|email` with the reference price,
status (`pending`, `sent`, `expired`, `failed`) and expiry. Records are deleted after 90 days.

**Rules**

- One subscription per SKU and email; subscribing again while pending changes nothing.
- Masters are rejected, so every alert is for a specific variant.
- A price in another currency never triggers an alert.
- Each alert is sent at most once; a mail failure marks it `failed` instead of retrying.

---

### 4. Back-in-stock alerts

**What it does.** Shoppers subscribe to an unavailable variant and get one email when it can be
ordered again.

**Shopper flow**

1. On an unavailable size, the panel offers **Notify me when available**.

   ![Back-in-stock form on an unavailable variant](docs/images/stock-alert-form.png)

2. A second subscription is recognised and not duplicated.

   ![Duplicate subscription recognised](docs/images/stock-alert-deduplicated.png)

3. When stock returned, the hourly job sent one email.

   ![Back in stock email](docs/images/email-back-in-stock.png)

**Configuration.** `smartAlertExpiryDays`; schedule `SmartCommerce-Hourly`.

**What it stores.** A `SmartProductAlert` keyed `stock|SKU|email`, with the same statuses and
retention as price alerts.

**Rules**

- Only offered for variants or simple products that cannot be ordered.
- Triggered by `availabilityModel.isOrderable()`, so backorder and preorder settings are respected.
- Pending alerts past their expiry date become `expired` without an email.

---

### 5. Product comparison

**What it does.** Shoppers pick 2–4 products and compare configurable attributes side by side
with price, availability, offers and delivery estimate. For jewellery, configure for example
metal, karatage, gross weight, stone and diamond clarity.

**Shopper flow**

1. Every product tile and the product panel get a **Compare** toggle; a tray at the bottom
   counts the selection and opens the comparison.

   ![Compare toggles and tray](docs/images/compare-listing-tray.png)

2. The compare page shows one column per product.

   ![Compare page](docs/images/compare-page.png)

**Configuration.** `smartCompareAttributes`: comma-separated product attribute IDs, e.g.
`metal,karatage,grossWeight,stone,diamondClarity`. Rows with no value for any product are hidden.

**What it stores.** Nothing on the server. The selection stays in the shopper's browser, and the
page URL `ProductCompare-Show?pids=a,b,c` carries it, so the page is cacheable and shareable.

**Rules**

- Enum, set, number and markup attribute values are displayed in readable form.
- Attribute IDs not defined in the catalog are skipped instead of breaking the page.
- Price uses the storefront's pricing template; offers are promotion callouts; delivery is the
  first home-delivery method with its `estimatedArrivalTime`.

---

### 6. Order tracking without an account

**What it does.** A guest enters the order number and the order email or phone, confirms a code
sent to the order email, and sees the order.

**Shopper flow**

1. The base track-order form links to the code-based lookup.

   ![Track with a one-time code link](docs/images/track-order-link.png)

2. The guest enters the order number and email or phone.

   ![Order lookup](docs/images/order-lookup.png)

3. The code goes to the email on the order, whatever was entered.

   ![Code sent to the order email](docs/images/order-lookup-verify.png)

4. After the code, the order details page opens (shown in [feature 7](#7-order-modification-window)).

**Configuration.** None.

**What it stores.** The verified order number and order token in `session.privacy`.

**Rules**

- The response is identical whether or not an order matched, so order numbers cannot be probed.
- Phone numbers match on the last 10 digits of the billing phone.
- Unplaced and failed orders are never found.
- After verification, the order is read with `OrderMgr.getOrder(orderNo, orderToken)`.

**Limits.** Phone matches still receive the code by email (no SMS provider). The first lookup has
no order token, as in base `Order-Track`; test it on sites with *Limit Storefront Order Access*.

---

### 7. Order modification window

**What it does.** For a configured time after placement (15 minutes by default), the customer can
change the delivery address, cancel an item, swap to another variant or cancel the order. After
the cutoff the controls disappear.

**Shopper flow**

1. A guest who verified by code sees the change panel on the order page. Here the address was
   changed to 22 Cambridge Street.

   ![Guest changed the delivery address](docs/images/order-edit-guest-address-saved.png)

2. A signed-in customer sees the same panel under **My Account → Order History**.

   ![Change panel for a registered order](docs/images/order-edit-account-panel.png)

3. **Cancel the whole order** asks for confirmation and cancels it.

   ![Order cancelled](docs/images/order-edit-cancelled.png)

**Configuration.** `smartOrderEditWindowMinutes` (default 15).

**What it stores.** Nothing extra. Placement sets the order's `exportAfter` to the end of the
window, so fulfilment does not export an order that can still change.

**Rules**

- Only the order's owner or the session that verified it by code may change it; every request
  re-checks ownership and the window on the server.
- Edits require status NEW or OPEN, not shipped, not exported, and before the cutoff.
- The order is never re-priced: unchanged lines keep their prices, discounts and taxes, so the
  total only stays the same or goes down.
- Country and state cannot change, because they decide the tax already charged.
- Single items can be cancelled only when the order has no order-level discount or bonus item.
- Variant swaps offer only siblings with the same price that are in stock; the line's discounts are kept.
- Cancelling the order uses `OrderMgr.cancelOrder`, which rolls inventory back.

**Limits.** A cancelled item or swapped-out variant stays allocated until the next inventory
import or an OMS update. Cancellation does not void the payment at the gateway.

---

### 8. Store pickup (click & collect)

**What it does.** Shows stores that have the selected variant in stock, reserves it at the chosen
store, keeps the order's pickup address correct through checkout, and emails a pickup code that
store staff verify before handing over the order.

**Shopper and staff flow**

1. The shopper enters a postal code, or leaves it empty to use their location, and sees nearby
   stores with stock.

   ![Stores near the shopper with stock](docs/images/pickup-stores-near-me.png)

2. **Pick up here** adds the item to a pickup shipment for that store and opens the cart.
3. At checkout the shipping form was filled with a home address in Burlington; the order still
   carries the store's address and the Store Pickup method. A pickup code is emailed.

   ![Pickup order confirmation with the store address](docs/images/pickup-order-confirmation.png)

4. In Business Manager, **Smart Commerce → Store Pickup Desk**, staff enter the order number and
   the customer's code. A correct code marks the order collected.

   ![Store Pickup Desk marking order 00000103 collected](docs/images/bm-pickup-desk.png)

**Configuration**

- `smartPickupShippingMethodID`: the pickup shipping method (SFRA demo data has `005`). Mark it
  `storePickupEnabled` so it stays out of the home-delivery list.
- Each store needs an inventory list, set in the store's `inventoryListId`.
- Add the cartridge to the Business Manager cartridge path and grant the **Store Pickup Desk**
  module to the staff role.

**What it stores.** SFRA's in-store pickup attributes (`fromStoreId`, `shipmentType`), and on the
order a salted hash of the pickup code, the wrong-attempt count and the collection time.

**Rules**

- Pickup lines reserve stock from the store's inventory list when the order is created.
- Right before order creation, every pickup shipment gets the store address and pickup method
  again, whatever the shipping form submitted.
- The pickup code is never stored in clear text. Five wrong codes lock the handover.
- A correct code sets `smartPickupCollectedAt` and the order's shipping status to SHIPPED.

**Limits.** Postal-code search needs the platform's Store Locator Data for the shopper's country
(the sandbox has Germany and the US only); without it, the shopper's location is used. With only
pickup items, base checkout still shows the shipping form, although the order is corrected.

---

### 9. Price lock

**What it does.** A signed-in customer locks today's price of a variant for a number of hours.
Members of chosen customer groups lock for free; others pay a small fee through normal checkout.

**Shopper flow**

1. The panel offers to lock today's price.

   ![Price lock offer](docs/images/price-lock-offer.png)

2. The lock shows its price and expiry.

   ![Price locked](docs/images/price-lock-active.png)

3. The price later rose from $135.00 to $150.00. The order placed with the lock paid $135.00.

   ![Order line paid at the locked price](docs/images/price-lock-order-line.png)

**Configuration**

- `smartPriceLockHours` (default 24).
- `smartPriceLockFreeGroups`: customer groups that lock for free (the sandbox uses `Registered`).
- `smartPriceLockFeeProductID`: product bought as the lock fee. Leave empty to offer free locks only.

**What it stores.** A `SmartPriceLock` per lock: customer, SKU, locked price, currency, status
(`pending`, `active`, `used`, `expired`), expiry and the fee and usage order numbers. Records are
deleted after 90 days.

**Rules**

- One active or pending lock per customer and SKU.
- Paid locks add the fee product to the cart; the lock activates when that order is placed, so
  the site's payment integration collects the fee.
- While active, basket calculation adds a `Price lock` discount worth (current − locked price) ×
  quantity. If the price is at or below the locked price, no discount is added.
- Placing an order with the discount uses the lock. Expired locks stop applying immediately;
  the hourly job sets their status.

**Limits.** The fee is not credited against the later purchase.

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
