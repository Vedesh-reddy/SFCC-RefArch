# Performance and capacity

## Storefront cost

| Where | Cost per request |
|---|---|
| Every page (template hook) | Reads 3 preferences, prints one hidden `div` and a deferred 2.7 KB script. Output holds no shopper data, so pages stay cacheable |
| Browser | One `IntersectionObserver`, one `MutationObserver`, one delegated click listener; a beacon every 10 s while events are queued, at batch size, or when the page is hidden |
| `Analytics-Collect` | 1 checkpoint read, 1 batch read, ≤ 1 custom object create, 1 session write |
| `Cart-AddProduct`, `Checkout-Begin`, `SubmitShipping`, `SubmitPayment` | ≤ 1 custom object create |
| `PlaceOrder` | 0 creates, 1 order attribute write |

Session state is one privacy string kept below 2000 characters (the platform limit per string; the whole session is limited to 10 KB). It holds the token, the sampling decision, up to 120 first-in-session markers per day, the open checkout attempt and a per-minute counter.

## Traffic envelope

Each tracked page view produces about 1–3 batches. Assumptions for sizing:

| Daily page views | Batches per day (≈ 2 / page view) | Suggested settings |
|---|---|---|
| ≤ 100 000 | ≤ 200 000 | Defaults; aggregate every 15 min |
| 100 000 – 500 000 | 200 000 – 1 000 000 | Aggregate every 5 min, `MaxBatches` 20000–50000, raise `analyticsMaxBacklog` |
| > 500 000 | > 1 000 000 | Use `analyticsSampleRate` (e.g. 25) and measure; validate custom object quotas first |

Batches exist only until the next aggregation run, so storage is bounded by `traffic × aggregation interval`, plus `analyticsMaxBacklog` as a hard ceiling. Daily records grow with active products per day × retention days. Check **Administration › Operations › Quota Status** for custom object limits on your realm; the plugin does not raise any quota.

## When volume exceeds capacity

1. Per session, events above `analyticsMaxBatchesPerMinute` are dropped and counted (`eventsDropped`).
2. When the backlog exceeds `analyticsMaxBacklog`, the aggregation job pauses collection; all new events are dropped and counted until the backlog is worked off.
3. With sampling, only a share of sessions is recorded; reports show the rate and never extrapolate.
4. Reports show notices whenever any of this happened in the period. Orders and revenue are never affected — they come from orders.

## Reporting cost

- Site pages read ≤ 366 daily records.
- Product, category, ranking and export pages read up to 100 000 daily records (≤ 93 days) and say so when the period has more.
- Standard-period rankings are precomputed; nothing scans the catalog on a page view.
- Product names and categories are looked up only for the 50 rows on screen.

## Job cost

- Aggregation: per 50 batches, one transaction touching the affected daily records. Product lookups are cached per run (20 000 entries).
- Reconciliation: one order per transaction; unchanged orders cost a read and a string comparison.
- Metrics per run (`counts` on each checkpoint): batches, events accepted/rejected/dropped, oldest batch age (aggregation latency), backlog, orders changed/unchanged/failed, duration.
