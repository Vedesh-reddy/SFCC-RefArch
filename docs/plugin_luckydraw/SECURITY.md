# Security, fairness and compliance

## Trust boundaries

| Caller | Authentication | What it can reach |
|---|---|---|
| Visitor | none | Public campaign data, masked winners, finished draw data |
| Shopper (storefront) | SFRA session, registered and signed in; HTTPS; CSRF on every POST | Own entries and rewards, free entry, opt-out |
| Shopper (headless) | SLAS token, scope `c_luckydraw`; registered for `/me` and writes | Same as above |
| OMS / auditors | Account Manager client, scope `c_luckydraw_admin` | Order events; read-only draw records and verification |
| Campaign team, draw team, fraud team | Business Manager login with the Lucky Draw module permissions | Campaigns; draws and winners; entries and cases; audit (separate modules) |

## Fair, verifiable draws

- **Randomness:** seeds come from `dw.crypto.SecureRandom` (256 bits) or a trusted external source. `Math.random` is not used anywhere in the plugin; a test checks this.
- **Ordering:** selection never depends on database order. The snapshot is sorted by random entry IDs, and picks come from HMAC-SHA256 with rejection sampling, so there is no modulo bias.
- **Commitment:** the seed's hash is stored, and shown on the storefront, when the window opens. Entries are then frozen into a hashed snapshot file. After the draw the seed is published, so anyone can recompute the winners from the seed and the downloadable snapshot. The Verify job recomputes every finished draw, and Business Manager shows the recomputation on each draw page.
- **No duplicates:** one execution per window (unique key), plus an exclusive lock per draw phase, plus winner and reward keys per rank. Concurrent or repeated job runs cannot select extra winners or issue extra rewards; tests cover this.
- **Weighting:** only explicit. Selection mode ENTRY counts each entry as one chance; PARTICIPANT gives each participant one chance. There is no other weighting.
- **Immutable results:**
  - nothing changes a finished draw;
  - a disqualification is a new, reasoned, audited decision that hands the prize to the next ranked alternate;
  - the result seal and the recomputation detect any change to the snapshot, the seed or the picks.
- **Limit — insider access:** the seed is stored on the platform, so a person with access to stored data could read it before the draw. For high-value prizes, use `randomSource = EXTERNAL` with a public randomness beacon or a third-party draw service.

## Entry integrity and fraud controls

| Control | Where |
|---|---|
| Entries only from paid, open orders read on the server; never from the browser | `luckyDrawEntryHelpers.evaluateOrder`, entries job |
| One entry per order or free-entry slot (keyed hash key) | `luckyDrawEntryHelpers.getEntryId` |
| Hold period before entries count; revalidation at the draw and before issuing rewards | `holdHours`, draw freeze phase, `luckyDrawDrawHelpers.verifyWinners` |
| Cancellations, refunds, chargebacks, fraud flags | Reconcile job; admin API `POST /order-events` |
| Customer maximum (also enforced in every snapshot), per-order cap, free entries per day, request rate limit | `luckyDrawEntryHelpers`, draw freeze phase, `luckyDrawHelpers.checkRateLimit` |
| Velocity flag: too many entries in 24 hours, left out of draws until reviewed | `SUSPICIOUS_VELOCITY` case |
| Winner exclusions (wins per participant, winners of other campaigns), one prize per participant per draw | `luckyDrawDrawHelpers` |
| Rules frozen once scheduled; pause and cancel need a reason; every admin action audited with the BM user | `luckyDrawCampaignHelpers`, `luckyDrawHelpers.logAudit` |
| Coupon misuse: code bound to the winner and its expiry, checked in cart and checkout; misuse opens a case | `luckyDrawRewardHelpers.checkRewardCode`, `Cart-AddCoupon`, `PlaceOrder` |

## Coupon codes

- Codes come from the platform's single-use coupon (system or imported codes, redemption limit per code 1). The plugin never invents codes, and readiness refuses coupons that are not single-use.
- A code is useless to anyone but its winner, because the plugin refuses it for other accounts. This makes guessing or enumerating codes pointless in the SFRA checkout. Codes still need the platform's own randomness or a strong imported list (spike L7).
- Codes are shown only to the signed-in winner while they can be used. They are never in e-mails, notifications, logs or the audit trail. The reward stores a keyed hash for lookup next to the code.

## Data protection

- Entrants are referenced by customer number. Published snapshots use a keyed pseudonymous token per participant and campaign, and entry IDs that do not reveal order numbers.
- Public winner names are masked to the first initial and the state ("A. (TX)"). They are shown only when both `luckyDrawPublishWinners` and the campaign allow it (default off).
- No e-mail address, name, street address or payment data is stored. E-mail addresses are looked up when a message is sent.
- The audit trail redacts sensitive keys. The audit export goes to IMPEX; restrict WebDAV access to it.
- The key `plugin-luckydraw.hmac` lives in the Service Framework credential, not in code or preferences.

## Consumer protection

- Sweepstakes cannot be scheduled without a free method of entry. The campaign page states "No purchase necessary", the minimum age, excluded states, that the odds depend on the number of entries, and that entering does not guarantee a prize. It links the official rules.
- Free entry requires accepting the current rules version (stored with the entry) and confirming the minimum age.
- Potential winners are told that eligibility must be confirmed before a prize is awarded (with `requireWinnerVerification`).
- Customers can leave a campaign at any time.

## Production blockers

All open. Code cannot close them.

1. **Legal approval per campaign.** This covers federal and state sweepstakes, lottery and gambling law (prize, chance and consideration), the official rules (sponsor, eligibility, dates and time zone, free method of entry, odds, prize values, winner selection and notification, publicity, privacy, disputes), the excluded states, and prize registration and bonding where required. Record the reference in the campaign; on production set `luckyDrawLegalApproved`.
2. **Free method of entry equal in dignity.** Legal sets `freeEntryWeight`, the daily limit and the mail-in process, so free entrants have the same chances as purchasers.
3. **Tax and prize administration.** Collect W-9 forms and issue 1099-MISC for prizes worth $600 or more a year, through the verification process.
4. **Winner verification process.** Affidavit, age and residence checks before confirming winners (`requireWinnerVerification` on).
5. **Randomness for high-value prizes.** An external draw service or public beacon (`randomSource = EXTERNAL`) and an independent auditor if required.
6. **Scale.** An external campaign store for draws above `luckyDrawMaxSnapshotEntries` entries, or above custom object quotas.
7. **Headless checkout.** Equivalent coupon owner and expiry checks in the headless basket hooks, if coupons can be redeemed there.
8. **Security review and penetration test** on a sandbox, and the sandbox spikes in [TESTING.md](TESTING.md#sandbox-verification-plan).
