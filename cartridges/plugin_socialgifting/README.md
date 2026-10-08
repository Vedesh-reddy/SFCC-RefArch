# Social gifting for this SFRA storefront

`plugin_socialgifting` adds event registries, exact-variant items, secure link sharing, invitations and roles, comments, polls, reservations, anonymous gifts, secret gift views, group contribution accounting and lifecycle jobs. It overlays SFRA and the existing Smart Commerce/Wishlist cartridges; it does not modify `app_storefront_base`.

The implementation is locally tested, **not sandbox-certified or deployed**. Purchases and group contributions are off by default. Import the metadata before adding the cartridge to the site path: inherited checkout/model code references those custom attributes even for ordinary orders.

## Install

1. Import `metadata/social-gifting/meta/custom-objecttype-definitions.xml` and `system-objecttype-extensions.xml` through Business Manager's metadata import/site archive workflow. Keep existing Smart Commerce and Wishlist metadata installed.
2. Run `npm run build:socialgifting`, then upload **only** `plugin_socialgifting` using your normal code-version workflow. The root upload command includes the existing cartridges as well; it is not a deployment prerequisite for this change.
3. Prepend to this storefront's cartridge path, preserving existing entries:

   ```text
   plugin_socialgifting:plugin_smartcommerce:plugin_customwishlist:plugin_chatwidget:plugin_productreviews:app_storefront_base
   ```

4. In **Site Preferences → Social Gifting**, enable `SocialGiftingEnabled` and the features you intend to test. Enable `WeddingRegistryEnabled` for weddings. Set `customerServiceEmail` to your configured sender. Email dispatch uses the existing `app.customer.email` integration with the SFRA mail fallback.
5. Update the site ID in `metadata/social-gifting/jobs.xml` (currently `RefArch_Practice`) before import. The import has no enabled triggers. Schedule lifecycle, order reconciliation and notification dispatch every five minutes initially. Job step definitions live at the cartridge root in `steptypes.json`.
6. Open `Registry-Dashboard` or **My Account → My Registries**. Create a registry and select an address from the owner's address book. Add a selected variant from the PDP or through the registry form. Public URLs use `Registry-View?slug=...`; `/registry/<slug>` needs a separate site URL mapping.

No gateway credentials, customer data, share tokens or card details are included in the cartridge or import files.

## Existing debit/credit cards

Contributions use **the storefront's existing checkout and payment processors**, as requested. This cartridge neither collects card data itself nor installs another payment provider.

Configure a dedicated online funding product, set its `sgContributionProduct` flag, and set its ID in `GroupGiftContributionProductID`. This funding instrument must be approved/configured by the merchant as non-shipping and non-taxable; the eventual jewellery fulfillment is a separate sale. Do not designate a normal jewellery SKU. Configure catalog availability/price-book eligibility and exclude it from merchandising and search. The contribution calculator sets the server-held amount, zero shipping/tax for this instrument, rejects discounts/coupons and requires an exact order total. Sites needing tax on contributions require a different merchant accounting integration before enabling this feature.

A contribution gets its own basket. Mixed baskets, quantity changes and normal add-to-cart checkout of the funding SKU are rejected. A successful return from checkout is not evidence of capture. Only placed orders with `Order.PAYMENT_STATUS_PAID`, the recorded currency and exact contribution amount enter the funded total. The installed gateway must set that authoritative state after capture. SFRA's sample basic-credit processor is not a live gateway and does not prove real capture.

`CREATED` holds expire before order creation. Once bound to an order, a hold stays `PENDING` until confirmed capture or an authenticated definitive failure. A failed/cancelled order alone does not prove that a gateway authorization/capture was voided; uncertain payments deliberately retain capacity for reconciliation.

The regular card gateway may already handle its callbacks. The reconciliation job observes its order updates. An optional `app.socialGifting.payment` hook can also expose `verifyCallback(rawRequest)` for `GroupGiftPayment-Callback`. Its trusted implementation must verify the raw body/signature, timestamp, merchant account, payment ownership and amount/currency; never return `verified: true` based on browser values. It returns:

- `verified`, `eventID`, `contributionKey`, `orderNo`, `type`.
- `type: CAPTURED`: update the server order's authoritative captured state first; the cartridge independently checks that order.
- `type: FAILED`: additionally return `definitive: true` only after confirmed provider cancellation/failure with no possible unsettled capture.
- `type: REFUND`: return provider-confirmed `cumulativeAmount` in the contribution currency. This is cumulative, not the individual refund delta. Refund deduplication and amount bounds happen inside the ledger transaction.

The callback is disabled when no authenticated hook exists. It is not a public browser refund API. Real gateway refunds/voids still belong to the existing payment integration/back office; recording a confirmed refund is not the act of sending money back.

## Fulfillment of funded campaigns

A campaign holds one desired item unit so individual checkout cannot simultaneously buy it. Reaching the target produces `FUNDED`, not a fictitious purchase.

The `custom.SocialGifting.FulfillGroupGifts` step calls the merchant's `app.socialGifting.fulfillment.createOrder(giftKey)` hook **outside a transaction**. Implement that hook using the funding/OMS integration and the gift key as a durable idempotency key. It must recover the same order after a retry, redeem collected funds without charging donors again, arrange private recipient delivery, and return the actual SFCC order number. Stamp `order.custom.sgGroupGiftKey` server-side. There is intentionally no browser route that can stamp it.

Completion verifies a placed, paid order, matching campaign/currency, one exact product unit and the exact funded total. It atomically converts the campaign reservation to a purchase and marks `COMPLETED`. The step returns `NOT_CONFIGURED` until this merchant integration exists; it is not scheduled by the default job import. Catalogue price changes, tax/shipping shortfalls and excess funds need a merchant settlement/refund policy. No product purchase is synthesized merely because money was collected.

## Storage and concurrency

Native private `ProductList.TYPE_GIFT_REGISTRY` and `ProductListItem` store ownership, event/product data and exact variants. Native lists remain private even when the cartridge's explicitly projected registry page is public. `SGRegistry` provides the directory/lifecycle projection; social data and operational records use site-scoped `SG*` Custom Objects. The XML files are the exact implemented schema; the earlier architecture document is a design snapshot.

The item-state ledger is authoritative for purchased/reserved quantities. Native `ProductListItemPurchase` records are not also incremented, preventing double accounting or identity leaks through another product-list API. Price-alert wishlist records are unchanged.

Every capacity transition updates its item/campaign aggregate and creates a unique durable `SGMutation` claim for the aggregate's current revision in the same transaction. A stale writer cannot reuse that revision. Do not delete these claims for live aggregates. Uniqueness violations roll back the whole request and return a retryable failure; no service/email call occurs inside these transactions. This algorithm still requires the included **real parallel sandbox tests** before production enablement; in-memory unit tests do not establish SFCC isolation behavior.

Contribution invariants: `paid + held <= target`, only captured payments count, one order/payment claim can fund one contribution, partial refunds subtract only newly confirmed refunded amounts. Expiry does not release unsettled payment holds. Purchased quantities use unique order/line ledger keys; retries cannot add twice. Authoritative order cancellation reverses the purchase once through reconciliation. Failed/abandoned pre-placement registry holds require operational resolution when payment finality is uncertain.

Queries are bounded, parameterized and close iterators. Reconciliation rotates pending records by last modification time. Revision claims and financial ledgers intentionally are not automatically purged; monitor Custom Object quotas and implement the merchant's audited financial-retention process. Activity, expired invitations and abuse data have bounded cleanup. Event/poll reminders and reservation-expiry notifications are deduplicated by the lifecycle worker. Higher volumes may require an external transactional coordinator rather than scaling this design beyond SFCC quotas.

## Privacy and checkout

Registry mutations validate authentication/role, object relationships, feature flags, input and CSRF on the server. Guests use server-side session capabilities for voting/reservation ownership; clearing cookies can still create another guest identity. Configure edge rate limits/CAPTCHA for public traffic; the included customer/session action limits are not an IP-wide bot defense.

One registry recipient per purchase basket is supported. The owner address is copied server-side and marked private, shipping edits/multiship/pickup and ordinary cart mutations are blocked, and checkout starts at payment. `models/address.js` redacts marked addresses for checkout/order/email models. The address-book helper excludes private shipments. Smart Commerce order editing is blocked for registry/contribution orders so it cannot expose/change the recipient or mutate paid ledger context. Buyers can cancel a still-unplaced registry basket from checkout or **My Registries → Cancel my registry checkout**.

The overlay preserves inherited order creation/placement, including Smart Commerce behavior. Registry metadata is copied explicitly to order lines before accounting. Accounting failure after successful placement is logged and retried by the job; the customer is not asked to pay again. Native inventory reservation remains SFCC checkout's responsibility, independent of the registry capacity ledger.

Anonymous donors remain visible only to authorized commerce operations. Public models contain no customer numbers, emails, addresses, payment IDs or raw tokens. Notifications are deliberately generic and omit item/donor details, including before secret-gift reveal. Secret mode suppresses item purchase/reservation/funding details for owners/co-owners before the reveal date. It cannot prevent an owner from independently visiting a public list as a guest and inferring availability.

Invitations require both possession of the emailed capability and login with the matching email. Only the digest is persisted, including in the invitation landing session. Token landing pages redirect to clean URLs and set no-referrer/no-store. Access logs at the edge must redact token query parameters too. Re-sharing rotates the previous link and its stored session capability.

Before enabling `RegistryPurchaseEnabled`, inspect the actual gateway's hosted pages, analytics, shipment messages, custom templates, OCAPI/SCAPI and OMS exports. This SFRA overlay does not alter separately exposed headless APIs or external provider UIs. Local redaction tests are not a claim that those integrations protect the recipient's address.

## Validation

```sh
npm run test:socialgifting
npm run lint:socialgifting
npm run build:socialgifting
./node_modules/.bin/stylelint 'cartridges/plugin_socialgifting/cartridge/client/default/scss/**/*.scss'
./node_modules/.bin/isml-linter --build cartridges/plugin_socialgifting/cartridge/templates/**/*.isml
```

The unit suite covers native registry creation, unauthorized access, invitation acceptance/replay/expiry, variants, quantities, comments/XSS encoding, poll voting, reservations, anonymous/idempotent purchases, exact money, holds, capture/replay, overfunding, refunds, expiration, archive/secret views, address redaction, CSRF, explicit order-context copying, fulfillment and cancellation. The revision test checks stale claims locally; it does not simulate a distributed database.

For opt-in concurrency tests, prepare a disposable sandbox with one active public registry, one unpurchased/unreserved desired-unit item and a separate open campaign with exactly 100 currency units remaining. Configure the funding SKU and use two independent sessions with empty baskets. Put session secrets in a local file outside the repo:

```json
{
  "sandbox": true,
  "baseURL": "https://YOUR-SANDBOX/on/demandware.store/Sites-YOUR-SITE-Site/en_US/",
  "registryKey": "YOUR-TEST-REGISTRY",
  "singleUnitItemKey": "YOUR-TEST-ITEM",
  "giftWith100Remaining": "YOUR-TEST-CAMPAIGN",
  "sessions": [
    { "cookie": "SESSION-A-COOKIE", "csrf": "SESSION-A-CSRF" },
    { "cookie": "SESSION-B-COOKIE", "csrf": "SESSION-B-CSRF" }
  ]
}
```

Run `SG_SANDBOX_FIXTURE=/absolute/path/to/local-fixture.json ./node_modules/.bin/mocha 'test/integration/plugin_socialgifting/*.js'`. These tests create and clean up holds, not card captures. Without that variable the tests explicitly skip.

Then verify in a real browser: create/edit/share/revoke; invitation login and acceptance; escaped comments; private/member/guest poll rules; selected PDP variant; reservation expiry; private guest and registered card checkout; confirmation/history/guest lookup/email address redaction; normal checkout/pickup/price-lock regression; actual card capture, failed/uncertain payments, duplicate gateway callbacks and partial/full refunds. Interrupt accounting and replay jobs. Confirm import/step availability and inspect logs without tokens or addresses.

## Remaining production integration work

- Business Manager import, live cartridge path, shipping/payment settings, sender configuration and scheduled jobs have not been applied by this change.
- Real gateway capture/refund and merchant-funded fulfillment must be configured and tested. There is no new card gateway or default fulfillment/void adapter.
- The sandbox/browser/payment/concurrency checks above have not run locally. Do not enable transactional features in production based solely on the unit suite.
- The initial UI uses explicit event timestamps with UTC offsets, generic comment/activity labels, bounded recent comments/polls, and one campaign per item. Full directory search, paging through older discussions, per-member display profiles, cover-image rendering and analytics dispatch are not implemented. Financial/token retention beyond the included cleanup requires a merchant policy and worker before high-volume rollout.

## Browser verification

See the [verification report and storefront screenshots](docs/verification.md). The current storefront has not activated this cartridge; the registry screenshot records that blocker.

## Social gifting storefront screenshots

Actual Chrome captures of the current storefront. The registry feature is not active yet.

### Existing storefront

The homepage loads successfully (HTTP 200).

![Existing storefront homepage](docs/screenshots/existing-storefront.png)

### Registry activation blocker

`Registry-Dashboard` returns HTTP 500: “Pipeline not found (Registry)”. This records the missing activation, not a working registry screen.

![Registry route showing the missing controller error](docs/screenshots/registry-route-unavailable.png)
