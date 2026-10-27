# Testing

## Unit tests (executed)

```bash
# from the repository root
npx mocha 'test/plugin_seller/unit/*.test.js'

# also validate generated import XML against the platform XSDs (needs xmllint):
SFCC_XSD_DIR="$(dirname "$(npx @salesforce/b2c-cli docs schema catalog --path)")" npx mocha 'test/plugin_seller/unit/*.test.js'
```

Result at hand-off: **95 passing**, with XSD validation on.

The tests run the real cartridge modules on an in-memory Script API double (`test/plugin_seller/unit/harness.js`):

- custom objects with unique keys and a query parser;
- transactions that roll back;
- site preferences with the metadata defaults (enum values as `{value}`), SecureRandom, HMAC and SHA-256 (backed by Node crypto);
- files, services, hooks, `Resource` (reads `seller.properties`), `StringUtils.formatMoney` and RESTResponseMgr.

The harness also reads `metadata/plugin_seller` and fails on any write to an attribute that is missing from the metadata or has the wrong type.

| Suite | Covers |
|---|---|
| `foundation.test.js` | `marketplaceHelpers`: cents parsing and formatting, Money to cents, USD-only switch, metadata defaults and enum preferences, missing catalog IDs, registration closed without an agreement version, status flows, webhook signatures, fail-closed HMAC keys, IDs, rate limits, text cleaning, base-style error results |
| `onboarding.test.js` | Application rules, tax ID minimization, duplicate tax ID flag, authorization (no cross-seller access, roles, status rules, disabled marketplace), e-mail verification codes (single use, session binding, lockout, expiry, cooldown), submission prerequisites, manual approval, decisions with reasons and stale-page checks, members, termination, provider references, fail-closed provider hooks, settings limits |
| `catalog.test.js` | GTIN check digits, price checks, featured-offer ranking (both strategies), offers (no duplicates, review of suspicious prices and price proposals, buyability, stock semantics), submissions (draft → submit → approve, ownership, auto-approval, updates of others' products), XSD-valid catalog/price book/inventory XML, SCAPI Admin product body |
| `checkout.test.js` | Offer pricing hook (price from the record, promotions re-applied, seller shipping fees, invalid offers, orders untouched), add-to-cart binding to the seller inventory list, one seller per product, featured offer for seller-owned products, checkout refusal on price change and missing offer, stock across lines |
| `finance.test.js` | Commission precedence and caps, seller order creation (idempotent, placed and paid only), shipping and earnings booked once per quantity, over-shipping and cross-seller refusal, refunds with commission reversal and replay safety, cancellations, missing commission rule and recovery, verified-buyer ratings, ledger idempotency and sign checks, admin adjustments, settlements (hold, minimum, payout booking, reconciliation, mismatch detection, provider reference), performance metrics |
| `integration-points.test.js` | Custom Shopper API (token-based seller resolution, 401/404/400 problem details, offers without contact data, shipment idempotency key, write rate limit), document uploads (content sniffing, generated names, quarantine on infection, approval blocked until clean), provisioning (import files, image copy, verify failure and retry, publish), case after the last attempt, offer sync (featured price, aggregate stock, confirm), jobs disabled, e-mail delivery, performance cursor, cleanup |
| `integrity.test.js` | Every used resource key exists; notification texts exist; job steps exist in the code and in `jobs.xml`; schedules ship disabled; Custom API endpoints are public and declared; BM nodes registered once and exported; a message for every error code; every preference the code reads is in the metadata; no plugin framework modules; logger, Grid, `Math.random` and class-name conventions; base cartridges untouched |

Lint (executed, clean): `npx eslint cartridges/plugin_seller cartridges/bm_seller test/plugin_seller`, `npm run lint:isml`, `npx stylelint "cartridges/plugin_seller/cartridge/client/default/scss/*.scss"`.

## Not executed

Nothing has run on a B2C Commerce instance. These are not covered by the unit tests:

- ISML rendering
- SFRA middleware chains
- platform inventory reservation
- import job steps
- SCAPI Admin calls
- Custom API registration
- Business Manager extension loading
- e-mail delivery

## Sandbox verification plan

Run these on a sandbox, in order, and record the results here.

| # | Spike | How | Pass criteria |
|---|---|---|---|
| S1 | Cartridge path and import | Deploy, import metadata, check BM › Marketplace › Overview | No preference problems listed; menu visible for a role with the modules |
| S2 | Offer pricing hook order | Add an offer line whose price differs from the price book; open the cart | Line shows the offer price; tax and totals are computed on it; promotions apply to it |
| S3 | Seller inventory reservation | Seller list with stock 1; place an order; try a second order | First order reserves stock in the seller list (BM inventory record shows the reservation); the second add fails |
| S4 | IMPEX provisioning | Approve a submission; run `MarketplaceSeller-ProvisionProducts` | Product, category assignment, price and inventory exist; submission is PUBLISHED; the product appears in search after indexing |
| S5 | SCAPI Admin provisioning | Strategy SCAPI_ADMIN with an Account Manager client | Same result as S4; no 4xx in the service log |
| S6 | Images | Check the copy to `CATALOGS/<catalog>/default/marketplace/...` | PDP shows the uploaded image |
| S7 | Large seller orders | An order with 50+ lines for one seller | Seller order saved (text attribute size) |
| S8 | Custom APIs | `b2c scapi custom status`; call `/me` with a SLAS token; call `marketplace-admin` with an AM token | Endpoints registered; 200 for an own record, 404 for another seller's |
| S9 | Webhook | Post a signed `kyc.completed`; replay it; post with a bad signature | 200 accepted, 200 duplicate, 401 |
| S10 | Jobs end to end | Place a paid order, ship it, run OrderSync, Settlements, then mark paid | Ledger entries as expected; settlement MATCHED after the payout |
