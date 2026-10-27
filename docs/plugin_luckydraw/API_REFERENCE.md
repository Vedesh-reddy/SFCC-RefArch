# API reference

## Storefront controllers

All routes use HTTPS. When the program is off they answer 404 with the "not available" page. Every POST validates the CSRF token. Signed-in routes redirect guests to login and back through slot 9 of `oAuthRenentryRedirectEndpoints`.

| Route | Method | Login | Purpose |
|---|---|---|---|
| `LuckyDraw-Show` | GET | no | Visible campaigns; for signed-in customers also their lucky draw messages |
| `LuckyDraw-Campaign` | GET | no | Campaign page (`id`): rules, legal notices, prizes, schedule and countdown, free entry, own entries and rewards, masked winners, draw transparency |
| `LuckyDraw-Terms` | GET | no | Official rules content asset (`id`) |
| `LuckyDraw-Draw` | GET | no | Verification data of one draw (`id` = execution ID) |
| `LuckyDraw-Snapshot` | GET | no | Frozen snapshot of a finished draw as CSV (`id`); 404 before the draw is finished |
| `LuckyDraw-FreeEntry` | POST | yes | Free entry: `campaignId`, `termsVersion`, `acceptTerms`, `ageConfirmed`, `region` |
| `LuckyDraw-OptOut` | POST | yes | Leave a campaign (`campaignId`) |
| `LuckyDraw-MarkRead` | POST | yes | Mark a message read (`id`) |

### Extended base routes

| Route | Extension | Behavior |
|---|---|---|
| `Cart-AddCoupon` | prepend | If the code belongs to a lucky draw reward and the shopper is not its signed-in winner, or the reward is not ISSUED or has expired, it answers `{error: true, errorMessage}` like the base route and stops. Other codes pass through unchanged |
| `CheckoutServices-PlaceOrder` | prepend | Re-checks lucky draw codes in the basket, removes invalid ones, recalculates and answers the SFRA error JSON |
| `CheckoutServices-PlaceOrder` | append | Marks rewards whose code the placed order used as REDEEMED |

## Custom SCAPI: `luckydraw` (Shopper)

Base: `https://{shortCode}.api.commercecloud.salesforce.com/custom/luckydraw/v1/organizations/{organizationId}`. Every call needs `siteId` and a SLAS shopper token with scope `c_luckydraw`. Campaign data is public to guest tokens; `/me` paths and writes need a registered shopper token. GET requests never write.

| Method | Path | Operation | Notes |
|---|---|---|---|
| GET | `/campaigns` | listCampaigns | Visible campaigns with the next draw |
| GET | `/campaigns/{campaignId}` | getCampaign | Public rules, prizes, schedule, `nextDraw`; 404 for drafts and cancelled campaigns |
| GET | `/campaigns/{campaignId}/winners` | listWinners | Masked names, only when the site and the campaign publish winners |
| GET | `/campaigns/{campaignId}/draws` | listDraws | Finished draws with seed, hashes and drawn entry IDs |
| POST | `/campaigns/{campaignId}/free-entries` | createFreeEntry | Body `{acceptTerms: true, termsVersion, ageConfirmed: true, region}`; 201 with the entry |
| POST | `/campaigns/{campaignId}/opt-out` | optOut | `{optedOut: true, cancelledEntries}` |
| GET | `/me/entries` | listMyEntries | `c_campaignId`, `c_offset`, `c_limit` |
| GET | `/me/rewards` | listMyRewards | Own rewards; the coupon code only while it can be used |

## Custom SCAPI: `luckydraw-admin` (Admin)

Account Manager client token with scope `c_luckydraw_admin`, and `siteId`. There is no endpoint that creates, changes or deletes a draw result.

| Method | Path | Operation | Body / query |
|---|---|---|---|
| POST | `/order-events` | postOrderEvent | `{orderNo, event: CANCELLED, REFUNDED, CHARGEBACK or FRAUD}`. Open entries are cancelled and drawn entries disqualify their winner. Idempotent per order and event: a retry returns `replayed: true` |
| GET | `/campaigns/{campaignId}/executions` | listExecutions | `c_offset`, `c_limit` |
| GET | `/campaigns/{campaignId}/report` | getReport | Counts of entries, winners, rewards and draws by status |
| GET | `/executions/{executionId}` | getExecution | Draw record with winners (seed hidden until the draw is finished) |
| GET | `/executions/{executionId}/verification` | verifyExecution | `{ok, problems}` from recomputing the draw |

## Errors

The Custom APIs answer with RFC 9457 problem details: `type` is `luckydraw-<errorCode>`, `detail` is the localized message, and safe details (field problems, reasons, limits) are in the custom property `fields`. Unknown errors become a 500 without internals. Storefront pages use the same codes; their messages are the `error.<errorCode>` keys in `luckydraw.properties`.

| `errorCode` | HTTP | Meaning |
|---|---|---|
| `invalid` | 400 | Invalid input (`fields`), rules not accepted, age not confirmed |
| `unauthenticated` | 401 | No registered customer |
| `forbidden` | 403 | Not allowed (opted out, no free entry, rules frozen) |
| `not-found` | 404 | Missing or not visible |
| `conflict` | 409 | Duplicate (mail-in reference, campaign ID) or a concurrent change |
| `not-allowed-now`, `stale` | 409 | Status change not allowed; record changed elsewhere |
| `not-eligible` | 422 | Campaign not open, state excluded, winner no longer eligible (`fields.reason`) |
| `limit-reached` | 422 | Free entries per day, entries per customer, snapshot size (`fields.limit`) |
| `locked` | 423 | Draw in progress |
| `rate-limited` | 429 | Too many requests |
| `disabled` | 503 | Program off |
| `unavailable` | 503 | Key, randomness service or folder preference missing |

## Extension hooks

An integration cartridge registers these in its own `hooks.json`. Both are optional.

| Hook | Function | Input | Must return |
|---|---|---|---|
| `app.plugin.luckydraw.bonus` | `bonusEntries` | `{campaignId, orderNo, customerNo}` | Integer 0–100 extra entries (loyalty tier, referral). Used only when the campaign enables it; anything else counts as 0 |
| `app.plugin.luckydraw.randomness` | `seed` | `{executionId, snapshotHash}` | `{seed: 64–256 hex characters, proof: string}` from a trusted draw service or public beacon. Called once per draw after the snapshot is frozen; failures leave the draw FAILED, and it is retried |
