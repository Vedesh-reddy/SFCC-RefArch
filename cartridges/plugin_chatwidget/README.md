<div align="center">

# Shopping Assistant Chat Widget for SFRA

**Browse, buy, manage the account and review the order without leaving the page.**

[Setup](#setup) · [Walkthrough](#walkthrough-with-sandbox-screenshots) · [Business Manager](#business-manager) · [Architecture](#architecture) · [Standalone repository](https://github.com/Vedesh-reddy/sfcc-chat-widget)

</div>

![Shopping assistant open on the storefront home page](docs/images/storefront-widget-open.png)

A shopping and account assistant that sits in the bottom-right corner of every
storefront, checkout and Page Designer page. Shoppers can browse, search, manage
their cart and account, check out and review orders without leaving the widget.
Everything uses live SFCC data, and every step is recorded in a privacy-safe
journey trail that merchants can read in Business Manager.

## What shoppers can do

| Guest | Signed in |
| --- | --- |
| Browse categories and product carousels | Everything a guest can do |
| Search products | Account summary and profile editing |
| Choose variations and add to cart | Address book: add, edit, delete, set default |
| Change quantities, remove lines, apply promo codes, pick a shipping method | Saved cards (view and delete) |
| See promotions | Order history and order details |
| Sign in, create an account, reset the password | Checkout with a saved address and saved card, then place the order |
|  | Review the order (1–5 stars, optional comment with consent) |

The start menu is built from the shopper's capabilities: checkout appears only
with items in the cart, saved cards and orders only when they exist, promotions
only when one is active, and the review action only for an order of this journey
that has not been reviewed.

## Setup

1. **Build and upload.**
   ```sh
   npx sgmf-scripts --compile js --cartridgeName plugin_chatwidget
   npx sgmf-scripts --compile css --cartridgeName plugin_chatwidget
   npx sgmf-scripts --uploadCartridge plugin_chatwidget
   ```
   `npm run compile:js`, `npm run compile:scss` and `npm run uploadCartridge` include the plugin.
2. **Cartridge path.** In **Administration > Sites > Manage Sites > site > Settings**,
   put `plugin_chatwidget` in front of `app_storefront_base`, for example:
   ```text
   plugin_chatwidget:plugin_customwishlist:plugin_productreviews:app_storefront_base
   ```
3. **Custom objects and job.** Set `site-id` in `metadata/chat-widget/jobs.xml` to your
   site ID (this repository uses `RefArch_Practice`), zip `metadata/chat-widget` and import it in
   **Administration > Site Development > Site Import & Export**. It creates the
   `ChatWidgetJourney` and `ChatWidgetActivity` custom object types and the
   `ChatWidget-PurgeJourneyData` job. Import after step 2, so the job's step type
   `custom.ChatWidget.PurgeJourneyData` is registered.
4. **Schedule the retention job** daily in **Administration > Operations > Jobs**.
   Sandboxes disable scheduled custom jobs; use **Run Now** there.
5. **Consent.** Journey tracking follows the session's tracking consent
   (`session.trackingAllowed`). Keep the storefront's consent banner enabled.

## Walkthrough with sandbox screenshots

Captured on sandbox `zyeu-002`, site `RefArch_Practice`, on October 7, 2026.
Storefront screenshots were taken with headless Chrome; Business Manager
screenshots and emails were supplied by the author.

### 1. Launcher and start menu

The widget opens automatically once per browser session and can be reopened from the launcher.

| Closed | Guest menu | Signed-in menu |
| --- | --- | --- |
| ![Launcher button](docs/images/storefront-launcher.png) | ![Guest start menu](docs/images/guest-menu.png) | ![Signed-in start menu](docs/images/signed-in-menu.png) |

<details>
<summary><strong>Mobile</strong></summary>

![Widget on a 390 px wide phone screen](docs/images/mobile-widget.png)

</details>

### 2. Browse and search

| Categories | Subcategories | Product carousel |
| --- | --- | --- |
| ![Top-level categories](docs/images/browse-categories.png) | ![Mens subcategories](docs/images/browse-subcategories.png) | ![Mens product carousel](docs/images/product-carousel.png) |

| Search | Results | No results |
| --- | --- | --- |
| ![Search form](docs/images/search-form.png) | ![Results for shirt](docs/images/search-results.png) | ![No products match](docs/images/search-no-results.png) |

### 3. Choose options and add to cart

| Options | Ready to add | Added |
| --- | --- | --- |
| ![Variation chooser](docs/images/variation-chooser.png) | ![Color and size selected](docs/images/variation-ready.png) | ![Added to cart](docs/images/added-to-cart.png) |

### 4. Cart and promotions

| Cart | Quantity updated | Promo code rejected |
| --- | --- | --- |
| ![Cart with shipping methods](docs/images/cart.png) | ![Quantity changed to 2](docs/images/cart-quantity-updated.png) | ![Coupon cannot be added](docs/images/cart-coupon-error.png) |

| Promotions (none active) | Guest checkout |
| --- | --- |
| ![No promotions available](docs/images/promotions.png) | ![Sign in to checkout](docs/images/checkout-sign-in-required.png) |

### 5. Sign in, register, reset password

| Sign in | Wrong credentials | Registration error |
| --- | --- | --- |
| ![Sign-in form](docs/images/sign-in-form.png) | ![Invalid login or password](docs/images/sign-in-error.png) | ![Confirm email mismatch](docs/images/register-error.png) |

| Reset password | Reset requested |
| --- | --- |
| ![Reset password form](docs/images/reset-password-form.png) | ![Check your email](docs/images/reset-password-sent.png) |

The reset response is the same whether or not the account exists, so the widget cannot be used to discover accounts.

### 6. Account

| Summary | Edit profile |
| --- | --- |
| ![Account summary](docs/images/account-summary.png) | ![Profile form](docs/images/profile-form.png) |

| Addresses | Add address | Added |
| --- | --- | --- |
| ![Address book](docs/images/addresses.png) | ![New address form](docs/images/address-form.png) | ![WidgetDemo added](docs/images/address-added.png) |

| Delete prompt | Deleted |
| --- | --- |
| ![Delete confirmation](docs/images/address-delete-confirm.png) | ![Address deleted](docs/images/address-deleted.png) |

Address changes go through SFRA's own `Address-SaveAddress` and `Address-DeleteAddress`, so the shopper also receives the store's standard "Account edited" email:

![Account edited email sent after the widget changed the address book](docs/images/account-edited-email.png)

| Saved cards | Order history | Order details |
| --- | --- | --- |
| ![Masked saved Visa](docs/images/saved-cards.png) | ![Order list](docs/images/order-history.png) | ![Order details](docs/images/order-details.png) |

### 7. Checkout in the widget

| Delivery address | Shipping method | Payment |
| --- | --- | --- |
| ![Saved delivery addresses](docs/images/checkout-delivery.png) | ![Shipping methods](docs/images/checkout-shipping-method.png) | ![Saved card and CVV](docs/images/checkout-payment.png) |

| Review | Placed, with review form |
| --- | --- |
| ![Review and place order](docs/images/checkout-review.png) | ![Order 00000102 placed](docs/images/order-confirmation.png) |

The security code goes only to `CheckoutServices-SubmitPayment` and is never stored.

#### Proof the order is real

The widget places a genuine SFCC order through `CheckoutServices-PlaceOrder`. The store's
standard confirmation email arrived at 16:52 for the same order number and total the widget
showed (00000102, $213.14), with the variant, saved card, address and shipping method chosen
in the widget:

![Order confirmation email for 00000102, total $213.14](docs/images/order-confirmation-email.png)

The order's journey in Business Manager carries the same order number and the review
([see below](#journeys-and-reviews)).

### 8. Review the order and sign out

| Comment without consent | Review saved | Signed out |
| --- | --- | --- |
| ![Consent required](docs/images/review-consent-error.png) | ![Thank you](docs/images/review-thank-you.png) | ![Signed out](docs/images/signed-out.png) |

## Business Manager

### Custom object types

**Administration > Site Development > Custom Object Types**

![ChatWidgetJourney attribute definitions](docs/images/bm-journey-type.png)

![ChatWidgetActivity attribute definitions](docs/images/bm-activity-type.png)

### Journeys and reviews

**Merchant Tools > Custom Objects > Manage Custom Objects > ChatWidgetJourney**

![Journey list](docs/images/bm-journey-list.png)

The journey for order 00000102: status `reviewed`, rating 5, comment stored with consent.

![Journey with review](docs/images/bm-journey-review.png)

### Activity trail

**Merchant Tools > Custom Objects > Manage Custom Objects > ChatWidgetActivity**

![Activity list](docs/images/bm-activity-list.png)

![Activity product_carousel_loaded for category mens](docs/images/bm-activity-record.png)

To follow one journey, search activities by `custom.journeyKey` in the Advanced search.

### Retention job

**Administration > Operations > Jobs > ChatWidget-PurgeJourneyData**

![Purge job history](docs/images/bm-purge-job.png)

![Job log: Journey retention removed 0 objects](docs/images/bm-purge-job-log.png)

These runs used the job's original `site-id` of `RefArch`, so they cleaned up
an empty site and removed nothing. Set `site-id` to the storefront site before importing.

| Parameter | Default | Effect |
| --- | --- | --- |
| `ActivityRetentionDays` | 90 | Deletes activities older than this |
| `JourneyRetentionDays` | 365 | Deletes journeys (and their reviews) inactive for longer than this |
| `CustomerNo` | empty | Erases that customer's journeys and activities, including guest activity recorded earlier in the same journeys |

## Architecture

| Layer | Files |
| --- | --- |
| Widget JSON routes | `cartridge/controllers/ChatWidget.js` |
| Display-safe projections of SFRA models | `cartridge/scripts/helpers/chatWidgetHelpers.js` |
| Journey audit trail | `cartridge/scripts/helpers/journey.js` |
| Route observers on inherited SFRA routes | `cartridge/controllers/{Cart,Account,Address,PaymentInstruments,CheckoutShippingServices,CheckoutServices,Product,Order,Login}.js` |
| Retention job step | `steptypes.json`, `cartridge/scripts/jobs/purgeJourneyData.js` |
| UI | `templates/default/components/chatwidget/widget.isml`, `client/default/js/chatWidget.js`, `client/default/scss/chatWidget.scss` |
| Layout overlays | `templates/default/common/layout/{page,checkout,pdStorePage,pdComponentPage}.isml` include the widget |

The widget reuses SFRA's existing JSON routes for every write that SFRA already
supports: `Cart-AddProduct`, `Cart-UpdateQuantity`, `Cart-RemoveProductLineItem`,
`Cart-AddCoupon`, `Cart-RemoveCouponLineItem`, `Cart-SelectShippingMethod`,
`Account-Login`, `Account-SubmitRegistration`, `Account-SaveProfile`,
`Address-SaveAddress`, `Address-DeleteAddress`, `PaymentInstruments-DeletePayment`,
`CheckoutShippingServices-SubmitShipping`, `CheckoutServices-SubmitPayment` and
`CheckoutServices-PlaceOrder`. `ChatWidget-*` routes cover reads and the few
writes that SFRA only offers as page redirects: set default address, logout and
password reset. Order reviews are also handled by `ChatWidget-*` routes.

The widget sends an `X-Chat-Widget: 1` header with every request. The overlay
controllers use `server.prepend` to listen for `route:Complete` only when that
header is present, and record the final outcome. Storefront behaviour of these
routes does not change. Every POST fetches a fresh CSRF token from
`ChatWidget-AuthToken`, because sign-in and sign-out rotate it.

## Journey tracking

* `ChatWidgetJourney` (key = UUID stored in `session.custom`): one record per
  browser-session journey. It holds the site, locale, customer number (after
  sign-in), status (`active`, `ordered`, `reviewed`, `closed`), order number and
  the review (rating, consented comment, timestamp).
* `ChatWidgetActivity` (key = UUID): append-only events linked by `journeyKey`
  with `action`, `result`, `entityID`, `context`, `customerNo` and `occurredAt`.
* Nothing is written when the shopper has not allowed tracking for the session
  (`session.trackingAllowed`). Submitting a review is an explicit action, so it
  is always stored.
* The trail never stores passwords, card numbers, CVV, CSRF tokens, addresses,
  e-mail addresses, search phrases or address nicknames. A review comment is
  stored only when the shopper ticks the consent checkbox.
* Every write runs in `Transaction.wrap` inside `try/catch`. Failures are logged
  to `Logger.getLogger('chat-widget', 'journey-tracking')` and never block
  shopping. The retention job logs to category `journey-retention`.

## Payment limitation

Checkout in the widget is available to signed-in shoppers. The widget uses
saved cards through the standard `SubmitPayment` → `PlaceOrder` services, and
asks for the security code, which goes only to `CheckoutServices-SubmitPayment`
and is never stored. In-widget payment is enabled only for processors listed
in `IN_WIDGET_CARD_PROCESSORS` (`BASIC_CREDIT`). For other processors (hosted
fields, 3-D Secure or redirect flows), for sites without saved cards, and for
adding new cards, the widget explains what is still needed. It links to the
secure checkout payment step, where the basket, address and shipping method are
already set.
