# Architecture

## Components

```
Storefront (SFRA)                     Headless / back office               Business Manager
  LuckyDraw-* pages                     SCAPI custom API "luckydraw"         bm_luckydraw
  Cart-AddCoupon (prepend)              SCAPI custom API "luckydraw-admin"   LuckyDrawAdmin-* (5 modules)
  CheckoutServices-PlaceOrder (ext.)
            \                                |                                  /
             +----------- scripts/helpers/luckyDraw*Helpers.js ----------------+
                 luckyDrawHelpers  luckyDrawCampaignHelpers  luckyDrawEntryHelpers
                 luckyDrawDrawHelpers  luckyDrawRewardHelpers
                                           |
                         Custom objects LuckyDraw*  (site scope)
                         IMPEX files: frozen draw snapshots, audit exports
                         Jobs LuckyDraw-*  (status, entries, reconcile, draw, verify,
                                            rewards, notifications, cleanup, audit export)
```

The cartridge follows the base SFRA layout:

| File | Contents |
|---|---|
| `scripts/helpers/luckyDrawHelpers.js` | Shared pieces: on/off and legal checks, results, bounded queries, IDs and HMAC, rate limits, status moves, audit, notifications, review cases, cents formatting, API responses, job state |
| `scripts/helpers/luckyDrawCampaignHelpers.js` | Campaign rules and readiness, draw windows in the campaign time zone, storefront page models |
| `scripts/helpers/luckyDrawEntryHelpers.js` | Order, free and mail-in entries, reconciliation, opt-out |
| `scripts/helpers/luckyDrawDrawHelpers.js` | Draw executions, the verifiable selection, winners and alternates |
| `scripts/helpers/luckyDrawRewardHelpers.js` | Coupon rewards and code checks |
| `forms/default/luckyDrawFreeEntry.xml` | SFRA form of the free entry |

Helpers return base-style result objects: `{ error: false, ... }` on success, or `{ error: true, errorCode, errorMessage, fields }`. Inside a transaction or a draw phase, a refusal throws (`luckyDrawHelpers.abort`) so the work rolls back; the calling helper or job turns it into a result or a failed draw.

No file of `app_storefront_base` is changed. Base routes are extended with `server.extend(module.superModule)` and `prepend`/`append`. No base template is overridden. The pages are new routes: link them from a content slot, a folder or the navigation.

## Campaign rules

A campaign is one `LuckyDrawCampaign` record holding every business value. These include:

- amounts (entered in dollars, stored in cents), dates, the time zone, the draw frequency and time;
- the entry rules and the prize tiers (JSON);
- limits, exclusions, the official rules asset and version;
- the legal approval reference and the funding source.

Administrators edit the record in Business Manager while it is a DRAFT. `luckyDrawCampaignHelpers.getReadinessProblems` lists everything that blocks scheduling. Scheduling freezes the rules, so changing a rule means cancelling the campaign and creating a new one. Pausing records an interval in `pauses`. Orders created during a pause earn no entries, and draws wait until the campaign resumes.

Campaigns are site-scoped custom objects, so a campaign runs on the site it was created in. That is how the "eligible sites" setting works.

## Draw windows

`luckyDrawCampaignHelpers.getDrawWindows` computes the windows of a campaign from its start, end, time zone, frequency (DAILY, WEEKLY, MONTHLY, CAMPAIGN) and local draw time. Each window ends at the local draw time. Its draw runs at `end + drawDelayMinutes`. The delay must be at least the hold period, so cancellations inside the hold period are seen before the draw.

Boundaries depend only on the rules, never on when a job runs. A missed or doubled job run cannot skip or repeat a window. A daylight-saving change moves the UTC instant but not the local time. Time zones are limited to `luckyDrawAllowedTimeZones`.

## Entries

```
paid order (job reads order status, payment status, prorated line prices)
   -> evaluateOrder: registered customer, USD, NEW/OPEN/COMPLETED, PAID, inside campaign
      and not paused, billing country allowed, state not excluded, customer groups,
      eligible categories, excluded products, minimum amount
   -> entry count: 1 per order, or 1 per increment; + category bonus; + optional hook;
      capped per order and per customer
   -> LuckyDrawEntry PENDING (key = "LDE-" + HMAC(campaign | source))
   -> ACTIVE after the hold period (reconcile job, or at the draw)
```

- **Keys:** the entry key is a keyed hash of campaign and source (`ORDER:<orderNo>`, `FREE:<customer>:<day>:<slot>`, `MAIL:<reference>`). An order can therefore create one entry at most, however many jobs see it. The published entry IDs do not reveal order numbers.
- **No client signals:** entries are never created from browser events. The `LuckyDraw-Entries` job walks paid orders of the last `luckyDrawEntryLookbackHours`. A cursor moves through that period and then starts again, so an order paid late still earns its entry.
- **Late entries:** an entry whose window has already been frozen moves into the current window. A late job never changes a finished draw.
- **Free entries:** the free method of entry uses per-day slots in the campaign time zone. Concurrent requests for the same slot collide on the key.
- **Wallet:** orders paid with a wallet (for example by `plugin_wallet`) qualify under the same rules, because only the order's payment status counts. A wallet top-up is not an order and never qualifies.

## Draws

One `LuckyDrawExecution` exists per window, with key `<campaignId>_<windowKey>`. The unique key makes it impossible to draw a window twice.

| Phase | What happens |
|---|---|
| SCHEDULED | Created when the window opens. For `PLATFORM` randomness, a 256-bit seed comes from `SecureRandom` and only its SHA-256 is shown (the commitment). A commitment made after the window ended opens a `LATE_COMMITMENT` case |
| FROZEN | At the draw time, every candidate entry is re-validated against its order and the participant. Flagged entries and participants at their win limit are left out. Weights are capped per customer. The canonical snapshot "entryId,participantToken,weight" (sorted by entry ID) is written to `IMPEX/<luckyDrawSnapshotDirectory>/<executionId>.csv`, and its SHA-256 is stored |
| SELECTED | Picks are computed from seed and snapshot (below). Winners and alternates are stored with keys `<executionId>:<rank>`. The result is sealed with a hash |
| FINALIZED | Rewards are created for confirmed winners. With a WINDOW pool, the window's other entries become NOT_SELECTED (bounded, resumes next run) |
| VOID / FAILED | VOID means no eligible entry. FAILED resumes from the last finished phase on the next run |

Each phase runs under a `LuckyDrawLock` record (unique key), with an expiry of `luckyDrawLockMinutes`. A second job run gets `LOCKED` and does nothing. All writes are idempotent by key, so a crash between phases never adds or changes winners.

### Selection algorithm `ld-hmac-sha256-v1`

```
W = remaining total weight
repeat for draw k = 0, 1, ...:
    x = first 52 bits of HMAC-SHA256(key = seed, data = snapshotHash + ":" + counter)
    counter += 1
    if x >= floor(2^52 / W) * W: retry          (rejection sampling: no modulo bias)
    ticket = x mod W
    winner = item whose cumulative weight range contains ticket (canonical order)
    remove every item of the winner's participant (one prize per participant per draw)
```

Selection never depends on database order: items are sorted by their random entry ID. `selectionMode` must be set explicitly:

- ENTRY: each entry is one chance;
- PARTICIPANT: each participant gets one chance, whatever their number of entries.

After the draw, the seed, the snapshot file (download `LuckyDraw-Snapshot`), the hashes and the drawn entry IDs are published, so anyone can recompute the result. `luckyDrawDrawHelpers.verifyDraw` does the same recomputation server-side. The Verify job runs it once for every finished draw and opens a `VERIFICATION_MISMATCH` case on any difference.

For an external randomness source (`randomSource = EXTERNAL`), the hook `app.plugin.luckydraw.randomness` returns the seed and a proof (for example a beacon round). Both are stored with the draw.

### Winners

- Picks of rank below the number of prizes become winners. Prize tiers are assigned in their configured order. The remaining picks are ranked alternates.
- With `requireWinnerVerification`, a winner is PENDING_VERIFICATION until an administrator confirms eligibility.
- Disqualification needs a reason. The best-ranked alternate takes over the prize, the reward is withdrawn, and the change is audited. Common causes are a failed check, an order refund or chargeback, and revalidation in the Verify job.
- Alternates are released once every prize of the draw is confirmed and issued.
- No route, API or desk node can edit a drawn result.

## Rewards

The discount is a Business Manager promotion: fixed amount, percentage or free shipping, with category, minimum basket and maximum discount rules. Its coupon must issue single-use codes (system codes or imported codes, redemption limit per code 1); readiness checks this.

- **Issuance:** `Coupon.getNextCouponCode()` runs inside the same transaction that writes the reward, so a rollback also gives the code back. Each winner has at most one reward (same key). Failures retry with backoff, then open a `COUPON_ISSUE_FAILED` case.
- **Customer binding and expiry:** the platform does not bind a code to a customer or give it its own expiry. The plugin checks owner, status and expiry in a `Cart-AddCoupon` prepend and again in a `CheckoutServices-PlaceOrder` prepend, which removes invalid codes.
- **Redemption:** a redemption is recorded in a PlaceOrder append. The Rewards job also syncs `CouponMgr.getRedemptions`, for orders placed elsewhere, and expires old codes.
- **Where the code appears:** only on the signed-in winner's lucky draw page and in `/me/rewards`. It is never in e-mails, notifications or logs.

## Jobs

All steps are `transactional="false"`, take `MaxItems`, return `DISABLED` when the program is off, and are safe to run more often than scheduled.

| Step | Work |
|---|---|
| `custom.LuckyDraw.Status` | SCHEDULED → ACTIVE at start; ACTIVE/PAUSED → COMPLETED after the end once every draw is done |
| `custom.LuckyDraw.Entries` | Entries from paid orders |
| `custom.LuckyDraw.Reconcile` | Cancels entries of cancelled, failed or unpaid orders and of opted-out participants; activates entries after the hold |
| `custom.LuckyDraw.Draw` | Seed commitments and due draws; cancels pending draws of cancelled campaigns |
| `custom.LuckyDraw.Verify` | Revalidates winners whose reward is not issued; recomputes finished draws; releases alternates |
| `custom.LuckyDraw.Rewards` | Issues due rewards, syncs redemptions, expires codes |
| `custom.LuckyDraw.Notifications` | Sends queued e-mails with retries |
| `custom.LuckyDraw.Cleanup` | Removes expired locks, rate buckets and old request keys |
| `custom.LuckyDraw.AuditExport` | Appends new audit events to `IMPEX/<luckyDrawAuditExportDirectory>/audit-*.jsonl` |

## Logging

The loggers are `Logger.getLogger('plugin-luckydraw', <category>)`, with these categories:

- `luckydraw-entry`, `luckydraw-execution`, `luckydraw-reward`;
- `luckydraw-notification`, `luckydraw-job`, `luckydraw-api`, `luckydraw-admin`.

Logs contain no seeds, coupon codes, e-mail addresses or keys.

## Optional integrations

| With | How |
|---|---|
| `plugin_wallet` | None needed: wallet-paid orders are normal paid orders. Top-ups are not orders |
| `plugin_seller` | Marketplace products are normal products in the eligible categories. `fundingSource` (MARKETPLACE, SELLER, SHARED) and `fundingReference` record who pays for the reward, for settlement outside this plugin |
| Loyalty or referral programs | Hook `app.plugin.luckydraw.bonus` (`bonusEntries(order) → 0..100`), used only when the campaign enables it |
| Draw services | Hook `app.plugin.luckydraw.randomness` (`seed(execution) → {seed, proof}`) |

## Limitations

- **Scale:** a draw holds at most `luckyDrawMaxSnapshotEntries` (default 50,000) entries in one snapshot. More opens a `SNAPSHOT_TOO_LARGE` case and the draw fails. Custom object quotas also apply. Large national campaigns need an external campaign store and draw service.
- **Registered customers only:** guest orders earn no entries. The campaign page says so.
- **Dynamic customer groups** are evaluated outside a session in the entries job. Rules that depend on session data do not apply there; use static groups (spike L6).
- **Headless coupon checks:** the owner and expiry check is enforced in SFRA cart and checkout. A headless checkout needs the same check in its own basket hooks. Redemptions made there are still recorded by the Rewards job.
- **Commitment strength:** the seed is generated and stored on the platform. The commitment proves that the job did not choose the seed after seeing the entries. It cannot rule out an insider with access to the stored seed. For high-value prizes, use an external randomness source.
