# Configuration

Site preferences, group **Storefront Analytics (plugin_analytics)** in **Merchant Tools › Site Preferences › Custom Preferences**. Ranges are enforced by the metadata; the code also falls back to the default when a value is missing or out of range.

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `analyticsEnabled` | boolean | false | | Master switch. Runs only when the site default currency is USD |
| `analyticsProductTrackingEnabled` | boolean | true | | Impressions, selections, product page views, add to cart; also loads the storefront script |
| `analyticsCheckoutTrackingEnabled` | boolean | true | | Begin checkout, shipping and payment steps |
| `analyticsPurchaseTrackingEnabled` | boolean | true | | Order reconciliation and linking orders to checkout attempts |
| `analyticsSearchTrackingEnabled` | boolean | false | | Search terms (privacy filter always applies) |
| `analyticsRequireConsent` | boolean | true | | Track only sessions with tracking allowed (SFRA consent / `session.trackingAllowed`) |
| `analyticsSampleRate` | int | 100 | 1–100 | Share of sessions tracked. Orders are never sampled |
| `analyticsBatchSize` | int | 20 | 1–50 | Events per beacon |
| `analyticsMaxBatchesPerMinute` | int | 12 | 1–120 | Requests with events per session and minute |
| `analyticsMaxBacklog` | int | 200000 | 1000–10000000 | Waiting batches above which collection pauses |
| `analyticsRetentionDays` | int | 400 | 31–1100 | Retention of daily aggregates; also the first reconciliation backfill |
| `analyticsMinRankingViews` | int | 20 | ≥ 1 | Minimum sessions for conversion rankings |
| `analyticsMinRankingImpressions` | int | 100 | ≥ 1 | Minimum impressions for "impressions without selections" |
| `analyticsQualifyingOrders` | enum | PLACED | PLACED, PAID | Which orders count as purchases |
| `analyticsAbandonmentHours` | int | 24 | 1–720 | When an open checkout attempt counts as abandoned |

## Settings from the prompt that use platform configuration instead

| Prompt preference | Where it is configured |
|---|---|
| `AnalyticsCollectionMode` | Collection is always "bounded batches"; tune with sample rate, batch size, rate limit and backlog |
| `AnalyticsAggregationSchedule` | Job schedules (Administration › Operations › Jobs) |
| `AnalyticsSessionTimeoutMinutes` | The platform session: privacy data ends at the 30-minute soft timeout, which is the "session" of all unique-session metrics |
| `AnalyticsDeduplicationWindow` | Not needed: unique batch keys and per-session markers |
| `AnalyticsLoggingEnabled` | Log level of category `plugin-analytics` in Administration › Operations › Custom Log Settings |
| `AnalyticsReportTimezone` | The site time zone (Administration › Sites › Manage Sites › (site) › Settings) |

## Choosing `analyticsQualifyingOrders`

- `PLACED` (default): an order counts once placed (status NEW, OPEN or COMPLETED). Suits payment flows that authorize at placement.
- `PAID`: an order counts only when its payment status becomes PAID — for delayed capture. The order is picked up again when its payment status changes. Sandbox card orders often stay NOT_PAID; use `PLACED` there.

## Consent

With `analyticsRequireConsent = true`, nothing is recorded for a session until `session.trackingAllowed` is true (SFRA's consent banner sets it; the default comes from the site's tracking preference). Orders are still reconciled — they are business records, not tracking — but are not linked to a checkout attempt.
