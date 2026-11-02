# Testing

```bash
npm run test:primemembership
npx eslint cartridges/plugin_primemenbership cartridges/bm_primemenbership test/plugin_primemenbership --ext .js
npm run lint:isml
npx stylelint 'cartridges/plugin_primemenbership/cartridge/client/**/*.scss'
```

The tests run on Node without a sandbox. `test/plugin_primemenbership/fixtures/harness.js` is an in-memory double of the Script API, and routes run through a double of the SFRA server module.

The harness enforces real platform behavior, so a test fails where the platform would:

- Attributes must exist in the metadata, with the right type
- Custom object keys are unique
- A query can use at most 4 custom attribute expressions
- Transactions roll back
- At most 4 temporary baskets per customer

It also has limits. It can't prove how the real platform behaves, and it only knows the methods written into it. During development, the code called a `ShippingLineItem` method that doesn't exist; the double had the same method, so tests passed. It was caught by comparing with the Script API reference, and the double was corrected. The [sandbox smoke test](prime-membership-deployment.md#sandbox-smoke-test) is still required.

## Suites

| File | Covers |
|---|---|
| `unit/plans.test.js` | Shipped values, validation, configuration check, saving |
| `unit/proration.test.js` | Formula, leap years, previous upgrades, refunds, rounding, money parsing |
| `unit/lifecycle.test.js` | State machine, entitlement, cancellation, suspension, settings |
| `unit/benefits.test.js` | Discounts, caps, exclusions, stacking, deals, shipping, reservations, periods |
| `unit/access.test.js` | Early access, exclusives, launches, labels |
| `unit/integrity.test.js` | Resource keys, metadata, job and BM wiring, conventions, base cartridges untouched |
| `integration/purchase.test.js` | Join to activation, delayed and failed payments, compatibility |
| `integration/upgrade.test.js` | Upgrades and renewals through the routes, stale quotes, tax changes |
| `integration/security.test.js` | Access, CSRF, forged payments, duplicates, concurrency, BM permissions, data leakage |
| `integration/jobs.test.js` | All seven jobs: idempotency, batching, checkpoints, reversal, loyalty |
| `integration/api.test.js` | Custom API contracts and ownership |

## Sandbox results

Run on zyeu-002, site `RefArch_Practice`, on 2026-11-02, in a real browser against the deployed code. `plugin_seller`, `plugin_wallet`, `plugin_luckydraw` and `plugin_analytics` were on the cartridge path.

The base card processor never sets `PAID`, and Business Manager can't. To reach `PAID`, a temporary token-protected test route set it on test shoppers' orders, as a gateway would. That route was removed afterwards and isn't in the plugin.

| # | Check | Result |
|---|---|---|
| 1 | Join with a test card | Pass: temporary basket, non-catalog line, order placed, cart untouched, $0 shipping, not exported |
| 2 | Tax | Pass: $1,000 + $50 tax shown before paying, and equal to the order |
| 3 | Paid order, reconciliation job | Pass: unpaid stays pending; paid becomes `ACTIVE` with the term set; e-mail job reports it sent |
| 4 | Member buys merchandise | Pass: 5% and 10% discounts, free shipping on covered methods, none on an uncovered method, savings shown, tax after discount, usage committed |
| 5 | Upgrade at 50% of the term | Pass: charge exactly $750, credit $500, expiration unchanged, plan changes only after payment |
| 6 | Failed payment | Partly: an invalid card keeps the quote. A real decline couldn't be produced |
| 7 | Exclusive and early access products | Pass: refused below the rank or before the plan's early hours, allowed otherwise; label shown, button off, also enforced on the server |
| 8 | Cancel, then reactivate | Pass: benefits and date kept |
| 9 | All 7 jobs, twice | Pass: status OK, no change to records and no duplicate e-mail on the second run |
| 10 | Other plugins | Partly: checkout works with seller, wallet, lucky draw and analytics on the path; the fee line is confirmed non-catalog. Lucky draw entries weren't run against a live campaign. `plugin_loyalty` isn't deployed there |
| 11 | Non-member and guest | Pass: normal totals, no usage rows |
| 12 | Accessibility | Partly: a scan of 7 pages found no unlabeled fields, and one h1 per page. Keyboard and screen reader not tested |

Also confirmed: Business Manager desk (validation, suspend and restore, refunds, reviews, audit, reports), cancelled orders reversing savings, a cancelled paid order moving to `REFUND_PENDING`, CSRF rejection, and cross-customer access blocked with a logged-in customer.

### Bugs the sandbox found

All fixed, with tests. The test harness passed each of these, which is why this run was needed.

| Bug | Effect |
|---|---|
| `createPriceAdjustment(id, discount)` leaves the price at 0 on the platform | **No member discount or free shipping at all** |
| A second refund on an order was compared with the first refund, and refunds weren't added up | Valid refunds refused; repeated refunds could have passed what was paid |
| Order had no customer e-mail | Support and order e-mails had no address |
| Reward shown as active with a coupon that doesn't exist | Claimed a benefit that couldn't be delivered |
| The job flagged a cancelled paid order again on every run | A member kept after a partial refund lost benefits at the next run |
| Tick not drawn on checkboxes under the deployed Bootstrap 4 CSS | A checked e-mail choice looked unchecked |
| Join button while a payment was pending; plan ID shown to a suspended member | Display only |

### Not tested on a sandbox

- A real payment decline, and a real gateway
- Birthday rewards and monthly vouchers, which need coupons set up
- The loyalty multiplier
- Custom APIs and the OCAPI hooks, which need SLAS and Account Manager clients
- Automatic renewal; no adapter exists
- Keyboard, screen reader and load

## Not covered by the automated tests

- Real platform behavior; see the sandbox results above
- ISML rendering: templates are linted, not rendered
