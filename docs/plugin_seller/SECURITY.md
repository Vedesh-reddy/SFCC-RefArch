# Security model

## Trust boundaries

| Boundary | Control |
|---|---|
| Browser → Seller Central | Signed-in customer; seller resolved from the membership record; role and status matrix (`sellerHelpers.getSellerContext`); CSRF token on every POST; HTTPS |
| Browser → shopper pages | Public reads contain no shopper data. Reports and ratings need sign-in, CSRF and rate limits, and ratings are limited to verified buyers |
| Headless → Custom Shopper API | SLAS token with `c_mkt_seller`; same `getSellerContext` path; per-seller write rate limit; idempotency key for shipments |
| OMS / middleware → Custom Admin API | Account Manager OAuth with `c_mkt_admin` plus the tenant scope; event IDs applied once |
| Provider → webhook | HMAC-SHA256 signature over timestamp and body, timestamp tolerance, single-use event IDs, reference matching |
| Business Manager → desk | BM session, module permission per menu action, `dw.web.CSRFProtection` on every POST, actions recorded with the BM user name |
| Jobs → SCAPI Admin | Service credentials in Business Manager; least-privilege scopes; tokens redacted from logs |

## Authorization rules

- **No IDOR.** No endpoint accepts a seller ID from the browser to select the account. Records are looked up by keys that contain the seller ID taken from the session (offers `<seller>:<product>`, seller orders `<order>:<seller>`). Records found by random ID (submissions, documents, cases, notifications, settlements) are compared with the caller's seller. Foreign records are reported as `not-found`.
- **No mass assignment.** Portal input goes through the SFRA form definitions in `forms/default/`; API bodies go through the same helper checks, which copy only known fields. Status, ownership, approval and price-review fields are never taken from input.
- **Server-side state changes.** Approval, rejection, suspension, offer review, payout confirmation and refund recording happen only in Business Manager, through the Admin API or the signed webhook. Every status change is checked against the status-flow table of its helper (`marketplaceHelpers.canMove`).
- **Prices and totals are never taken from the client.** Offer prices are read from the offer record when the basket is calculated, and checkout refuses lines whose price changed since then.
- **Stale edits are refused.** Records carry a revision, and forms send the revision they were rendered from; a mismatch returns `stale`.

## Data handling

| Data | Handling |
|---|---|
| Tax ID | Only the last 4 digits and an HMAC (key in `plugin-seller.hmac`) are stored, for duplicate detection |
| Bank account | Never seen or stored. The payout provider's hosted page collects it; the plugin keeps the provider reference and the last 4 digits for display |
| Verification codes | 6–8 digits from `SecureRandom`; stored as HMAC(salt + code); bound to the session (SHA-256 of the session ID); attempt limit, expiry, resend cooldown, hourly send limit; single use; never logged |
| Documents | Stored in `IMPEX/plugin-seller-private/` (reachable only with Business Manager WebDAV permissions, never through a storefront URL), under random names without the original extension. The type is detected from the file's bytes, and the size is checked. Scan status is tracked; infected files are deleted and the record kept. Files are viewed only in the BM desk (each view is audited). They are purged after `sellerDocumentRetentionDays` |
| Ship-to address | Copied to the seller order for fulfillment, shown only while the order is open, removed when the seller order closes |
| Notifications | Records hold no e-mail address; the recipient is resolved at send time |
| Audit trail | Append-only; detail is redacted (keys like token, tax, bank, e-mail, phone are dropped); BM users by user name, sellers and shoppers by customer number |
| Logs | Two-argument categorized loggers (`plugin-seller`, categories `seller-*`); identifiers only, never codes, tokens, tax IDs or addresses; SCAPI communication logs pass through `filterLogMessage` |

Restrict WebDAV access to `IMPEX/plugin-seller-private` in Administration › Organization › WebDAV Client Permissions to the people who review documents.

## Abuse and fraud controls

- **Rate limits:** applications (5 per customer per day), verification codes (cooldown plus hourly limit), listing reports (`sellerReportRateLimitPerDay`), API writes (`sellerWriteRateLimitPerHour`).
- **Listings:** duplicate seller (tax ID), duplicate SKU, GTIN or title, price limits and deviation, restricted categories with grants and compliance documents.
- **Sellers:** document expiry, with optional automatic suspension.
- **Orders:** performance metrics and breaches, counterfeit and issue reports, enforcement from cases.
- **Money:** ledger idempotency and amount-mismatch detection, settlement reconciliation, refunds capped at credited amounts.
- **Randomness:** `dw.crypto.SecureRandom` everywhere; `Math.random` is not used (enforced by a test).

## Production blockers

The plugin runs in **sandbox/demo mode** until these items are closed. Each needs an owner and sign-off.

| # | Blocker | Why | Needed |
|---|---|---|---|
| B1 | Payout provider | SFCC does not move money; a marketplace pays sellers through a licensed provider that also handles seller KYC/KYB and IRS Form 1099-K reporting | Integration cartridge implementing `app.plugin.seller.payout` and `app.plugin.seller.bank`, plus webhook configuration |
| B2 | Identity verification | MANUAL review must be approved by compliance, or replaced by a provider | `app.plugin.seller.kyc` or an approved manual procedure |
| B3 | Malware scanning | Without a scanner, documents and images are UNSCANNED | `app.plugin.seller.scan`, or keep `sellerRequireCleanDocumentScan` on and scan out of band |
| B4 | Sales tax for third-party sales | US marketplace facilitator laws usually require the marketplace to collect and remit tax for seller sales | Tax configuration and an approved tax provider decision |
| B5 | Sandbox verification | The plugin has not run on an instance | Spikes S1–S8 in [TESTING.md](TESTING.md#sandbox-verification-plan) |
| B6 | Legal | Seller agreement, privacy notice, document retention period, seller terms on the storefront | Legal sign-off |
| B7 | Volume | The ledger, audit trail and notifications are custom objects | Capacity plan, or move these to an external store above about 10k orders/month |
| B8 | Payment and refund orchestration | Shopper refunds are made by the payment/OMS process; the plugin only records the seller side | OMS integration posting events to `marketplace-admin` |
