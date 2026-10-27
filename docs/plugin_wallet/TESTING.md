# Testing

## Unit tests (executed)

```bash
# from the repository root
npx mocha 'test/plugin_wallet/unit/*.test.js'
```

Result at hand-off: **68 passing**.

The tests run the real cartridge modules on an in-memory Script API double (`test/plugin_wallet/unit/harness.js`):

- custom objects with unique keys and a query parser;
- transactions that roll back;
- site preferences with the metadata defaults (enum values as `{value}`), SecureRandom, HMAC and SHA-256 (backed by Node crypto);
- orders, customers, e-mail, hooks, `Resource` (reads `wallet.properties`), `StringUtils.formatMoney` and RESTResponseMgr;
- a `BasketMgr` that throws, which proves top-ups never touch a basket.

The harness reads `metadata/plugin_wallet` and fails on any write to an attribute that is missing from the metadata or has the wrong type.

| Suite | Covers |
|---|---|
| `ledger.test.js` | Metadata defaults and fail-closed switches; sandbox only off production and EXTERNAL only with the live-money approval; funds expiry at least five years; balanced journals with one sequenced entry per wallet; no negative balance; idempotency key applied once and refused with other data; concurrent writer on one wallet rolls back; transfers; replay detects a snapshot mismatch; wallet status flow and admin-only unfreeze |
| `topups.test.js` | Sandbox credit only after verification and exactly once; no basket access; amount range, maximum balance with pending top-ups, daily velocity and its case; sandbox refused on production; EXTERNAL: amount/currency mismatch case, decline, missing hook fails closed, chargeback reversal with shortfall and lock (idempotent), reconciliation of expired and late captures; only the owner decides a sandbox payment |
| `payments.test.js` | Applied amount (balance, total, request); wallet + card split and wallet-only; hold, capture, release; two checkouts against one balance; step-up bound to basket and amount, single use; foreign payer refused; spending limits and notice; refund once, capped, store credit switch; wallet instrument dropped when the wallet is switched off; hold job (capture, release, review); shipping-benefit flag |
| `family.test.js` | Invitation only for the invited e-mail with a code, token stored hashed; member sees allowance only; per-order cap, daily and monthly limits; category restriction; revocation ends authorization and expires approvals; owner approval; unknown session code and lock after locked codes; one family per customer, no self-invite |
| `integration-points.test.js` | Processor `Authorize` and `Handle`, form processor ignores form amounts and card data, advisor gap selection, webhook signature (fresh, exact body, timestamp), checkout panel for a member, monthly insights, Shopper API (GET does not create, token resolution, 404 for another customer's top-up, 401), jobs disabled, reconciliation mismatch case, funds expiry off by default, e-mail address looked up at send time, adjustments with reason and limit, review cases, reconciliation cursor |
| `integrity.test.js` | Every used `wallet` resource key exists, including dynamic prefixes (statuses, ledger types, error codes, flash messages); notification texts exist for every type; job steps exist in the code and in `jobs.xml`; schedules ship disabled; Custom API endpoints are public and declared, no `additionalProperties`; BM nodes registered once and exported; a message for every error code; every preference the code reads is in the metadata; no plugin framework modules; "Not for Live Money" label; logger, Grid, `Math.random` and class-name conventions; base cartridges untouched |

Lint (executed, clean):

- `npx eslint cartridges/plugin_wallet cartridges/bm_wallet test/plugin_wallet`
- `npx stylelint "cartridges/plugin_wallet/**/*.scss"`
- `npm run lint` (CSS, JS and ISML of the whole repository)
- `npx sgmf-scripts --compile js|css --cartridgeName plugin_wallet` compiles (output not committed; `static/` is git-ignored)

All XML in `metadata/plugin_wallet` was validated with xmllint against the platform XSDs.

## Not executed

Nothing has run on a B2C Commerce instance. These are not covered by the unit tests:

- ISML rendering and the client script on the billing page
- SFRA middleware chains and the real checkout flow
- payment method and processor import, hook registration
- `request.custom` and `session.custom` behavior across the PlaceOrder chain
- Custom API registration and SLAS/AM scopes
- Business Manager extension loading
- e-mail delivery
- real gateway integration (none exists; SANDBOX only)

## Sandbox verification plan

Run these on a sandbox, in order, and record the results here.

| # | Spike | How | Pass criteria |
|---|---|---|---|
| W1 | Install | Deploy, import metadata, open BM › Smart Wallet › Overview | Preference problems: none; mode SANDBOX; menus visible for a role with the modules |
| W2 | Top-up | Sign in, add $25 through the sandbox page, approve | Balance $25.00; one TOPUP journal; second approve does nothing |
| W3 | Wallet-only order | Order below the balance; pay with wallet only | Order placed and PAID; hold CAPTURED; balance reduced; `request.custom.walletHoldIds` reached the PlaceOrder append (hold not left ACTIVE) |
| W4 | Split payment | Order above the balance; wallet + test card | Card authorized for the rest; wallet hold captured; order total = sum of instruments. If the shipping benefit is on: customer group on `session.custom.walletShippingBenefit` qualifies |
| W5 | Failed order | Make the card decline after the wallet hold | Order failed; hold RELEASED; balance restored |
| W6 | Concurrency | Two browsers, same wallet, place orders together whose sum exceeds the balance | Exactly one succeeds; balance never negative; `Wallet-Reconcile` OK |
| W7 | Step-up | Set threshold to $10; pay $20 | Code required; wrong code refused; code for another basket refused |
| W8 | Family | Invite a second account, accept, pay within and above limits, revoke, pay again | Within: OK; above: `limit-reached`; after revoke: refused |
| W9 | Custom APIs | `b2c scapi custom status`; call `/me` with a SLAS token; `POST /refunds` with an AM token | Registered; 200; refund credited once on repeat |
| W10 | Jobs | Run each `Wallet-*` job manually | All finish OK (or DISABLED when the wallet is off); notifications sent |
