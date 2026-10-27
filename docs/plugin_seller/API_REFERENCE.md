# API reference

## Storefront controllers

Every route uses HTTPS. Every state change is a POST with an SFRA CSRF token. The seller is always taken from the signed-in customer.

### Seller Central (`Seller-*`)

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `Seller-Show` | GET | none | Landing page; members are redirected to the dashboard |
| `Seller-Apply` / `Seller-SubmitApply` | GET / POST | signed in | Start an application |
| `Seller-Application` | GET | `profile.read` | Status, e-mail verification, documents, details |
| `Seller-SaveApplication` | POST | `application.write` | Edit details (DRAFT, REJECTED) |
| `Seller-SendCode` / `Seller-VerifyCode` | POST | `application.write` | E-mail verification |
| `Seller-UploadDocument` / `Seller-WithdrawDocument` | POST (multipart) | owner | Documents |
| `Seller-SubmitApplication` | POST | `application.write` | Submit for verification |
| `Seller-Dashboard` | GET | `profile.read` | KPIs and performance |
| `Seller-Products`, `Seller-Product` | GET | `catalog.read` / `catalog.write` | Submissions |
| `Seller-SaveProduct`, `Seller-UploadImages`, `Seller-RemoveImage`, `Seller-SubmitProduct` | POST | `catalog.write` | Edit and submit |
| `Seller-Offers`, `Seller-Offer` | GET | `catalog.read` / `catalog.write` | Offers |
| `Seller-SaveOffer`, `Seller-SetStock` | POST | `catalog.write` | Price, terms, stock |
| `Seller-Orders`, `Seller-Order` | GET | `orders.read` | Seller orders |
| `Seller-Ship`, `Seller-RequestCancel` | POST | `orders.write` | Fulfillment |
| `Seller-Finance`, `Seller-Statement` | GET | `finance.read` | Balances, ledger, settlements |
| `Seller-PayoutAccount` | POST | `finance.write` | Connect the payout account |
| `Seller-Cases` / `Seller-RespondCase` | GET / POST | `cases.read` / `cases.write` | Customer issues |
| `Seller-Notifications` / `Seller-MarkRead` | GET / POST | `notifications.read` | Inbox |
| `Seller-Settings` / `Seller-SaveSettings` | GET / POST | `settings.write` | Contact, shipping, returns |

Login returns to Seller Central through `rurl=7` (`config/oAuthRenentryRedirectEndpoints.js` extends the base map).

### Shopper pages (`Marketplace-*`)

| Route | Method | Notes |
|---|---|---|
| `Marketplace-Offers?pid=` | GET | PDP remote include; short promotion-sensitive cache; no shopper data |
| `Marketplace-Seller?id=` | GET | Public profile of an approved seller |
| `Marketplace-Report?offerId=` / `Marketplace-SubmitReport` | GET / POST | Signed in; rate-limited per day |
| `Marketplace-Purchases` / `Marketplace-Rate` | GET / POST | Signed in; ratings only for the buyer's shipped seller orders |

### Base routes and templates extended

| Base | Extension |
|---|---|
| `Cart-EditProductLineItem` | prepend: offer lines cannot be edited (the product is removed and re-added instead) |
| `scripts/cart/cartHelpers` | `addProductToCart`, `checkPliCanBeUpdated` for offer lines |
| `scripts/helpers/basketValidationHelpers` | `validateProducts` checks offer lines |
| `models/productLineItem/productLineItem` | offer unit price, seller availability, `marketplace` info (returns a copy, because the base decorators define price and availability read-only) |
| `models/productLineItem/orderLineItem` | `marketplace` info on order views (confirmation, order details) |
| `product/components/addToCartButtonExtension.isml` | offers block (an extension point that is empty in base) |
| `product/productTileFooter.isml`, `cart/productCard/cartProductCardHeader.isml`, `checkout/productCard/productCardProductName.isml` | "Sold by" |
| hook `dw.order.calculateTax` | offer prices and seller shipping fees (see [ARCHITECTURE.md](ARCHITECTURE.md#pricing)) |

## Custom Shopper API `marketplace` (v1)

Base: `https://{shortCode}.api.commercecloud.salesforce.com/custom/marketplace/v1/organizations/{organizationId}`. All calls take `siteId`.

| Operation | Method and path | Scope | Notes |
|---|---|---|---|
| getProductOffers | `GET /offers?c_productId=` | `c_mkt_shopper` | Ranked offers; `available` is a boolean |
| getSellerProfile | `GET /sellers/{sellerId}` | `c_mkt_shopper` | Approved sellers only |
| getMyAccount | `GET /me` | `c_mkt_seller` | Seller view, role and capabilities |
| createApplication | `POST /me/application` | `c_mkt_seller` | Same body as the portal form |
| listSubmissions / createSubmission | `GET` / `POST /me/submissions` | `c_mkt_seller` | `c_status`, `c_offset`, `c_limit` |
| getSubmission / updateSubmission | `GET` / `PATCH /me/submissions/{submissionId}` | `c_mkt_seller` | PATCH takes `revision` |
| submitSubmission | `POST /me/submissions/{submissionId}/submit` | `c_mkt_seller` | |
| listOffers | `GET /me/offers` | `c_mkt_seller` | |
| upsertOffer | `PUT /me/offers/{productId}` | `c_mkt_seller` | Creates (201) or updates |
| setOfferStock | `PUT /me/offers/{productId}/stock` | `c_mkt_seller` | `{ "quantity": 12 }` |
| listOrders / getOrder | `GET /me/orders`, `GET /me/orders/{orderNo}` | `c_mkt_seller` | Paid orders only |
| createShipment | `POST /me/orders/{orderNo}/shipments` | `c_mkt_seller` | `idempotencyKey` required |
| listLedger | `GET /me/ledger` | `c_mkt_seller` | Includes `balances` |
| listSettlements / getSettlement | `GET /me/settlements[/{settlementId}]` | `c_mkt_seller` | |
| listNotifications | `GET /me/notifications` | `c_mkt_seller` | Includes `unread` |

Money fields ending in `Cents` are integer cents in responses. In request bodies, prices are dollars in `price` (and `shippingFee`, `freeShippingOver` for settings), as a string or a number (`"119.99"`), and are converted to cents on the server.

Example: create an offer.

```http
PUT /custom/marketplace/v1/organizations/f_ecom_xxxx_001/me/offers/25592581M?siteId=RefArch
Authorization: Bearer <SLAS registered-shopper token with c_mkt_seller>
Content-Type: application/json

{ "price": "115.00", "quantity": 4, "sellerSku": "HP-100", "condition": "NEW", "returnDays": 30 }
```

```json
{ "offerId": "SELLERA:25592581M", "status": "ACTIVE", "priceCents": 11500, "quantity": 4, "stockPendingSync": true, "reviewState": "NONE", "revision": 0 }
```

Example: record a shipment.

```http
POST /custom/marketplace/v1/organizations/f_ecom_xxxx_001/me/orders/00001234/shipments?siteId=RefArch

{ "idempotencyKey": "8f1c2d3e4a5b6c7d", "carrier": "UPS", "trackingNumber": "1Z999AA10123456784",
  "lines": [{ "lineId": "a1b2c3d4e5", "quantity": 1 }] }
```

Errors follow RFC 9457. `type` is `marketplace-<errorCode>` (for example `marketplace-invalid`, `marketplace-forbidden`, `marketplace-not-found`), `detail` is the localized message, and safe details are added as custom properties (`fields`, `problems`).

| `errorCode` | HTTP |
|---|---|
| `invalid`, `incomplete`, `code-invalid`, `code-expired`, `code-locked`, `code-missing` | 400 |
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `not-found` | 404 (also for other sellers' records) |
| `conflict`, `stale`, `not-allowed-now` | 409 |
| `limit-reached` | 422 |
| `rate-limited` | 429 |
| `disabled`, `unavailable` | 503 |

The storefront pages use the same codes; their messages are the `error.<errorCode>` keys in `seller.properties`.

## Custom Admin API `marketplace-admin` (v1)

Account Manager client with scope `c_mkt_admin`. The token must also carry the tenant scope `SALESFORCE_COMMERCE_API:<tenant>`. Call with a storefront `siteId`, because the records are site-scoped.

| Operation | Method and path | Notes |
|---|---|---|
| listSellerOrders | `GET /seller-orders?c_status=&c_sellerId=` | For OMS/WMS pull; includes ship-to |
| postSellerOrderEvent | `POST /seller-orders/{orderNo}/{sellerId}/events` | See below |
| getSeller | `GET /sellers/{sellerId}` | |
| listSettlements | `GET /settlements?c_status=` | |
| postPayoutResult | `POST /settlements/{settlementId}/payout-result` | `{ "result": "PAID", "reference": "po_123" }` |

Seller order events (each `eventId` is applied once):

```json
{ "eventId": "oms-evt-000123", "type": "REFUNDED", "lines": [{ "lineId": "a1b2c3d4e5", "amountCents": 2500 }] }
```

| `type` | `lines` items | Effect |
|---|---|---|
| SHIPPED | `lineId`, `quantity` (plus `carrier`, `trackingNumber`) | Same as a seller shipment |
| DELIVERED | none | SHIPPED → DELIVERED |
| CANCELLED | `lineId`, `quantity` | Unshipped units cancelled |
| RETURNED | `lineId`, `quantity` | Returned units recorded |
| REFUNDED | `lineId`, `amountCents` | REFUND entry and proportional COMMISSION_REVERSAL |

## Provider webhook

`POST MarketplaceWebhook-Receive` (storefront, HTTPS). It is server-to-server, so there is no session and no CSRF token.

- **Header:** `X-Marketplace-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`. The secret is the password of service `plugin-seller.webhook`.
- **Rejected:** a timestamp older than `sellerWebhookToleranceSeconds`, or an invalid signature. Event IDs are accepted once.
- **References must match.** A result is applied only when its reference matches the one stored when the request was made.

| `type` | `data` |
|---|---|
| `kyc.completed` | `sellerId`, `reference`, `result` (VERIFIED, REJECTED, REVIEW) |
| `bank.completed` | `sellerId`, `reference`, `result` (VERIFIED, REJECTED), `last4` |
| `payout.completed` | `settlementId`, `reference`, `result` (PAID, FAILED) |
| `document.scanned` | `documentId`, `reference`, `result` (CLEAN, INFECTED) |

## Provider hooks

Implement these hooks in an integration cartridge (`int_*`) and set the matching preference to EXTERNAL. The plugin passes plain snapshots, never platform objects, and calls the hooks outside transactions. A missing hook, an exception or an unexpected answer is treated as ERROR, and nothing is approved or paid.

| Hook | Function | Returns |
|---|---|---|
| `app.plugin.seller.kyc` | `start(seller)` | `{status: SUBMITTED or REDIRECT, reference, redirectUrl?}` |
| `app.plugin.seller.bank` | `start(seller, returnUrl)` | `{status: REDIRECT, reference, redirectUrl}`: a hosted page; the plugin never sees bank details |
| `app.plugin.seller.payout` | `request(settlement)` | `{status: SUBMITTED or FAILED, reference}` |
| `app.plugin.seller.scan` | `submit(document, file)` | `{status: PENDING, CLEAN or INFECTED, reference}` |

Redirect URLs must be HTTPS.

## SCAPI Admin calls made by jobs

Used only with `sellerProvisioningStrategy = SCAPI_ADMIN`. The request bodies follow the Products, Catalogs, Price Books and Inventory Lists v1 OpenAPI contracts. No calls have been made against an instance yet (spike S5).

| Call | Endpoint (`/product/<api>/v1/organizations/{org}`) | Scope |
|---|---|---|
| createProduct, updateProduct | `PUT`/`PATCH /products/{id}` | `sfcc.products.rw` |
| assignProductToCategory | `PUT /catalogs/{catalog}/categories/{category}/products/{id}` | `sfcc.catalogs.rw` |
| createOrUpdatePriceBookEntry | `PUT /price-books/{book}/price-book-entries/{id}` | `sfcc.price-books.rw` |
| createOrUpdateInventoryList, createOrUpdateProductInventoryRecord | `PUT /inventory-lists/{list}[/product-inventory-records/{id}]` | `sfcc.inventory-lists.rw` |

The token comes from Account Manager (`client_credentials`) with `SALESFORCE_COMMERCE_API:<tenant>` plus these four scopes. Tokens, Basic credentials and client secrets are removed from communication logs.
