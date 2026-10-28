# Security and privacy

## Storefront: `Analytics-Collect`

| Threat | Control |
|---|---|
| Forged purchase or revenue | Browser events are limited to `view_item_list`, `select_item`, `view_item`, `search`. Sales come only from orders; cart/checkout events only from the server routes after the base route succeeded |
| Client-controlled prices | No price is read from the browser. Add-to-cart uses the basket line's base price; sales use the order |
| Cross-site request forgery | Pages are cached, so they cannot hold a session CSRF token. The endpoint accepts only HTTPS POSTs whose `Origin` (or `Referer`) host equals the request host, and it can only add engagement counts within per-session limits. A forged request could at most add views in the victim's own session |
| Injection | Every field is pattern- and range-checked (see [event contract](analytics-event-contract.md)); unknown fields are dropped; page context is HTML-escaped in the template hook |
| Oversized requests | Body ≤ 16 384 characters, ≤ `analyticsBatchSize` events |
| Replay / retries | Batch key `day_batchId` is unique; an existing key is ignored |
| Abuse / flooding | `analyticsMaxBatchesPerMinute` per session; one custom object per request; backlog circuit breaker (`analyticsMaxBacklog`); sampling |
| Personal data | No names, e-mails, phones, addresses, customer numbers or payment data are stored. The session token is random and unrelated to the session ID. Search terms with `@` or 5+ digits are refused. Checkout attempts are a hash of the basket UUID |
| Consent | `analyticsRequireConsent` honours `session.trackingAllowed` |
| Availability | Analytics errors are caught and logged; the shopper's request continues; the endpoint always answers 204 |

## Business Manager

- Every page is registered under its own **permission-scoped menu action**; the platform checks the user's role for the selected site before the controller runs. No `NoPermissionCheck` is used. Hiding a menu entry is not relied on.
- The controller also requires an authenticated BM session (`403` otherwise).
- CSV export has its own menu action (`plugin-analytics-export`), so roles can view reports without export rights. Exports are logged with the BM user name.
- Parameters are allow-listed (period, sort, direction, report, mode) or pattern-checked (dates, product ID); free-text filters are only compared in memory, never placed in queries.
- Output is escaped by ISML. CSV cells starting with `= + - @`, tab or CR are prefixed with `'`.
- Reports read the site-scoped records of the selected site only; there is no site parameter to tamper with.
- Reports contain no customer data and no order numbers.

### Role setup

1. **Administration › Organization › Roles & Permissions** → choose or create a role (e.g. `analytics-viewer`).
2. **Business Manager Modules** → select the site → grant the `Storefront Analytics` actions needed (all but *CSV export* for viewers).
3. Assign users to the role.

## Logging

Logger `plugin-analytics` with categories `analytics-collect`, `analytics-jobs`, `analytics-admin`. Messages never contain event payloads, tokens or customer data.
