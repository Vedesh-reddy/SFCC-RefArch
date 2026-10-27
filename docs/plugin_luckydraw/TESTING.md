# Testing

## Unit tests (executed)

```bash
# from the repository root
npx mocha 'test/plugin_luckydraw/unit/*.test.js'
```

Result at hand-off: **80 passing**.

The tests run the real cartridge modules on an in-memory Script API double (`test/plugin_luckydraw/unit/harness.js`). The double provides:

- custom objects with unique keys and a query parser;
- transactions that roll back, including issued coupon codes;
- order search;
- a time-zone `Calendar`;
- coupons and redemptions;
- content assets;
- SecureRandom, HMAC and SHA-256 (backed by Node crypto);
- IMPEX files, hooks, `Resource` (reads `luckydraw.properties`), `StringUtils.formatMoney` and RESTResponseMgr;
- site preferences with the metadata defaults.

The harness reads `metadata/plugin_luckydraw` and fails on any write to an attribute that is missing from the metadata or has the wrong type.

| Suite | Covers |
|---|---|
| `foundation.test.js` | Preferences fail closed and stay US-only; legal gate on production; safe folders; US time zones when empty; base-style error results. Windows: daily boundaries across a daylight-saving change, weekly, monthly with short months, whole campaign, local date parsing. Selection: deterministic and order-independent, one win per participant, no zero weights, near-uniform over 2,000 seeds, weighting, weak seeds refused, result seal |
| `campaigns.test.js` | Field validation (dollars stored as cents) and stale-page refusal. Readiness: legal reference, production approval, free entry required, selection mode, rules asset, single-use coupon, delay at least the hold, one prize in guaranteed mode. Rules frozen after scheduling; start; pause with reason (orders during the pause do not count); resume; cancel; public view without legal or coupon data |
| `entries.test.js` | Eligibility (guest, unpaid, status, country, excluded state, minimum, campaign period); prorated prices of eligible categories without excluded products and bonus items; increments, category bonus and per-order cap; bonus hook only when enabled and in range; one entry per order; job cursor and restart; customer maximum; velocity flag and case; late entries roll forward. Free entry: rules version, age, state, sign-in, daily slots, paused campaign. Mail-in once per reference; reconciliation; OMS refunds; opt-out; own entries only |
| `draws.test.js` | Seed commitment sealed until the draw; snapshot file and hash with pseudonymous tokens; winner and alternates; window closed. Recomputation by anyone, and `verify`. No second draw; a held lock stops a parallel run; tampered snapshot detected; resume after a provider failure with the same snapshot and winners. Flagged entries, win limits and per-customer caps; participant mode. Disqualification hands the prize to the best alternate and withdraws the reward; refund of a winning order; revalidation before issuance; verification step. Guaranteed mode once per entry; empty window VOID; paused campaign holds; cancelled campaign cancels |
| `rewards.test.js` | Code issued once inside the transaction, with expiry and no code in messages; retries, backoff, FAILED and case, admin retry. Only the winner, only before expiry; misuse case. `Cart-AddCoupon` refusal; PlaceOrder removes an invalid code and records the redemption; platform redemption sync; code shown only to its owner |
| `integration-points.test.js` | Shopper API: public campaigns without legal data, 401 and 404, free entry with the token customer, GET writes nothing, own entries only. Admin API: idempotent order events, read-only draws with recomputation, seed hidden before the draw. Jobs: disabled; the whole flow from paid order to issued reward and e-mails without the code; audit export once; lock cleanup. Page model: masked winners, own standing, badges, unpublished winners, hidden cancelled campaigns |
| `integrity.test.js` | Every used resource key and dynamic prefix exists; notification texts exist; job steps exist in code and `jobs.xml`; schedules ship disabled; Custom API endpoints are public and declared, with no write path for draws; BM nodes registered once and exported, and the desk never runs a draw; a message for every error code; every preference the code reads is in the metadata; no plugin framework modules; logger, Grid, `Math.random` and class-name conventions; base cartridges untouched |

Lint (executed, clean):

- `npx eslint cartridges/plugin_luckydraw cartridges/bm_luckydraw test/plugin_luckydraw`
- `npx stylelint "cartridges/plugin_luckydraw/**/*.scss"`
- `npm run lint` (CSS, JS and ISML of the whole repository)
- `npx sgmf-scripts --compile js|css --cartridgeName plugin_luckydraw` compiles (the output is git-ignored)

All XML in `metadata/plugin_luckydraw` and `bm_extensions.xml` was validated with xmllint against the platform XSDs.

## Not executed

Nothing has run on a B2C Commerce instance. The unit tests do not cover:

- ISML rendering, the countdown script, SFRA middleware chains;
- `Coupon.getNextCouponCode` on a real system-codes coupon, `CouponMgr.getRedemptions`;
- `OrderMgr.searchOrders` with the query used by the entries job;
- `dw.util.Calendar` time-zone behavior;
- IMPEX file writes;
- Custom API registration, Business Manager extension loading, e-mail delivery.

## Sandbox verification plan

Run these on a sandbox, in order, and record the results here.

| # | Spike | How | Pass criteria |
|---|---|---|---|
| L1 | Install | Deploy, import metadata, open BM › Lucky Draw › Overview | No preference problems; menus visible for a role with the modules |
| L2 | Coupon | System-codes coupon, limit 1 per code; issue a reward with the Rewards job | Code from the coupon; second run issues nothing; code works once at checkout |
| L3 | Readiness | Draft without rules asset, legal reference or free entry | Schedule refused with those problems |
| L4 | Entries | Place paid orders above and below the minimum, a guest order, an RI order | Entries only for the eligible registered order; one per order after several job runs |
| L5 | Time zones | Daily campaign in America/Los_Angeles; check window keys and draw times in BM against the local clock, across a DST change if possible | Draws at the local draw time + delay |
| L6 | Customer groups | Campaign with a static group, then a dynamic group | Static works; record the dynamic group behavior |
| L7 | Code checks | Apply the winner's code from another account; after expiry; after use | All refused; misuse case opened |
| L8 | Draw | Several entrants; run the Draw job; download the snapshot; recompute with an independent script | Same winners; verification "matches" in BM |
| L9 | Concurrency | Start the Draw job twice at once | One run draws, the other reports LOCKED; one set of winners |
| L10 | Custom APIs | `b2c scapi custom status`; call `/campaigns` with a guest token, `/me/entries` with a registered token, `POST /order-events` with an AM token | Registered; 200 / 401 / idempotent order event |
