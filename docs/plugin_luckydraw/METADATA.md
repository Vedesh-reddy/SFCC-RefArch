# Metadata

Everything is in `metadata/plugin_luckydraw` and imports as one site archive. All files validate against the platform XSDs (see [metadata/plugin_luckydraw/README.md](../../metadata/plugin_luckydraw/README.md)). The unit-test harness reads the same files and fails on any write to an undefined or wrongly typed attribute. The plugin adds no attribute to system objects other than its site preferences.

## Custom object types

All are site-scoped. IDs that are not business keys are generated with `SecureRandom`.

| Type | Key | Holds | Changed after creation? |
|---|---|---|---|
| `LuckyDrawCampaign` | campaign ID | All campaign rules, prizes (JSON), pause intervals, scheduling audit fields | Only while DRAFT; afterwards status and pauses only |
| `LuckyDrawEntry` | `LDE-` + keyed hash of campaign and source | Source (order number, free-entry slot or mail reference), customer number, participant token, entry count, window, hold time, state, flag, status | Status, window (late entries), flag |
| `LuckyDrawParticipant` | `campaignId:customerNo` | Pseudonymous token, entry and free-entry counters, wins, opt-out | Counters, opt-out |
| `LuckyDrawExecution` | `campaignId_windowKey` | Window, draw time, seed and seed hash, random proof, snapshot file and hash, counts, picks, result seal, phase timestamps, verification | Phases only; nothing changes after FINALIZED except verification fields |
| `LuckyDrawWinner` | `executionId:rank` | Entry, customer number, tier, prize, coupon ID, masked display name, status, reason, decided by, replaced winner | Status and decision fields |
| `LuckyDrawReward` | winner ID | Coupon ID and code, keyed hash of the code, status, attempts, issue, expiry and redemption dates, order number | Status fields |
| `LuckyDrawAuditEvent` | `AUD-<24 hex>` | Entity, action, actor, from/to status, reason, redacted detail | Never |
| `LuckyDrawNotification` | `LDN-<24 hex>` | Recipient customer number, type, channel, parameters, delivery status | Delivery status |
| `LuckyDrawCase` | `LDC-<24 hex>` | Case type, severity, status, campaign, entity, dedupe key, detail, notes | Yes |
| `LuckyDrawLock` | lock name | Holder, expiry | Removed when released or expired |
| `LuckyDrawJobState` | job ID | Cursor JSON | Yes |
| `LuckyDrawRateBucket` | bucket and window | Count (retention 2 days) | Yes |
| `LuckyDrawRequestKey` | `order-event:<orderNo>:<event>` | Result of an admin API order event | Never; removed after `luckyDrawRequestKeyRetentionDays` |

No custom object stores an e-mail address, a name, an address or a payment detail. Winners carry a masked display name ("A. (TX)"). The coupon code is stored on the reward only, because the winner needs to see it.

## Files

| Location (IMPEX) | Content | Written by |
|---|---|---|
| `<luckyDrawSnapshotDirectory>/<executionId>.csv` | Frozen snapshot "entryId,participantToken,weight" | Draw job, once per draw |
| `<luckyDrawAuditExportDirectory>/audit-<date>-<ms>.jsonl` | Audit events, one JSON object per line | Audit export job |

Restrict WebDAV access to these folders. Keep the snapshots for as long as the draws must stay verifiable.

## Site preferences

24 `luckyDraw*` preferences in group `PluginLuckyDraw`; see [CONFIGURATION.md](CONFIGURATION.md).

## Jobs

`jobs.xml` defines nine jobs, `LuckyDraw-Status`, `-Entries`, `-Reconcile`, `-Draw`, `-Verify`, `-Rewards`, `-Notifications`, `-Cleanup` and `-AuditExport`. Each has one step of the matching `custom.LuckyDraw.*` type from `steptypes.json`. All recurring triggers ship **disabled**. Replace `RefArch_Practice` with your site ID.

## Services

`services.xml` defines `plugin-luckydraw.hmac` (credential, profile, service). Its credential ships without a password; enter it in Business Manager.

## Not included

These are not part of the import, because they depend on the merchant's own choices:

- the reward promotion and coupon;
- the official rules content asset.

Create them in Business Manager (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Changing the metadata

When you add an attribute or a preference, add it to the XML, validate it with xmllint and re-run the tests. `integrity.test.js` fails when the code reads a preference that is not in it.
