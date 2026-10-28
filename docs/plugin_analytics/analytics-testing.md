# Testing

```bash
npm run test:analytics     # 84 unit tests
npm test                   # SFRA base unit tests (regression)
npm run lint               # CSS, JS and ISML lint of the whole repository
```

The tests run in Node with `test/plugin_analytics/unit/harness.js`, an in-memory double of the Script API parts the plugin uses:

- custom objects with unique keys, attribute types read from the metadata XML (an undefined or wrongly typed attribute fails the test), creates and removes only inside transactions;
- transactions that roll back, plus injected commit failures;
- the 4-expression custom object query quota and datetime comparison to the second;
- the site calendar with a fixed UTC offset (default −5 h) for time-zone boundaries;
- orders whose `lastModified` moves when the job writes them;
- the SFRA route chain, including `route:BeforeComplete` listener order;
- a minimal DOM for the storefront script (`client.test.js`).

## Coverage map

| Area | File | Covers |
|---|---|---|
| Event collection and security | `collect.test.js` | All browser events, allowlist, forged purchase/cart/checkout events, oversized/invalid payloads, injection in IDs, batch size cap, replay, unique-session markers, session size limit, day change, rate limit and dropped counts, same-origin check, disabled / consent / non-USD / sampling, backlog pause, search-term privacy, failure isolation |
| Commerce integration | `checkout.test.js` | Successful and failed add to cart, multiple quantities, variants, product sets, malformed form, checkout start dedupe and new baskets, guest vs signed-in, redirect, accepted vs rejected shipping and payment steps (listener order), no address/card data, order linking, PlaceOrder 0 creates, ≤ 1 create per request, failure isolation, switches |
| Aggregation | `aggregation.test.js` | Product/category/site totals, master rollup, single category, unknown products, exactly-once, rollback and retry, bounded resume, writer lock and takeover, time-zone day buckets, search aggregates, sample rate, backlog pause/resume, disabled |
| Orders | `orders.test.js` | Placed orders, created/failed excluded, repeated reconciliation and confirmation, cancellation, full/partial refunds and caps, PAID mode delayed payment, completed attempts, missed/headless orders, non-USD, retention, time-zone day, cursor with many orders in one second, failed order isolation, switch |
| Reports | `reports.test.js` | Ranges and validation, previous period, metric definitions and zero denominators, empty data, funnel modes, rankings with thresholds, tie-breaking and zero-sale catalog products, stored rankings, categories, searches, CSV injection |
| Jobs | `jobs.test.js` | Retention cleanup (bounded), stale batches, integrity check clean and with problems, statuses |
| Business Manager | `admin.test.js` | 403 without BM session, every node renders with defined labels, overview comparison, parameter validation, drill-down, stored vs live rankings, funnel modes, CSV headers, notices |
| Storefront script | `client.test.js` | Viewport impressions, re-render dedupe, click dedupe and quick view, single PDP view with double inclusion, list naming, batching |
| Conventions | `integrity.test.js` | Labels, step types ↔ jobs ↔ functions, BM nodes ↔ menu actions, preferences in metadata, site scope, logging/naming/no Grid, hooks, escaped page context, base cartridges untouched |

## Results (2026-10-28, local)

| Suite | Result |
|---|---|
| `npm run test:analytics` | 84 passing |
| `npm test` (SFRA base) | 1138 passing |
| Other plugin suites (seller, wallet, luckydraw, reviews, socialgifting, affiliateproduct, loyalty, rentals) | all passing |
| `npm run lint` | clean |
| Metadata XML (`metadata.xsd`, `preferences.xsd`, `jobs.xsd`) and `bm_extensions.xml` (`bmext.xsd`) | valid (xmllint) |

## Sandbox run (zyeu-002, 2026-10-28)

Results per check are in [analytics-deployment.md](analytics-deployment.md#sandbox-validation-checklist). 9 of 10 checks passed; refunds through invoices (A8) were not tested because the sandbox has no invoices. Still open: a load test and storefront performance measurements.

## Verifying reporting accuracy by hand

1. Place 2 orders in the sandbox, cancel one.
2. Run `Analytics-ReconcileOrders`.
3. Orders page for today: 1 order, 1 cancelled; net revenue equals the remaining order's merchandise total minus discounts.
4. Run `Analytics-IntegrityCheck` the next day: no problems.
