# Storefront Analytics — architecture

`plugin_analytics` measures storefront traffic, product engagement, cart behaviour, checkout conversion and order performance with SFCC-native building blocks only: SFRA route extensions, a template hook, site-scoped custom objects, job steps and a Business Manager extension (`bm_analytics`). No third-party analytics, no external database.

## Cartridges

| Cartridge | Path position | Contents |
|---|---|---|
| `plugin_analytics` | storefront path, left of `app_storefront_base` | `Analytics-Collect`, extensions of `Cart-AddProduct`, `Checkout-Begin`, `CheckoutShippingServices-SubmitShipping`, `CheckoutServices-SubmitPayment` and `CheckoutServices-PlaceOrder`, the `app.template.afterFooter` hook, helpers, job steps |
| `bm_analytics` | Business Manager path (`bm_analytics:plugin_analytics:...`) | `AnalyticsAdmin` controller, desk template, labels |

Logic lives in three helpers, following the repository's `scripts/helpers/*Helpers.js` convention:

| Helper | Role |
|---|---|
| `analyticsHelpers.js` | Site preferences, per-session state, validation of browser events, event batches, cart/checkout events |
| `analyticsAggregationHelpers.js` | Job side: batch aggregation, order snapshots and reconciliation, writer lock, cleanup, integrity check |
| `analyticsReportHelpers.js` | Reporting ranges, metric definitions, funnel, product/category/search summaries, rankings, CSV |

## Data flow

```text
Browser (analytics.js, 2.7 KB)                     Server routes (append)
  view_item_list / select_item / view_item / search    add_to_cart / begin_checkout /
        |  sendBeacon, <= analyticsBatchSize events      add_shipping_info / add_payment_info
        v                                                       |
  Analytics-Collect  -- validate, dedupe, mark firsts -->  AnalyticsEventBatch (1 per request)
                                                                |
                                       Analytics-AggregateEvents (job, writer lock)
                                                                v
      Orders (authoritative) --> Analytics-ReconcileOrders --> AnalyticsProductDaily
         order.custom.analyticsSnapshot (last contribution)     AnalyticsCategoryDaily
                                                                AnalyticsSiteDaily
                                                                AnalyticsSearchDaily
                                                                |
                         Analytics-GenerateRankings --> AnalyticsRanking
                                                                |
                                         Business Manager: Merchant Tools > Storefront Analytics
```

## Client-side versus server-authoritative

| Event | Source | Trusted for money? |
|---|---|---|
| `view_item_list`, `select_item`, `view_item`, `search` | Browser beacon | No money involved. Validated, rate-limited, best effort |
| `add_to_cart` | `Cart-AddProduct` append, only when the base route succeeded | Unit price read from the basket line |
| `begin_checkout`, `add_shipping_info`, `add_payment_info` | Checkout route appends, after the base route accepted the step | Basket values only |
| `purchase` | **Orders only**, through `Analytics-ReconcileOrders` | Yes — the order is the only source of sales figures |

A browser cannot send `purchase`, `add_to_cart` or checkout events: `Analytics-Collect` accepts only the four browser events above.

## Key design decisions

1. **Bounded writes on the storefront.** A storefront request creates at most one custom object (an event batch); `PlaceOrder` creates none. The platform allows 10 `CustomObjectMgr.create()` per storefront request across all cartridges, and checkout plugins need most of them.
2. **One writer per aggregate.** `CustomObjectMgr` has no atomic increment, so storefront requests never update aggregates. Only the jobs do, and the writing jobs (`AggregateEvents`, `ReconcileOrders`, `Cleanup`) share a writer lock: a checkpoint record with the fixed key `writer-lock`, whose creation succeeds for one job only (unique key). Job steps do not run in parallel.
3. **Exactly-once.** Batches are folded into the aggregates and removed in the same transaction. Each order stores the snapshot it last contributed (`Order.custom.analyticsSnapshot`); a changed order contributes `new − old`, so re-running reconciliation changes nothing.
4. **Precomputed reads.** Reports read daily aggregates and stored rankings, never raw events; product-level reports are limited to 93 days and a record cap per request.
5. **Fail safe.** Every storefront call is wrapped: an analytics error is logged (`plugin-analytics` / `analytics-collect`) and the shopper's request continues unchanged. `Analytics-Collect` always answers 204.
6. **Multi-site isolation.** All analytics custom objects are site-scoped, so each site has its own data without site IDs in keys. Reports read the site selected in Business Manager.

## Extension points

- Name a product list: add `data-analytics-list="your-list"` to any container of `.product[data-pid]` tiles.
- Tiles without `.product[data-pid]` (for example custom Page Designer tiles) are not observed; add those attributes to include them.
- Headless storefronts: see [analytics-known-limitations.md](analytics-known-limitations.md#headless-storefronts).

Related: [event contract](analytics-event-contract.md) · [data model](analytics-data-model.md) · [jobs](analytics-jobs.md) · [performance](analytics-performance.md).
