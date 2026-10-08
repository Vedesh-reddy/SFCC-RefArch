# Social gifting: repository assessment and implementation design

Assessment date: 7 October 2026. Status: pre-implementation design snapshot. The implementation and its verification limits are documented in `cartridges/plugin_socialgifting/README.md`. This document supplies the assessment requested in section 41 before generation of the cartridge. Proposed files and definitions below are specifications, not claims of implemented functionality.

## 1. Current architecture

| Area | Repository evidence | Consequence |
|---|---|---|
| SFRA | Root `package.json` reports 8.0.0; `cartridges/modules/server` supplies the route framework | Use SFRA controllers, CommonJS, ISML and cartridge inheritance. The deployed compatibility mode is not established by package version. |
| Cartridge path | `plugin_smartcommerce/README.md` documents `plugin_smartcommerce:plugin_customwishlist:plugin_chatwidget:plugin_productreviews:app_storefront_base` | Prepend `plugin_socialgifting`. This is a documented path, not a verified Business Manager setting. Preserve the site's existing remaining entries. |
| Wishlist | `plugin_customwishlist/cartridge/scripts/customWishlist.js` uses native `ProductList.TYPE_WISH_LIST`, selects the first wishlist, and stores price alerts on `ProductListItem` | Create separate native gift registry lists. Do not repurpose the existing wishlist or its first-list lookup. Reuse product display conventions, not wishlist ownership assumptions. |
| Authentication | Base login middleware and `req.currentCustomer.raw`; Smart Commerce additionally supplies email OTP controllers | Trust the authenticated platform customer, never submitted customer IDs. Membership remains independent of authentication mechanism. |
| CSRF | Base middleware redirects/logs out on failure, then calls `next()` | New JSON mutation middleware must terminate on failure. Merely adding the existing middleware does not prove a mutation cannot run. |
| Checkout | Base `CheckoutServices-PlaceOrder` calls `createOrder`, payment authorization, `app.post.auth`, fraud detection and `placeOrder` | Attach to actual server execution; there is no generic registered post-order hook in this repository that automatically performs registry accounting. |
| Existing checkout overlay | Smart Commerce `scripts/checkout/checkoutHelpers.js` inherits via `module.superModule`; enforces pickup, holds export for editing, handles price locks and sends pickup email after placement | Social Gifting must preserve this chain. Do not wrap the entire inherited placement helper in an outer transaction: it can send mail. |
| Order edits | Smart Commerce `scripts/orderSelfService.js` and `controllers/OrderEdit.js` expose order editing, cancellation and delivery changes | Registry shipment changes and cancellation accounting must participate; a successful initial purchase is not the end of the lifecycle. |
| Payments | Base hook registrations include default/basic-credit processors; basic-credit contains sample token generation | No production contribution provider is established by repository inspection. These sample processors cannot substantiate captured contribution payments. |
| Email | Base `scripts/helpers/emailHelpers.js` dispatches `app.customer.email` with `dw.net.Mail` fallback; Smart Commerce wraps it | Reuse the hook for notifications outside transactions. The fallback does not expose delivery confirmation; email delivery cannot be claimed exactly once. |
| Existing metadata | `ProductReview`, `ChatWidgetJourney`, `ChatWidgetActivity`, `SmartPriceHistory`, `SmartProductAlert`, `SmartPriceLock`; custom Wishlist item attributes and Smart Commerce order/PLI/shipment/store/shipping-method attributes | Prefix new metadata `sg` / `SG` and do not overwrite existing import directories. |
| Jobs | Cartridge-root `steptypes.json` and separate `metadata/*/jobs.xml`; site-scoped task modules return status | Follow this layout, with closed iterators, bounded batches, retryable state and nonparallel job execution. |
| Logging | Named log files/categories through `Logger.getLogger`, e.g. `smart-commerce/checkout-order` and `custom-wishlist/price-drop-job` | Use `social-gifting`, `registry`, `group-gift`, `registry-security`; log identifiers and fixed error codes, not request bodies. |
| Build/tests | `sgmf-scripts`, cartridge-selectable `webpack.config.js`, Babel, Sass, ESLint Airbnb legacy, ISML lint; Mocha/Chai/Proxyquire/Sinon installed | Add no new runtime dependency. Use existing build and testing tools. Backend code must independently match the deployed Script API/runtime. |
| Working tree | Root package changes and untracked Smart Commerce cartridge/metadata/tests existed before this assessment | Preserve that work. It has not been treated as a deployed or verified dependency. |

No sandbox import, deployment, payment-provider configuration, active cartridge path or distributed concurrency behavior was verified during this assessment.

## 2. Proposed architecture

Use native Product Lists for registry ownership, event information and products. SFCC supports gift registry lists, event types, registrants and shipping references natively. Keep social records and operational ledgers in site-scoped Custom Objects. [ProductList API](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_customer_ProductList.html)

Request flow: HTTPS controller → terminating security middleware → domain helper → short platform transaction → explicit storefront model → escaped template/JSON. External payment and email calls happen after commit. Scheduled workers handle recovery and lifecycle transitions.

Event type is data (`WEDDING`, `BIRTHDAY`, `ANNIVERSARY`, `BABY_SHOWER`, `HOUSEWARMING`, `FESTIVAL`, `CUSTOM`), independent of membership, item and funding logic. Co-registrant display data does not confer co-owner permissions. No generic persistence framework or JSON blob containing the entire registry.

Registry transitions: DRAFT → ACTIVE → EVENT_COMPLETED → ARCHIVED. An owner may archive earlier; no destructive deletion once orders or money exist. Public access requires ACTIVE or deliberately visible EVENT_COMPLETED state. ARCHIVED is owner/co-owner read-only; old share links become unavailable. All writes recheck current status.

## 3. Cartridge and artifact layout

All paths in this section are planned, relative to the repository root.

```text
cartridges/plugin_socialgifting/
  package.json
  hooks.json
  steptypes.json
  README.md
  cartridge/
    plugin_socialgifting.properties
    controllers/
      Registry.js
      RegistryComment.js
      RegistryPoll.js
      RegistryReservation.js
      RegistryCheckout.js
      GroupGift.js
      GroupGiftPayment.js
    models/
      registry.js
      registryItem.js
      registryMember.js
      registryPoll.js
      registryActivity.js
      groupGift.js
    scripts/
      middleware/socialGifting.js
      helpers/
        registryHelper.js
        registryPermissionHelper.js
        registryItemHelper.js
        invitationHelper.js
        registryCommentHelper.js
        pollHelper.js
        reservationHelper.js
        registryCheckoutHelper.js
        purchaseHelper.js
        groupGiftHelper.js
        contributionHelper.js
        activityHelper.js
        notificationHelper.js
      util/
        token.js
        validation.js
        money.js
        preferences.js
      services/paymentAdapter.js
      jobs/
        registryLifecycle.js
        reconcilePurchases.js
        reconcilePayments.js
        sendNotifications.js
        purgeExpiredData.js
    templates/default/
      registry/
        dashboard.isml
        create.isml
        edit.isml
        registryPage.isml
        registryHeader.isml
        registryItem.isml
        collaborators.isml
        comments.isml
        poll.isml
        activityFeed.isml
        reservation.isml
        checkout.isml
      groupGift/
        groupGift.isml
        contribute.isml
        progress.isml
        contributors.isml
      socialGifting/email/
        invitation.isml
        purchase.isml
        contribution.isml
        funded.isml
        comment.isml
        pollReminder.isml
        eventReminder.isml
        reservationExpiration.isml
    templates/resources/socialgifting.properties
    client/default/js/socialGifting.js
    client/default/scss/socialGifting.scss
metadata/social-gifting/
  meta/custom-objecttype-definitions.xml
  meta/system-objecttype-extensions.xml
  jobs.xml
  services.xml
test/unit/plugin_socialgifting/
  registry.js
  permissions.js
  invitations.js
  items.js
  comments.js
  polls.js
  reservations.js
  purchases.js
  contributions.js
  privacy.js
  middleware.js
test/integration/plugin_socialgifting/
  lifecycle.js
  checkout.js
  concurrency.js
  payments.js
```

Provider-specific service modules and webhook configuration are added when a provider is selected. No mock adapter is enabled in production. No Page Designer `experience` directory is needed for this scope.

## 4. Native data model

| Storage | Authoritative data |
|---|---|
| ProductList, TYPE_GIFT_REGISTRY | Native owner, name, description, eventDate, eventType, registrant/coRegistrant and delivery-address references; custom registry lifecycle/privacy metadata |
| ProductListItem | Native exact product reference, desired quantity, priority; custom public key, notes, status and actor reference |
| ProductListItemPurchase | Native purchase records where suitable; do not put anonymous donor identity into native fields that other list APIs may expose |
| Custom Objects | Membership, invitations, comments, polls, votes, reservations, capacity accounting, contributions, order deduplication, notifications and activity |
| Profile | No registry collection or duplicated membership JSON; optional notification consent only if existing consent facilities cannot represent it |
| Basket/PLI/Shipment | Validated registry context, reservation capability and private delivery marker |
| Order/PLI | Immutable purchase context and reconciliation status; no share token |

Purchased/reserved totals are maintained by the registry accounting service and verified against ledgers; they are not accepted from request parameters. Native purchase records are a projection if the accounting ledger is authoritative: do not sum both. Native item product references can become unavailable when products are removed, so models must handle null products. [ProductListItem API](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_customer_ProductListItem.html)

Remaining is `max(0, desired - purchased - activeReserved)`. All quantities are bounded positive whole units for the initial jewellery scope. An actor's own reservation is credited when converting to purchase, not subtracted twice. Do not allow desired quantity below committed purchases plus active reservations. Product master selection must resolve to an online exact variant before addition; standalone products remain allowed. Bundles, option products and fractional quantities require explicit validated support rather than silently losing configuration.

## 5. Custom Object definitions and lookup strategy

Every type is site-scoped with a string primary key, versioned schema and platform creation/modified timestamps. `enum` below means a constrained metadata enum; amount fields are canonical decimal strings. Dates with times use `datetime`. Internal references never enter public models.

| Type | Unique key | Required custom attributes |
|---|---|---|
| SGRegistry | Random public registry key | listID:string, ownerNo:string, slug:string, status:enum, activateAt:datetime, eventAt:datetime, archiveAt:datetime; acts as lifecycle/directory projection |
| SGRegistrySlug | Normalized slug | registryKey:string; uniqueness claim, updated atomically with rename; old slugs retained as tombstones according to policy |
| SGRegistryMember | Hash(registryKey, customerNo) | registryKey:string, customerNo:string, role:enum, status:enum; queried by customerNo for dashboard |
| SGRegistryInvitation | SHA-256 token hash | registryKey:string, invitedEmail:email, role:enum, expiresAt:datetime, status:enum, acceptedBy:string, acceptedAt:datetime |
| SGRegistryComment | Random comment key | registryKey:string, itemKey:string, authorNo:string, text:text, editedAt:datetime, state:enum |
| SGRegistryPoll | Random poll key | registryKey:string, title:string, description:text, options:text (bounded validated JSON of public item keys), startAt/endAt:datetime, visibility:enum, allowGuest/multiple/resultsEarly:boolean, status:enum |
| SGRegistryVote | Hash(pollKey, voterKey) | registryKey:string, pollKey:string, voterHash:string, choices:text (bounded option keys), actorType:enum |
| SGRegistryItemState | Hash(registryKey, itemKey) | registryKey:string, itemID:string, desired/purchased/reserved:int, revision:int; shared contention object for quantity transitions |
| SGRegistryReservation | Random reservation key | registryKey:string, itemKey:string, actorHash:string, quantity:int, expiresAt:datetime, status:enum, orderNo:string |
| SGGroupGift | Random gift key | registryKey/itemKey:string, target/paid/held/refunded:string, currency:string, status:enum, expiresAt:datetime, revision:int, fulfillmentOrderNo:string |
| SGContribution | Random contribution key | giftKey/registryKey:string, amount/refundedAmount:string, currency:string, customerNo:string optional, displayName:string optional, anonymous:boolean, provider:string, paymentID:string, orderNo:string optional, status:enum, holdExpiresAt:datetime, reconciliationState:enum |
| SGPaymentEvent | Hash(provider, merchantAccount, eventID) | contributionKey:string, paymentID:string, eventType:enum, payloadDigest:string, state:enum, processedAt:datetime; no raw provider payload |
| SGPaymentClaim | Hash(provider, merchantAccount, paymentID) | contributionKey:string; prevents one payment funding different contributions even with distinct event IDs |
| SGRegistryPurchase | Hash(orderNo, PLI UUID, operation) | registryKey/itemKey:string, orderNo:string, lineItemID:string, quantity:int, reservationKey:string, anonymous:boolean, status:enum |
| SGRegistryActivity | Random activity key | registryKey:string, type:enum, itemKey:string optional, actorNo:string optional, anonymous:boolean, visibility:enum, occurredAt:datetime; no raw email/order/payment payload |
| SGNotification | Hash(eventKey, recipientKey, channel) | registryKey:string, eventType:enum, recipientRef:string, status:enum, attempts:int, nextAttemptAt:datetime, leaseUntil:datetime; safe bounded template data |
| SGAbuseBucket | Hash(action, subjectHash, window) | count:int, expiresAt:datetime; secondary application limit behind edge controls |

Use direct key access for permission checks, slug lookup, invitation acceptance, votes and idempotency. Custom Object keys are unique; parameterized queries and explicitly closed iterators are required. [CustomObjectMgr API](https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-script-api/dw.object.CustomObjectMgr.html)

List reads are bounded and scoped by registryKey/pollKey; jobs query status and due timestamps. Queryability is not a promise of arbitrary SQL indexes. Validate filter/sort behavior on the target instance; do not invent relational index XML. Measure high-volume ledger queries and move financial coordination to a transactional service if platform contention/quotas make this unsuitable. Do not create one unbounded JSON document for votes or contributions.

## 6. System Object extensions

All names are new and prefixed; existing wishlist/Smart Commerce attributes stay intact.

| Object | Proposed custom attributes |
|---|---|
| ProductList | sgRegistryKey:string; sgStatus/sgVisibility:enum; sgShareTokenHash:string; sgShareVersion:int; sgCoverReference:string; sgTimeZone:string; sgActivateAt/sgRevealAt:datetime; sgSecretGiftMode:boolean; individual sgShowOwnerNames, sgShowEventDate, sgShowContributorNames, sgShowComments, sgShowPolls, sgShowPurchasedItems, sgAllowAnonymousGifts, sgAllowGuestVoting, sgAllowGroupGifting:boolean |
| ProductListItem | sgItemKey:string; sgNotes:text; sgAddedBy:string; sgAllowGroupGifting:boolean; sgStatus:enum; sgVisibility:enum; sgGroupGiftKey:string optional |
| Basket | sgRegistryKey:string; sgCheckoutMode:enum; sgDeliveryReference:string; sgContextVersion:int |
| ProductLineItem | sgRegistryKey, sgRegistryItemKey, sgReservationKey:string; sgGiftPurchase/sgAnonymousGift:boolean; sgContextVersion:int |
| Shipment | sgPrivateRegistryDelivery:boolean; sgRegistryKey:string; sgDeliveryReference:string |
| Order | sgHasRegistryGifts:boolean; sgRegistryProcessingState:enum; sgRegistryProcessedAt:datetime; sgRegistryContextVersion:int |

Explicitly verify Basket→Order and PLI custom-attribute copying on the sandbox. Set and validate the order snapshot server-side instead of assuming copy behavior. Never store raw invitation/share capabilities in these objects.

## 7. Site preferences

Use a Social Gifting Business Manager group. Validate numbers at read time and cap malformed settings. Initial imports keep transaction-bearing features disabled until integration tests pass.

| Preferences | Type / proposed default |
|---|---|
| SocialGiftingEnabled, WeddingRegistryEnabled, GroupGiftingEnabled | boolean / false |
| AnonymousGiftingEnabled, RegistryCommentsEnabled, RegistryPollsEnabled, RegistryReservationEnabled, GuestVotingEnabled | boolean / false |
| CommentsRequireLogin | boolean / true; false must not enable unauthenticated comments without an implemented verified guest identity |
| RegistryReservationMinutes | int / 15 |
| RegistryArchiveDays | int / 90 after event |
| InvitationExpirationHours | int / 72 |
| GroupGiftExpirationDays | int / 30, bounded by campaign/event configuration |
| MaxRegistryItems, MaxRegistryCollaborators, MaxPollOptions | int / 100, 20, 6 |
| MaxRegistriesPerCustomer, MaxCommentLength, RegistryPageSize | int / 10, 2000, 20 |
| GroupGiftPaymentHoldMinutes, RegistryJobBatchSize | int / 15, 100 |
| RegistryActivityRetentionDays, RegistryInvitationRetentionDays | int / 180, 30 after expiry/acceptance |
| RegistryPaymentRetentionDays | int / merchant retention policy; no automatic financial deletion until explicitly configured |
| RegistryEventReminderDays, RegistryPollReminderHours | int / 7, 24 |
| RegistryAnalyticsEnabled | boolean / false; existing consent required |
| RegistryPaymentServiceID | string / empty; credentials belong in service credentials, not site preferences |

Set site currency as the campaign currency at creation and freeze it. Contribution minimum/maximum must be currency-specific decimal strings; a single INR amount cannot serve every locale/currency.

## 8. Routes and response contract

All routes use HTTPS. Page GETs generate CSRF where needed and do not mutate business state. Mutations use POST for compatibility with SFRA forms. AJAX returns `{success, data}` or `{success:false, error:{code,message}, fieldErrors}`. Use 400 validation, 401 authentication, 403 CSRF, 404 inaccessible object, 409 conflict, 429 rate limit and 503 temporarily unavailable. Do not leak existence through permission errors.

| Controller/routes | Method | Access / operation |
|---|---|---|
| Registry-Dashboard, Create, Edit | GET | Login; Edit requires owner/co-owner |
| Registry-View | GET | Public slug or authorized link session/member; status and per-field privacy projection |
| Registry-Save | POST | Login, CSRF; create or authorized update |
| Registry-Archive | POST | Owner, CSRF; soft archive |
| Registry-Share, RotateShare | POST | Owner/co-owner, CSRF; mint/rotate capability; invalidate old access version |
| Registry-AddProduct | POST | Owner/co-owner/editor, CSRF; validate exact product, limits and membership |
| Registry-RemoveProduct, UpdateProduct | POST | Owner/co-owner, CSRF; prevent destruction of committed purchase/funding history |
| Registry-Invite, RevokeMember | POST | Owner/co-owner, CSRF; cannot grant OWNER, remove owner or escalate own role |
| Registry-AcceptInvite | GET | Invitation landing/login; does not consume token |
| Registry-ConfirmInvite | POST | Login, verified invited email, CSRF; single-use acceptance |
| RegistryComment-List | GET | Authorized view and comments visible |
| RegistryComment-Add, Delete | POST | Member with comment permission; delete own comment or moderate as owner/co-owner |
| RegistryPoll-Create, Close | POST | Owner/co-owner, CSRF |
| RegistryPoll-View | GET | Visibility, timing and results policy enforced |
| RegistryPoll-Vote | POST | Authorized member or eligible guest; CSRF and deduplication |
| RegistryReservation-Create, Cancel | POST | Eligible viewer; CSRF; cancellation requires creator capability or permitted management |
| RegistryCheckout-Add | POST | Authorized registry view, CSRF; validates and stamps basket context |
| RegistryCheckout-Begin | GET | Dedicated private-delivery checkout projection |
| GroupGift-Create, Cancel | POST | Owner/co-owner; CSRF; cancellation initiates settlement/refund policy |
| GroupGift-View | GET | Registry access and safe contributor projection |
| GroupGift-Contribute | POST | Eligible viewer, CSRF, bounded decimal amount; create held contribution and provider session |
| GroupGiftPayment-Callback | POST | Provider authentication/signature, timestamp/replay controls, payload limits; no browser CSRF |

Pretty `/registry/<slug>` routing is an explicit site URL/edge mapping task; a controller alone does not create that URL. Canonical fallback is `URLUtils.https('Registry-View', 'slug', slug)`.

## 9. Permission matrix

| Action | OWNER | CO_OWNER | EDITOR | VIEWER | Guest |
|---|---|---|---|---|---|
| View permitted registry | Yes | Yes | Yes | Yes | Public or valid share access |
| Edit metadata/privacy | Yes | Yes | No | No | No |
| Archive | Yes | No | No | No | No |
| Invite/manage members | Yes | Yes, no owner changes | No | No | No |
| Add products | Yes | Yes | Yes | No | No |
| Remove/edit desired quantities | Yes | Yes | No | No | No |
| Comment | Enabled | Enabled | Enabled | Enabled | No initially |
| Delete own comment | Yes | Yes | Yes | Yes | No |
| Moderate others | Yes | Yes | No | No | No |
| Create/close polls | Yes | Yes | No | No | No |
| Vote | Enabled | Enabled | Enabled | Enabled | Poll + registry + site allow |
| Reserve/purchase/contribute | Eligible viewer | Eligible viewer | Eligible viewer | Eligible viewer | Eligible viewer |
| Create/cancel group gift | Yes | Yes | No | No | No |

OWNER is derived from native list ownership, not assigned by invitation. Recheck membership at mutation time; a cached role or share session alone cannot authorize administration. Ownership transfer is outside the initial routes and requires a separate explicit workflow.

## 10. Group Gift payment and concurrency design

Adapter operations: create payment session with idempotency key, authenticate callback, retrieve authoritative payment state, cancel/void, refund with idempotency key. Provider secrets remain in service credentials; service communication logging is disabled/redacted. The return-to-store URL is not proof of payment.

Parse bounded canonical amounts from strings; reject exponent notation, signs, excess currency precision, nonfinite values and currency changes. Use `dw.util.Decimal` for arithmetic and `dw.value.Money` for currency display/integration. Persist canonical strings, not browser totals or authoritative binary floating-point amounts.

Admission invariant: `paid + held <= target`. Within one short transaction, read current campaign, verify OPEN/unexpired, reserve capacity, create contribution CREATED and increment held. Only after commit call the provider using the contribution key for idempotency. Set PENDING when provider session is established. A timeout is UNKNOWN operationally: keep the hold and reconcile instead of releasing it while payment may still succeed.

Callback processing verifies merchant, payment, contribution, amount, currency and captured state. In one transaction, claim unique payment/event keys, inspect the contribution transition, move held to paid exactly once, update campaign, and append activity/outbox. An event ID alone is insufficient: providers can emit multiple events for one payment. Mark PAID only on confirmed capture. Duplicate terminal transitions have no effect.

For a target of 1000 with paid 900, simultaneous 100/200 requests may admit at most 100. No request may silently shrink a contribution. A capacity conflict returns 409 and refreshed availability. Funding status becomes FUNDED at the exact target; COMPLETED requires successful fulfillment, not merely receipt of money.

SFCC transactions provide atomic commit/rollback, but `Transaction.wrap` by itself is not evidence that a read-check-write sequence is serialized. The implementation must mutate the same campaign/item state object and prove contention behavior with genuinely parallel sandbox requests. Retry the entire operation after rollback with fresh reads, bounded attempts and the same idempotency key. No JS in-memory lock or CacheMgr lock. [Transaction API](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_system_Transaction.html)

Strict capacity is a release gate: if target-instance conflict behavior cannot demonstrate the invariant, use an external transactional coordinator with atomic conditional allocation before enabling payments. Do not label a counter/version attribute as compare-and-swap when SFCC exposes no such primitive.

Expired/failed payments release holds only after definitive provider cancellation/failure. Late capture after release is placed in reconciliation/refund-required state and is not added beyond the target. A refund subtracts only the newly confirmed refunded amount, idempotently; partial refunds retain PAID with refundedAmount, full refunds become REFUNDED. Whether a funded campaign reopens after refund depends on whether fulfillment has started; never automatically reopen an already ordered gift. Expired/cancelled campaigns stop new admissions while existing money is reconciled.

Fulfillment is a separate idempotent transition linked to a commerce order. Group cash cannot masquerade as a zero-price product. Freeze the target/quote policy, define taxes/shipping/price-change shortfalls and require the merchant's payment/OMS integration to support how collected funds pay for the eventual gift.

## 11. Security and privacy model

| Threat | Required control |
|---|---|
| IDOR/forged registry or item | Resolve public key to list; verify membership/view access; resolve item inside that list; recheck all relationships in domain helper |
| CSRF | Terminating platform-CSRF validation for every browser mutation, including guest vote/reservation; provider callback uses provider authentication |
| XSS | Plain bounded comment text; context-appropriate ISML encoding and client `textContent`; no user HTML, `innerHTML`, raw JSON in inline script or unvalidated cover URLs |
| Token guessing/replay | Cryptographically random >=256-bit capabilities, SHA-256 hashes at rest, expiry, one-time invitation consumption and rotating share version |
| Invitation impersonation | Authenticated verified email must match invited email; do not infer ownership merely from a profile email field |
| Vote manipulation | Unique poll/voter key, immutable validated choice set, server tally; guest session/cookie capability hashed server-side |
| Guest identity reset | Rate limits and risk-based CAPTCHA; cookie deletion remains a known guest-voting limitation, not a claim of one-human-one-vote |
| Money manipulation/webhook replay | Server amount/currency, provider verification, unique event and payment claims, contribution transition guard |
| Anonymous identity leakage | Explicit allowlisted models for every channel; anonymous donor becomes “Anonymous Guest”; exclude identifiers from feeds, email, analytics and HTML |
| Address leakage | Dedicated checkout projection, no guest address editing/saving, guarded order lookup/email/fulfillment surfaces |
| Bot/spam/email enumeration | Edge + application action limits, per-registry quotas, generic invitation responses, verified recipients, bounded payloads |
| Shared caching | Private/no-store for registry pages, session-bearing includes and JSON; no personal model in page cache |
| Logs and referral leakage | No capability/request-body logs; no-referrer token landing; no third-party analytics on token landing; redirect to clean URL after exchanging capability |

Use platform cryptographic randomness, with an executable test for output length because the documentation's parameter naming is inconsistent. Never reuse sample payment `Math.random()` token code. [SecureRandom API](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_crypto_SecureRandom.html)

Invitation tokens cannot live plaintext in a notification outbox. Generate at dispatch, persist only the hash before sending, and rotate on retry/resend so only the latest invitation is valid. Mail transport necessarily receives the URL; do not copy it into application logs or activity records.

Secret Gift Mode hides item-level purchase/reservation/funding details from owner and co-owner until revealAt (default eventAt), across JSON, HTML, activity, emails and dashboard. Show only permitted aggregate gift count. A buyer who is also owner does not get another person's hidden details. Owners may infer demand from buyer-visible availability on a public registry; absolute secrecy is incompatible with a publicly browsable availability list and must not be promised.

Delivery and financial records remain restricted operational data. Anonymous gifting does not erase records required for reconciliation/support. Revocation and archive invalidate previously established share access as well as URLs.

## 12. Basket, checkout and order integration

The first registry purchase checkout uses one registry and recipient per basket. Mixed normal/private-delivery baskets are rejected with a recoverable explanation until shipment separation is fully supported. Normal baskets retain their current path.

At add-to-basket: resolve registry/item/product server-side, validate visibility and capacity, establish actor-bound reservation, and stamp PLI context. Prevent line merging across registry/normal/anonymous contexts. Cart quantity changes and removals must adjust the reservation; client PLI metadata is never authoritative.

Before order creation: revalidate each line against native list membership, exact product, permitted quantity, actor reservation, anonymous preference and registry status. Convert short user reservations into order-owned capacity holds. Do not expire a hold while authorization/capture remains uncertain. Registry holds do not reserve SFCC physical inventory.

After successful server placement: execute idempotent purchase accounting with unique order/PLI ledger keys and outbox events. Keep capacity held through any accounting crash; reconciliation retries so a placed-but-unaccounted order cannot free capacity and cause over-purchase. On definitive order failure/cancellation, release/reverse once. Retry purchase accounting independently; do not rerun payment authorization because accounting failed.

`app.post.auth` runs before placement in this repository and is unsuitable as the sole purchase-success signal. The new checkout helper overlay chains to Smart Commerce. A custom `app.socialGifting.orderPlaced` hook is useful only if the real placement path explicitly invokes it; registration alone does nothing. OMS/API-created orders need the same accounting contract or must reject registry context until integrated.

Address privacy requires a dedicated registry branch of checkout, not simply hiding address text. Keep a server-side list delivery reference; obtain the address for tax/shipping/fulfillment without sending it to the purchaser. Suppress it in shipping/order models, browser responses, form values, confirmation emails, order history, guest lookup, tracking links and analytics. Prevent copying registry addresses into the purchaser's address book: base PlaceOrder explicitly gathers and saves shipping addresses after placement. Base checkout also has earlier address/form paths that need regression coverage.

Order-edit routes must deny changing the private recipient and redact their edit panels. Preserve buyer billing-address handling. Freeze a delivery snapshot at order creation so later registry edits cannot reroute existing orders. Shipping/payment providers may legitimately receive address data server-side; purchaser-facing provider pages and shipping notifications need separate privacy verification.

Avoid inserting a recipient address into an ordinary basket before all serialization paths are covered. Until privacy integration passes, fail closed for private delivery. A storefront-only model override cannot protect separately enabled OCAPI/SCAPI integrations.

## 13. Jobs and notifications

`RegistryLifecycleJob` runs every five minutes initially: activate scheduled registries, close due polls, expire invitations and eligible reservations, stop expired campaign admissions, complete events and archive due registries. Each action verifies state/time again inside its mutation and creates a unique notification event. An overdue record is treated as expired during requests even if the job has not run.

Separate steps reconcile order holds/purchases and provider payment/refund state, dispatch notifications, and purge eligible data. Store a bounded cursor/checkpoint where needed, close all iterators in finally, and report partial failures with ERROR plus counts. External calls occur outside object transactions. Job nonparallel settings do not replace protection against concurrent storefront requests.

Notification event types cover invitation, collaboration, comment, new/closing poll, purchase, contribution, 50/75/100 percent funding, event reminder and reservation expiry. Outbox writes join domain transactions; dispatch uses the existing email helper/hook with privacy-safe contexts. Threshold crossings receive deterministic event keys so retries do not generate new logical alerts. Retry with bounded backoff and dead-letter visibility; document at-least-once delivery and possible duplicate mail after a send/ack crash.

Retention is separately configured for social data, expired capabilities and financial audit records. Archival is not financial deletion. Registry deletion/customer erasure must preserve required operational records while removing optional public identity fields according to merchant policy.

## 14. Implementation phases and acceptance gates

| Phase | Working deliverable | Required checks |
|---|---|---|
| 1 Foundation | Metadata, preferences, native registry creation/edit/archive, permission helper, dashboard/create/edit templates | Create/update, forged IDs, unauthorized edit, CSRF abort, disabled flag, status transitions; XML import and browser smoke |
| 2 Products/sharing | Exact variant add/remove/quantities, safe public models, link rotation, registry page | Master rejection, foreign items, null product, privacy defaults, share rotation, private/archive access, mobile accessibility |
| 3 Collaboration | Secure invitations, membership, comments, activity and email events | Verified email acceptance, expired/replayed token, role escalation, XSS, unauthorized deletion, anonymity |
| 4 Polls | Poll creation/close/results, authenticated and guest voting | Duplicate parallel votes, valid choices, guest reset limitations, poll expiration, hidden results |
| 5 Gifting | Reservations, isolated basket context, complete private-address checkout, purchase/reversal ledger, secret gift views | Expiry, simultaneous last-unit checkout, forged PLI, anonymous purchase, duplicate accounting, crash recovery, every address surface, normal checkout/pickup/price-lock regression |
| 6 Group payments | Adapter + selected real provider, contribution capacity holds, callbacks, refunds, reconciliation and fulfillment | Failed/unknown payment, duplicate/out-of-order callback, concurrent admissions, 100% funding, overfunding rejection, late capture, partial/full refund, expiry, multi-currency precision |
| 7 Automation | Lifecycle/reconciliation/outbox/retention steps and job imports | Restart/partial failure, notification dedupe, no external calls in transactions, expired records enforced without jobs |
| 8 Hardening | Threat review, load/concurrency tests, operational dashboards, consented analytics | Real multi-request contention, quotas, edge controls, redacted logs, full existing suite and sandbox checkout regression |

Every phase includes actual CommonJS modules, ISML/client assets where relevant, metadata, test fixtures and documented commands before it is called complete. Unit mocks cannot prove distributed locking, provider authenticity, metadata import or address privacy.

Countdown uses a server UTC instant and a stored event timezone. Date-only input is interpreted in that timezone, not the browser timezone. Hide the timestamp when showEventDate is false. Client rendering is progressive enhancement with an accessible static date fallback.

Analytics is opt-in/consent-aware and emits only approved event names and nonsensitive metrics. Never attach membership, donor identities, capability URLs, address fields or payment references.

## 15. File creation sequence

Create the phase-specific subset of the layout in section 3, starting with package/properties, metadata, preferences/security/domain helpers, models, Registry controller and dashboard/create/edit templates. Add tests alongside each phase. Generate static assets using the existing cartridge build tooling. Do not create empty helper/template files for future phases.

Metadata lives in `metadata/social-gifting`, matching this repository's existing deployment layout rather than a duplicate cartridge-local import directory. `services.xml` contains service/profile definitions only; environment credentials are configured separately. `README.md` must distinguish locally tested, sandbox verified and provider verified capabilities.

## 16. Existing extension points

No direct changes to `app_storefront_base` are planned. Add the following overlays inside the new cartridge only when their phase needs them:

| Existing path (under a cartridge's `cartridge/`) | New overlay/action |
|---|---|
| `scripts/checkout/checkoutHelpers.js` in Smart Commerce/base | Same-path Social Gifting overlay with `module.superModule`; preserve create/place behavior and keep calls outside outer transactions |
| `controllers/CheckoutServices.js` in base | Conditional registry-specific route branch/replacement; delegate normal checkout; ensure recipient address never reaches base address-book copying |
| `controllers/Cart.js` in base | Registry-aware add/update/remove validation and line separation |
| `models/order.js`, `models/shipping.js` in base | Same-path inherited models with explicit private-delivery projection; audit dependent consumers |
| `scripts/helpers/addressHelpers.js` in base | Exclude private-recipient shipments from purchaser address collection as defense in depth |
| `scripts/orderSelfService.js` in Smart Commerce | Inherited registry-aware delivery-edit/cancellation handling; coordinate reversal events |
| `templates/default/account/dashboardProfileCards.isml` in base | Account entry for My Registries, preserving existing cards |
| `templates/default/product/components/addToCartButtonExtension.isml` in Custom Wishlist | Preserve wishlist UI and add a registry selector for eligible customers |
| Order confirmation/history/lookup templates and email contexts | Overlay only necessary surfaces following full address-data tracing; inherit Smart Commerce order-details behavior |
| Root `package.json` | Add new cartridge JS/SCSS/upload scripts and focused test command without replacing existing uncommitted edits |
| Root `README.md` | Installation link once implementation exists |

Existing footer hooks are used by Wishlist and Smart Commerce. Avoid a new global footer hook for page-specific scripts; load registry assets from their templates. Cartridge order and hook composition must be tested if another extension becomes necessary.

## 17. Risks and unresolved integration facts

1. Deployed cartridge path, compatibility mode, site IDs and actual metadata may differ from local files. Confirm through read-only sandbox inspection before deployment.
2. No contribution provider/capture/refund configuration is established. Provider selection and merchant settlement/fulfillment rules are required for a working money flow; disabled adapters are not a completed payment feature.
3. Concurrent quantity and money admission must be demonstrated on SFCC. Atomic transactions alone do not establish a safe capacity algorithm.
4. Smart Commerce is uncommitted and adds order mutation, export holds, pickup and pricing behavior. Overlay ordering and cancellation recovery must be tested against it.
5. Standard checkout deliberately exposes delivery addresses in several channels. The private-address requirement is a checkout-wide feature with API/OMS/notification implications.
6. Guest-vote uniqueness is best-effort unless a stronger verified identity is required. Guest reservation abuse needs edge controls and short limits.
7. Secret mode cannot guarantee surprise against owners browsing an otherwise public gift list as guests.
8. Jewellery prices, availability, taxes, shipping, currency precision and event-time changes can invalidate contribution targets. Collected funds require an explicit shortfall/refund policy.
9. Gift campaigns must reserve their intended item capacity so individual checkout and later group fulfillment cannot both satisfy the same single desired unit.
10. Product List visibility and enabled headless APIs can bypass controller models if independently exposed. Review native list API access and custom-attribute response allowlists.
11. Mail fallback success is not delivery proof. Outbox retries are at-least-once and require monitoring.
12. Refund/cancellation events, abandoned CREATED orders, late captures and failed provider cancellation require durable reconciliation; scheduled expiry must not blindly release unsettled capacity.

Assessment validation: inspected local controllers, helpers, models, metadata, hooks, jobs and build configuration; cross-checked relevant Script API documentation. No feature tests were run because this deliverable changes documentation only. The assessment itself did not install or certify the cartridge. See the implementation README for current status.
