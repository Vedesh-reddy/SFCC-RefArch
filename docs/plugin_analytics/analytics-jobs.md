# Jobs

Step types are declared in `cartridges/plugin_analytics/steptypes.json` (module `scripts/jobs/analytics.js`); jobs in `metadata/plugin_analytics/jobs.xml` ship with **schedules disabled** and the site `RefArch_Practice` — replace it with your site ID. All steps: site context, not parallel, not transactional, 30-minute timeout.

| Job | Step type | Suggested schedule | Parameters (default / max) | Writer lock |
|---|---|---|---|---|
| `Analytics-AggregateEvents` | `custom.Analytics.AggregateEvents` | every 15 min | `MaxBatches` 5000 / 100000 | yes |
| `Analytics-ReconcileOrders` | `custom.Analytics.ReconcileOrders` | every 15 min | `MaxOrders` 2000 / 50000 | yes |
| `Analytics-GenerateRankings` | `custom.Analytics.GenerateRankings` | daily | `MaxRecords` 200000, `MaxProducts` 20000 | no |
| `Analytics-Cleanup` | `custom.Analytics.Cleanup` | daily | `MaxItems` 10000 / 100000 | yes |
| `Analytics-IntegrityCheck` | `custom.Analytics.IntegrityCheck` | daily | `Days` 7 / 62, `MaxItems` 50000 | no |

The aggregation schedule is the job schedule in Business Manager (**Administration › Operations › Jobs**); there is no preference for it.

## Statuses

| Exit status | Code | Meaning |
|---|---|---|
| OK | `OK` | Completed; the message holds the counts as JSON |
| OK | `DISABLED` | `analyticsEnabled` off or site currency not USD |
| OK | `LOCKED` | Another writing job holds the lock; nothing done, next run continues |
| ERROR | `ATTENTION` | Completed with failed orders, mismatches or integrity problems |
| ERROR | `ERROR` | The step threw; nothing partial was committed for the failing chunk |

Every run writes `status`, `lastRunAt`, `lastSuccessAt`, `durationMs` and `counts` to `AnalyticsJobCheckpoint` (shown on the Health page).

## AggregateEvents

Reads batch keys oldest first (up to `MaxBatches`), then per 50 batches: resolves products (variants → master, category), adds the counters, removes the batches — in one transaction. Unknown products are counted as rejected. Afterwards it counts the remaining backlog and sets `collectionPaused` when it is above `analyticsMaxBacklog`. Counts: `batches`, `events`, `rejected`, `dropped`, `oldestMinutes` (aggregation latency of the oldest batch), `backlog`.

## ReconcileOrders

Reads the numbers of orders with `lastModified ≥ cursor` (oldest first, up to `MaxOrders`), then reconciles each order in its own transaction: builds the snapshot, compares it with `analyticsSnapshot`, applies the difference, stores the new snapshot. The cursor stores whole seconds plus the order numbers already handled in that second. The first run starts `analyticsRetentionDays` back (backfill). Counts: `orders`, `changed`, `unchanged`, `skipped` (before retention), `failed`.

## GenerateRankings

For `last-7`, `last-30`, `month`, `previous-month`: sums product days, reads up to `MaxProducts` online master/standalone catalog products, stores the 13 lists in `AnalyticsRanking`.

## Cleanup

Removes event batches older than 7 days (never aggregated — logged as a warning) and daily records older than `analyticsRetentionDays`, at most `MaxItems` per run.

## IntegrityCheck

For each of the last `Days` days (ending yesterday): product sums of impressions, selections, views, cart adds, units added, units sold and gross must equal the site record; the site's order count must equal the qualifying orders created that day; each product record must sit under its own key. It also reports when aggregation has not succeeded in 24 hours or collection is paused. Problems appear on the Health page.

## Restart and recovery

- Every step can be re-run at any time; a failed chunk or order is rolled back and processed by the next run.
- A run that dies keeps the writer lock for up to 60 minutes; the next writer then takes it over (logged).
- To rebuild order figures for a period: clear `analyticsSnapshot` on its orders **and** zero the order fields of the affected daily records in one maintenance window — otherwise orders are counted twice. Prefer leaving history as is.

## Running from the CLI

```bash
npx @salesforce/b2c-cli job run Analytics-AggregateEvents --wait --show-log
npx @salesforce/b2c-cli job run Analytics-ReconcileOrders --wait --show-log
```
