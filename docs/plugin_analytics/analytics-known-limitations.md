# Known limitations

## Accuracy

| Limitation | Effect |
|---|---|
| Browser delivery is best effort (`sendBeacon`, no retries), and blocked by ad blockers or disabled JavaScript | Impressions, selections, views and searches are lower bounds. Cart, checkout and orders are server-side |
| Impressions need `IntersectionObserver` | Browsers without it send no impressions |
| Unique-session markers hold 120 products per session per day | Beyond that, events still count but no further unique counts are recorded for that session-day |
| Unique counts are per product ID as viewed | A session viewing two variants of one master on variant URLs counts twice in `uniqueViews` of the master |
| "Session" = platform session (privacy data ends after 30 minutes of inactivity, and at logout) | A shopper returning after 30 minutes is a new session |
| A checkout attempt is a basket within a session | Resuming the same basket in a new session counts as a new attempt |
| Discovery funnel steps are not a strict cohort | Session-mode ratios between impressions, selections and views are step ratios |
| Cart abandonment uses completed attempts as a stand-in for purchasing sessions | Approximation, clamped at 0 |
| Sampling (`analyticsSampleRate` < 100) | Event counts are not extrapolated; conversion rates that mix sampled events and complete orders are skewed — reports warn |
| Variant URL `view_item` where the master is gone | Rejected as unknown product |
| A change to an order in the same second as the job's own write | Picked up only with the order's next change |
| `int` counters | A site-day above about $21 million overflows the cent fields |

## Scope

| Not implemented | Reason / alternative |
|---|---|
| Device-type dimension and filter | Not stored (YAGNI); can be added as site-level counters per device |
| Most wishlisted products | The storefront has no base wishlist integration; `plugin_customwishlist` could feed it |
| Parent-category rollup | Each product counts in one category only, to avoid duplication |
| Refunds by refund date | Refunds count on the order's day |
| Refund data without the Order post-processing API (invoices) | Only cancellations reduce sales |
| Currencies other than USD | Analytics stays off on non-USD sites; non-USD orders are skipped |
| Product comparison, promotion, coupon, inventory-aware analytics | Optional features, not built |
| Quick view | A quick view is not a product page view |
| Exact historical counts after pauses, rate limits or sampling | Counted as dropped and shown as notices |

## Headless storefronts

The template hook and route extensions are SFRA-only. A headless storefront (PWA Kit / SCAPI) can:

- post the same beacon format to `Analytics-Collect` from the same host (the same-origin check applies), and
- rely on `Analytics-ReconcileOrders` for purchases, which works for every order regardless of channel.

Cart and checkout steps of headless baskets are not recorded; a Custom SCAPI endpoint or SCAPI hooks (`dw.ocapi.shop.basket.*`) would be needed and were not built — no endpoint was invented. Admin OCAPI/SCAPI credentials are never used in the storefront.

## Platform facts this design relies on (verify on your realm)

- At most 10 custom object creates per storefront request (observed on the sandbox).
- Session strings ≤ 2000 characters, session ≤ 10 KB (Script API documentation).
- Custom object queries: at most 4 custom attribute expressions; datetimes compared to the second.
- `OrderMgr.searchOrders` with `lastModified` in a job — **requires sandbox validation**.
