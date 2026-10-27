# Configuration

There are two levels:

- **Site preferences** (group **PluginLuckyDraw**, Merchant Tools › Site Preferences › Custom Preferences) hold the program-wide switches and limits.
- **Campaign settings** hold every business value of a campaign. They are edited in Merchant Tools › Lucky Draw › Campaigns while the campaign is a draft, and frozen when it is scheduled.

Nothing business-related is hardcoded. The code reads the preferences directly with `Site.getCurrent().getCustomPreferenceValue()`, as base SFRA does. Defaults and integer ranges are part of the metadata (`default-value`, `min-value`, `max-value`), so Business Manager applies the default and refuses values outside the range. Switches fail closed: only `true` turns the program or legal approval on. Folder preferences are checked before use and refused when they could leave their IMPEX folder. Lucky Draw › Overview lists missing required values under "Preference problems".

## Site preferences

| Preference | Type | Default | Range / values | Purpose |
|---|---|---|---|---|
| `luckyDrawEnabled` | boolean | false | | Master switch |
| `luckyDrawCurrency` | string | (none, required) | `USD` | Program currency; the site default currency must also be USD |
| `luckyDrawLegalApproved` | boolean | false | | Legal sign-off for live campaigns on **production**. Without it no campaign can be scheduled there. Other instances run labelled demonstrations |
| `luckyDrawAllowedCountries` | set | (empty: US) | `US` only | Countries a campaign may include |
| `luckyDrawAllowedTimeZones` | set | (empty:) US zones (New York, Chicago, Denver, Phoenix, Los Angeles, Anchorage, Honolulu) | IANA names | Time zones a campaign may use |
| `luckyDrawEntryLookbackHours` | int | 72 | 1–720 | How far back the entries job looks for paid orders |
| `luckyDrawVelocityMaxEntriesPerDay` | int | 10 | 1–1000 | Entry records per customer and campaign in 24 hours before new ones are flagged |
| `luckyDrawFreeEntryRateLimitPerHour` | int | 10 | 1–1000 | Free entry requests per customer per hour |
| `luckyDrawMaxSnapshotEntries` | int | 50000 | 10–200000 | Largest draw; more opens a case and needs an external store |
| `luckyDrawLockMinutes` | int | 30 | 5–240 | Draw lock expiry (a crashed run releases its window after this) |
| `luckyDrawSnapshotDirectory` | string | `src/plugin-luckydraw/snapshots` | path below IMPEX, no `..` | Frozen draw snapshots |
| `luckyDrawAuditExportDirectory` | string | `src/plugin-luckydraw/audit` | path below IMPEX, no `..` | Audit export files |
| `luckyDrawRewardMaxAttempts` | int | 5 | 1–20 | Coupon issuance attempts before FAILED |
| `luckyDrawPublishWinners` | boolean | false | | Allows masked winner names on the storefront (the campaign must allow it too) |
| `luckyDrawNotificationChannels` | set | (empty: INBOX) | INBOX, EMAIL | Participant channels |
| `luckyDrawNotificationMaxAttempts` | int | 5 | 1–20 | E-mail delivery attempts |
| `luckyDrawFromEmail` | string | (none) | e-mail | Sender; e-mails are not sent without it |
| `luckyDrawAdminNotificationEmails` | set | (empty) | | Recipients of admin messages |
| `luckyDrawBadgeThresholds` | set | (empty: 1, 5, 10) | numbers | Milestone badges on the campaign page |
| `luckyDrawRecommendationsEnabled` | boolean | false | | Show products of the first eligible category |
| `luckyDrawRecommendationsMax` | int | 4 | 1–12 | Products shown |
| `luckyDrawHistoryPageSize` | int | 20 | 5–100 | Entries shown on the campaign page |
| `luckyDrawApiMaxPageSize` | int | 50 | 1–200 | Largest `c_limit` in the APIs |
| `luckyDrawRequestKeyRetentionDays` | int | 30 | 1–365 | How long order-event idempotency keys are kept |

Sandbox values (`metadata/plugin_luckydraw/sites/RefArch_Practice/preferences.xml`): `luckyDrawEnabled=true`, `luckyDrawCurrency=USD`, `luckyDrawAllowedCountries=US`, `luckyDrawLegalApproved=false`, `luckyDrawPublishWinners=true`, both notification channels, and example e-mail addresses.

## Campaign settings

| Setting | Values | Notes |
|---|---|---|
| Campaign ID | `[a-z0-9][a-z0-9-]{2,40}` | Unique per site |
| Name, description | text | Shown on the storefront |
| Mode | SWEEPSTAKES, GUARANTEED | GUARANTEED is the non-random mode for places where purchase-linked chance promotions are not allowed |
| Time zone | from `luckyDrawAllowedTimeZones` | All campaign times are local to it |
| Start, end | `YYYY-MM-DD HH:MM` local | End after start |
| Draw frequency | DAILY, WEEKLY, MONTHLY, CAMPAIGN | CAMPAIGN = one draw after the end |
| Draw time | `HH:MM` local | Window boundary; not used for CAMPAIGN |
| Draw delay | 0–10080 minutes | Draw runs this long after the window end; at least the hold period |
| Hold period | 0–720 hours | Order entries count only after this (cancellation window) |
| Eligible countries | `US` | Must be in `luckyDrawAllowedCountries` |
| Excluded states | two-letter codes | Billing state (orders) or declared state (free entries) |
| Customer groups | group IDs | Empty = all registered customers; static groups recommended |
| Minimum eligible merchandise (`minOrder`) | USD | After discounts, without shipping and tax |
| Eligible categories, excluded products | IDs | Categories include sub-categories; variants use their master |
| Entry method | PER_ORDER, PER_INCREMENT | Plus the increment amount (`increment`, USD) for PER_INCREMENT |
| Maximum entries per order / per customer | 1–1000 / 1–100000 | The customer maximum is also enforced in every snapshot |
| Bonus categories, bonus entries | IDs, 0–100 | Extra entries when the order contains a bonus category |
| Loyalty/referral bonus hook | on/off | `app.plugin.luckydraw.bonus`; only where legally permitted |
| Selection mode | ENTRY, PARTICIPANT | Required for sweepstakes: each entry, or each participant, is one chance |
| Pool | WINDOW, CAMPAIGN | CAMPAIGN keeps non-winning entries for later draws (grand prize) |
| Prizes | JSON list | `{"tier","label","winners","couponId","validityDays"}`; up to 10 tiers and 100 winners per draw |
| Alternates per draw | 0–20 | Take over disqualified prizes |
| Maximum wins per participant | 1–100 | In this campaign |
| Excluded campaigns | IDs | Confirmed winners of these campaigns cannot win |
| Verify winners | on/off | Winners are potential winners until confirmed |
| Free entry | on/off, per day 1–10, weight 1–100 | Required for sweepstakes |
| Minimum age | 18–21 | Shown and confirmed on free entry |
| Official rules | content asset ID + version | Asset must be online; free entry needs this version accepted |
| Legal approval reference | text | Required to schedule |
| Notify entrants / winners, publish winners | on/off | |
| Funding | MARKETPLACE, SELLER, SHARED + reference | Who pays for rewards (reporting) |
| Random source | PLATFORM, EXTERNAL | EXTERNAL uses `app.plugin.luckydraw.randomness` |

### Example: the campaign from the brief

| Setting | Value |
|---|---|
| Minimum eligible merchandise | 2500.00 |
| Draw frequency / time | DAILY at 20:00, America/New_York |
| Prizes | `[{"tier":"daily","label":"$200 coupon","winners":1,"couponId":"ld-200-off","validityDays":30}]` |
| Entry method | PER_ORDER, max 1 per order |
| Hold / delay | 24 hours / 1440 minutes |
| Free entry | on, 1 per day, weight 1 |

## Services

| Service | Use | Configure |
|---|---|---|
| `plugin-luckydraw.hmac` | Key for entry IDs, participant tokens and coupon code lookup hashes | Password: random, at least 32 characters. **Never change it while campaigns run**: entry deduplication and coupon lookup depend on it |

## Jobs

`metadata/plugin_luckydraw/jobs.xml` imports nine jobs with disabled schedules. The draw time is decided by the campaign windows, not by these schedules. The schedules only decide how soon after a draw time the job runs.

| Job | Imported interval | MaxItems |
|---|---|---|
| `LuckyDraw-Status` | 15 minutes | 200 |
| `LuckyDraw-Entries` | 15 minutes | 1000 |
| `LuckyDraw-Reconcile` | 1 hour | 1000 |
| `LuckyDraw-Draw` | 5 minutes | 1000 |
| `LuckyDraw-Verify` | 1 hour | 200 |
| `LuckyDraw-Rewards` | 15 minutes | 200 |
| `LuckyDraw-Notifications` | 5 minutes | 500 |
| `LuckyDraw-Cleanup` | daily | 1000 |
| `LuckyDraw-AuditExport` | daily | 5000 |

## Custom log file

Create a custom log file for the prefix `plugin-luckydraw` (Administration › Operations › Custom Log Settings). Its categories are `luckydraw-entry`, `luckydraw-execution`, `luckydraw-reward`, `luckydraw-notification`, `luckydraw-job`, `luckydraw-api` and `luckydraw-admin`.
