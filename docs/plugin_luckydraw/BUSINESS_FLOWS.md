# Business flows

When `luckyDrawEnabled` is off, every lucky draw page, API and job answers "not available". The coupon checks in cart and checkout stay active.

## 1. Set up a campaign (administrator)

1. Create the reward in Business Manager: a promotion (fixed amount, percentage or free shipping, with any category, minimum basket or maximum discount rule) with a coupon of type system codes (or imported codes) and **redemption limit per code 1**.
2. Create a content asset with the official rules and give it a version, for example `v1`.
3. Get legal approval for the campaign and record its reference.
4. Merchant Tools › Lucky Draw › Campaigns › New campaign. The draft is validated field by field.
5. Open the campaign. **Readiness** lists anything that blocks scheduling:
   - a missing legal reference, or a production instance without `luckyDrawLegalApproved`;
   - a sweepstakes without a free method of entry or without a selection mode;
   - a missing or offline rules asset, or no rules version;
   - countries or time zone not allowed;
   - an end in the past, or too many windows;
   - a draw delay shorter than the hold period;
   - a missing increment;
   - a coupon that is missing, disabled or not single-use.
6. **Schedule.** The rules are now frozen. The campaign becomes ACTIVE at its start time (Status job).

Campaign states:

```
DRAFT -> SCHEDULED -> ACTIVE <-> PAUSED -> COMPLETED
  |          |  \-> DRAFT (before start)
  +----------+------------------+-> CANCELLED (reason required)
```

## 2. Earn entries with a purchase

1. A signed-in customer places an order. The cart and checkout are unchanged.
2. Once the order is paid, the Entries job checks it against the campaign. The order must be:
   - registered, in USD, NEW/OPEN/COMPLETED and PAID;
   - created while the campaign was active and not paused;
   - billed to the US, in a state that is not excluded, by a customer in the customer groups (if any).
   Its eligible merchandise must also reach the minimum. Eligible merchandise is the lines' prorated prices after discounts, without shipping and tax, limited to the eligible categories, without excluded products and bonus items.
3. The number of entries depends on the entry method:
   - PER_ORDER: 1 entry;
   - PER_INCREMENT: 1 entry for each full increment.
   Bonus entries are added for bonus categories, and from the bonus hook if the campaign enables it. The total is capped per order and by the customer's remaining maximum.
4. The entry starts PENDING. After the hold period it becomes ACTIVE, unless the order was cancelled, failed or is no longer paid; then it is CANCELLED and its entries count again toward the customer maximum.
5. The customer gets an "You are in the draw" message (inbox, and e-mail if configured). The message says that entering does not guarantee a prize.

## 3. Enter for free (alternative method of entry)

Sweepstakes require a free method of entry; readiness refuses to schedule without one.

- **Online** (`LuckyDraw-FreeEntry`, or `POST /campaigns/{id}/free-entries`). The signed-in customer must:
  - accept the current rules version;
  - confirm the minimum age;
  - choose a state of residence.
  Each entry counts as `freeEntryWeight` entries. A customer has up to `freeEntriesPerDay` free entries per day in the campaign time zone, and requests are rate-limited.
- **By mail.** Customer service records the entry in Business Manager with the customer number, a unique mail reference and the state (Campaign › Record a mail-in entry).

## 4. The draw

1. When a window opens, the Draw job creates its execution and commits to a secret seed (the seed's hash is visible from then on).
2. After the window ends and the draw delay passes, the next Draw job run:
   - re-validates the entries;
   - freezes the snapshot of entry IDs, pseudonymous participant tokens and chances;
   - draws winners and alternates;
   - creates the rewards;
   - closes the window.
3. Sweepstakes prizes go in tier order to the first picks; one participant wins at most one prize per draw. Winner exclusion rules apply: the maximum wins per participant, and winners of the listed campaigns.
4. With pool scope WINDOW, entries take part only in their own window's draw. With CAMPAIGN (for example a grand prize), every entry made so far stays in the pool until it wins.
5. **Guaranteed mode** has no draw: every eligible entry of the window receives the single prize, once per participant per window.
6. After the draw, the transparency page (`LuckyDraw-Draw`) shows the seed, the hashes and the drawn entry IDs, and offers the snapshot for download.

Execution states: `SCHEDULED -> FROZEN -> SELECTED -> FINALIZED`, `SCHEDULED -> VOID` (no entries), any open phase `-> FAILED -> resume`, `SCHEDULED/FROZEN -> CANCELLED` (campaign cancelled).

Entry states:

```
PENDING -> ACTIVE -> SELECTED -> WINNER
   |          |  \       \-> NOT_SELECTED (unused alternate, window pool)
   |          |   \-> NOT_SELECTED (window closed)
   +----------+-> CANCELLED (order cancelled or refunded, opted out, campaign cancelled)
   +-> INELIGIBLE (customer limit, too late, disqualified)
```

## 5. Winners and rewards

1. **Without verification:** the winner is CONFIRMED at once, and a reward is created.
2. **With verification** (`requireWinnerVerification`):
   - The winner is a *potential* winner. They are told that eligibility must be confirmed first, so nobody is promised a prize too early.
   - Customer service checks eligibility (age, residence, affidavit), then **confirms** or **disqualifies** the winner (Draws and winners › Draw).
3. Disqualification has a reason (at least 10 characters). The best-ranked alternate takes over and the reward is withdrawn. An order refund, chargeback, cancellation or fraud flag reported by the OMS (`POST /order-events`) disqualifies automatically. So does the Verify job when it finds the winning order no longer valid before the reward is issued.
4. The Rewards job takes the next single-use code of the prize's coupon and sets the expiry (`validityDays` after issue). The winner is told that the code is waiting on the lucky draw page; the e-mail does not contain the code.
5. The winner applies the code in the cart. Another account, an expired or withdrawn code, or a code used after placement is refused. When the order is placed, the reward becomes REDEEMED.

Winner states: `ALTERNATE -> PENDING_VERIFICATION | CONFIRMED | UNUSED`, `PENDING_VERIFICATION -> CONFIRMED | DISQUALIFIED`, `CONFIRMED -> DISQUALIFIED`.

Reward states: `PENDING -> ISSUED -> REDEEMED | EXPIRED | REVOKED`, `PENDING -> FAILED -> PENDING (retry) | REVOKED`.

## 6. Leave a campaign

A signed-in customer can leave a campaign (`LuckyDraw-OptOut`). Their entries that have not been drawn are cancelled at once, and the Reconcile job catches any it missed. They receive no new entries.

## 7. What shoppers see

The campaign page shows:

- name, period and time zone, and status;
- "No purchase necessary", the minimum age, excluded states, the odds statement and the official rules link (or the guaranteed-reward statement in guaranteed mode);
- eligibility rules, prizes, the draw schedule, the next draw with a countdown;
- the free entry form;
- their own entries, progress toward the maximum, milestone badges, rewards and coupon status, and a congratulation when they won;
- masked recent winners, when both the site and the campaign publish them;
- draw transparency, and optional eligible-category products.

The overview page lists visible campaigns and the customer's lucky draw messages.

## 8. Fraud and review

| Signal | Effect |
|---|---|
| Duplicate order or slot | Same entry key: nothing new |
| Unpaid, cancelled, failed order | No entry, or entry cancelled |
| Refund, chargeback, fraud (OMS) | Entry cancelled or winner disqualified |
| More than `luckyDrawVelocityMaxEntriesPerDay` entries in 24 hours | Entry flagged (left out of draws) and `SUSPICIOUS_VELOCITY` case; customer service clears or keeps the flag |
| Reward code used by another account | Refused; `COUPON_MISUSE` case |
| Snapshot changed, verification mismatch | Draw stops or `VERIFICATION_MISMATCH` case (critical) |
| Draw error, too many entries, late commitment, coupon issue failure, no alternate | Cases for the draw team |

Cases are worked in Entries and cases › Cases (`OPEN -> IN_PROGRESS -> RESOLVED | DISMISSED`). Every administrator action is in the audit trail with the Business Manager user, and the audit export job archives it.
