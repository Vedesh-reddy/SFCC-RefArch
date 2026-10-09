# plugin_affiliateproduct — AffiliateX

**Customer affiliate program for SFRA.** Shoppers generate a permanent affiliate code, share product links, and earn a single-use 10% voucher for every referred order that is paid, delivered and past its return window.

Screenshots were captured on sandbox `zyeu-002`, site `RefArch_Practice`, on October 9, 2026, against the deployed cartridge. The orders are real SFCC orders and the voucher is a real system-generated coupon code. Red boxes mark what the cartridge adds.

| # | Feature | Shopper entry point | Data | Job |
| --- | --- | --- | --- | --- |
| 1 | [Affiliate program and code](#1-affiliate-program-and-code) | Footer link, `Affiliate-Show` | `AffiliateProfile`, `AffiliateCustomerIndex` | — |
| 2 | [Share & Earn on the product page](#2-share--earn-on-the-product-page) | Product page | — | — |
| 3 | [Referral link tracking](#3-referral-link-tracking) | `?aff=CODE` product links | `AffiliateDailyStats`, cookie `affiliate-ref` | — |
| 4 | [Referral code at checkout](#4-referral-code-at-checkout) | Order summary panel | Basket and order attributes | — |
| 5 | [Prepaid-only referred orders](#5-prepaid-only-referred-orders) | Place order | — | — |
| 6 | [Reward engine](#6-reward-engine) | — | `AffiliateOrder`, `AffiliateReward` | `AffiliateProduct-ProcessRewards` |
| 7 | [Voucher security and redemption](#7-voucher-security-and-redemption) | Cart promo code | `AffiliateReward`, native coupon | — |
| 8 | [Affiliate dashboard](#8-affiliate-dashboard) | `Affiliate-Dashboard` | All of the above | — |
| 9 | [Voucher lifecycle](#9-voucher-lifecycle) | Email | `AffiliateReward` | `AffiliateProduct-MaintainRewards` |

---

### 1. Affiliate program and code

**What it does.** A footer link opens the program page. A signed-in customer generates a permanent 8-character code.

1. The **Affiliate Program** link sits in the footer (`footer-account` content asset).

   ![Footer link](docs/images/footer-link.png)

2. Anonymous shoppers see the program and a sign-in button. Login slot `rurl=4` brings them back to this page after sign-in or registration.

   ![Program page for anonymous shoppers](docs/images/landing-anonymous.png)

3. Signed in, the shopper generates a code.

   ![Generate my affiliate code](docs/images/landing-generate.png)

4. The code is shown with a copy button. Generating again returns the same code.

   ![Generated code copied](docs/images/landing-code.png)

**Rules**

- Codes use `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/I), come from `SecureRandom` and do not encode the customer number.
- One identity per customer: the `AffiliateCustomerIndex` key is the customer number, so a concurrent second request fails on the unique key and returns the first profile. A colliding code is retried.
- A merchant suspends a code by setting `AffiliateProfile.status` to `SUSPENDED`, or rotates it with `ROTATED`; the customer gets a new code on the next visit.

---

### 2. Share & Earn on the product page

**What it does.** Signed-in affiliates get a copyable link for the product they are viewing.

![Share & Earn link](docs/images/pdp-share.png)

Products with `affiliateExcluded = true` show no link:

![Excluded product](docs/images/pdp-excluded.png)

**How.** `product/components/socialIcons.isml` (SFRA copy plus one include) adds an uncached remote include, `Affiliate-Share`, so the cached product page stays cached.

---

### 3. Referral link tracking

**What it does.** Opening a `?aff=CODE` link validates the code, counts one click per session, stores a first-party cookie for the attribution window and shows a notice.

![Referral recognised](docs/images/pdp-referred.png)

The referral then appears in checkout, marked as coming from the link:

![Referral from the link at checkout](docs/images/checkout-referral-link.png)

**Rules**

- Cookie `affiliate-ref` is HttpOnly and Secure and lasts `AffiliateAttributionWindowDays` (30). It holds only the public code and the click time.
- Refreshes do not add clicks. The affiliate's own visits are not counted.
- The newest referral link wins.

---

### 4. Referral code at checkout

**What it does.** A "Referred by someone?" panel under the order summary lets the shopper remove the referral or enter a code. The code identifies the referrer; it never discounts the shopper's order.

1. Removing the referral ignores the link for this basket.

   ![Referral removed](docs/images/checkout-referral-removed.png)

2. Unknown codes are rejected.

   ![Unknown code rejected](docs/images/checkout-invalid-code.png)

3. A valid code is confirmed. It wins over any referral link.

   ![Code confirmed at checkout](docs/images/checkout-code-applied.png)

4. The referral is shown until the order is placed.

   ![Referral at place order](docs/images/checkout-review.png)

   ![Referred order placed](docs/images/order-confirmation.png)

5. A shopper cannot use their own code, by account or by email.

   ![Own code rejected](docs/images/checkout-self-referral.png)

6. Attempts are limited to 10 per session.

   ![Attempt limit](docs/images/checkout-too-many-attempts.png)

**How.** `checkout/orderProductSummary.isml` (SFRA copy plus one include) renders the panel only when `Checkout-Begin` sets `affiliateCheckout`. `CheckoutServices-PlaceOrder` (prepend) settles the attribution on the basket; the `checkoutHelpers` wrapper copies it to the order and records an `AffiliateOrder` snapshot. Lines whose product has `affiliateExcluded` do not count.

---

### 5. Prepaid-only referred orders

**What it does.** Referred orders may only use the payment methods in `AffiliatePrepaidPaymentMethods` (empty = `CREDIT_CARD`). The panel discloses this before payment. Otherwise place order is refused, and the shopper can remove the referral to pay another way.

![Referred order needs online payment](docs/images/checkout-prepaid-required.png)

Captured with the preference temporarily set to `COD`, so the card counted as not prepaid. Cancellation and return rights are not changed by a referral.

---

### 6. Reward engine

**What it does.** `AffiliateProduct-ProcessRewards` (every 30 minutes) moves each pending referral order forward:

| Order state | Result |
| --- | --- |
| Cancelled or failed | `CANCELLED`, no reward |
| Has a return case | `INELIGIBLE` |
| Not paid | waits (`reviewReason = NOT_PAID`) |
| Not shipped (order, or every shipment) | waits (`NOT_DELIVERED`) |
| First seen shipped | records `deliveredAt` |
| Within `AffiliateRewardDelayDays` of delivery | waits (`RETURN_WINDOW`) |
| Eligible value below `AffiliateMinimumOrderValue` | `INELIGIBLE` |
| Affiliate suspended | waits |
| Otherwise | issues one voucher, emails it |

After the referred order (`••••0301`) is placed, the dashboard counts the click and the order:

![Awaiting delivery](docs/images/dashboard-orders.png)

Order 00000301 was then set to Paid with its shipment Shipped, and order 00000304 was cancelled. Two job runs recorded delivery and issued the voucher:

![Delivered order and available voucher](docs/images/dashboard-reward.png)

**Rules**

- One reward per qualifying order. The reward key is `orderNo:v1`, so retries and parallel runs never issue twice.
- The voucher code comes from the native system-codes coupon `affiliate-reward` (`Coupon.getNextCouponCode()`), in the same transaction as the reward record.
- If no code is left, the order stays pending and the job reports `ERROR`.
- The reward email goes to the affiliate's account email after the transaction; the maintenance job retries it if it failed.

---

### 7. Voucher security and redemption

**What it does.** The 10% discount is a normal promotion (`affiliate-reward-10`) on the coupon. The cartridge adds ownership and lifecycle checks in `Cart-AddCoupon` and again at place order.

1. Another account cannot use the voucher.

   ![Voucher bound to its owner](docs/images/voucher-not-owner.png)

2. The owner gets 10% off.

   ![Voucher applied](docs/images/voucher-applied.png)

3. After the order, the voucher is single use.

   ![Voucher already used](docs/images/voucher-reused.png)

**Rules.** The voucher is valid only for its owner, while `ISSUED` and before `expiresAt` (30 days). Only one affiliate voucher is allowed per order. Single use is the coupon's native limit of 1 per code; placing the order marks the reward `REDEEMED`.

---

### 8. Affiliate dashboard

**What it does.** `Affiliate-Dashboard` shows totals, the code, six months of clicks, orders, deliveries and conversion, referral orders and the voucher wallet.

![Dashboard with full history](docs/images/dashboard-history.png)

Before any referral:

![Empty dashboard](docs/images/dashboard-empty.png)

**Privacy.** The affiliate sees only the last four digits of a referred order number and its eligible value, never the buyer's name, email or address.

---

### 9. Voucher lifecycle

`AffiliateProduct-MaintainRewards` (daily) handles issued vouchers:

- revokes them when the source order was cancelled or has a return case;
- expires them after `expiresAt`;
- retries a failed reward email;
- sends one reminder `AffiliateExpiryReminderDays` (5) before expiry.

A voucher that was already redeemed is not clawed back when its source order is returned later. This path is covered by unit tests, not screenshots.

---

## Installation

1. Cartridge path, leftmost:
   `plugin_affiliateproduct:plugin_socialgifting:plugin_smartcommerce:plugin_customwishlist:plugin_chatwidget:plugin_productreviews:app_storefront_base`
2. Build and upload: `npm run compile:js`, then `npx sgmf-scripts --uploadCartridge plugin_affiliateproduct`.
3. Zip `metadata/affiliate-product` and import it in **Administration > Site Development > Site Import & Export**. It contains:
   - five custom object types;
   - Product, Basket and Order attributes;
   - site preferences;
   - two jobs;
   - for `RefArch_Practice`: preference values, the `affiliate-reward` system-codes coupon (prefix `AX10`, 1 redemption per code) and the 10% promotion in campaign `affiliate-rewards`.

   Rename `sites/RefArch_Practice` and the job `site-id` for another site.
4. Add `<li><a href="$url('Affiliate-Show')$">Affiliate Program</a></li>` to the `footer-account` content asset.
5. Schedule `AffiliateProduct-ProcessRewards` every 30 minutes and `AffiliateProduct-MaintainRewards` daily.

## Site preferences (Affiliate Product group)

| Preference | Default |
| --- | --- |
| `AffiliateProgramEnabled` | false (true in the site archive) |
| `AffiliateRewardCouponID` | `affiliate-reward` in the site archive |
| `AffiliateRewardPercent` | 10 (display only; the promotion applies the discount) |
| `AffiliateVoucherValidityDays` | 30 |
| `AffiliateAttributionWindowDays` | 30 |
| `AffiliateRewardDelayDays` | 7 (the screenshots used 0) |
| `AffiliateMinimumOrderValue` | 0 |
| `AffiliatePrepaidPaymentMethods` | empty = `CREDIT_CARD` |
| `AffiliateExpiryReminderDays` | 5 |

## Data model

| Custom object | Key | Purpose |
| --- | --- | --- |
| `AffiliateProfile` | affiliate code | Identity, status and totals |
| `AffiliateCustomerIndex` | customer number | One identity per customer |
| `AffiliateOrder` | order number | Attribution snapshot, reward status and wait reason |
| `AffiliateReward` | `orderNo:v1` | Voucher ownership and lifecycle |
| `AffiliateDailyStats` | `code:YYYY-MM-DD` | Dashboard counters, kept 400 days |

The original specification listed twelve objects. The rest were folded in on purpose:

- **Raw click events:** not stored, because custom objects are not an analytics store. Daily counters are kept instead.
- **Order items:** eligible quantity and value live on `AffiliateOrder`.
- **Coupons:** the code lives on `AffiliateReward`.
- **Configuration:** site preferences.
- **Audit log:** log category `affiliate-audit`.
- **Fraud flags:** self-referral is blocked at checkout; `reviewReason` records why an order waits or is ineligible.

## Logging

`Logger.getLogger('affiliate-product', <category>)` with categories `affiliate-identity`, `affiliate-stats`, `referral-attribution`, `affiliate-rewards` and `affiliate-audit`.

## Tests

`npm run test:affiliateproduct` runs 23 unit tests:

- **Identity:** code alphabet and collisions, one identity per customer, rotation.
- **Attribution:** precedence and opt-out, self-referral, prepaid methods, the order snapshot.
- **Rewards:** payment and per-shipment delivery, cancellation and return, the return window, idempotent issuance, coupon exhaustion, minimum value.
- **Vouchers:** ownership, expiry and stacking, redemption, revocation, reminders, email retry.

## Not built yet

QR codes, tiers and badges, per-product share analytics, velocity-based fraud scoring, and a card on the account page. `account/dashboardProfileCards` is already overridden by plugin_socialgifting.
