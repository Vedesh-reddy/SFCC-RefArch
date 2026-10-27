# Business flows

All flows need a registered, signed-in customer. When `walletEnabled` is off, every wallet page, API and job answers "not available", and checkout offers no wallet.

## 1. Open a wallet and add money

1. The shopper opens My Account › Wallet (`Wallet-Show`), which creates an empty wallet on the first visit. Through the Shopper API, the wallet is created by the first write (`POST /me/top-ups`); `GET /me` never creates one.
2. They choose a suggested amount (`walletSuggestedTopUpCents`) or enter one.
3. The server checks:
   - the amount is between `walletTopUpMinimumCents` and `walletTopUpMaximumCents`;
   - balance + pending top-ups + amount stays at or below `walletMaximumBalanceCents`;
   - the daily count (`walletTopUpDailyCountLimit`) and amount (`walletTopUpDailyAmountCents`) are not exceeded. Hitting the count opens a `TOPUP_VELOCITY` case.
4. A `WalletTopUp` is created and the gateway is asked for a payment. The shopper is redirected to the gateway (sandbox page in SANDBOX mode, clearly labelled "Not for Live Money").
5. On return, webhook or the `Wallet-TopUps` job, the plugin asks the gateway for the verified state. Only a CAPTURED payment with the same amount, USD and reference credits the wallet, exactly once.
6. The shopper gets a `TOPUP_SUCCEEDED` (or `TOPUP_FAILED`) notification.

Top-up states:

```
PENDING -> AWAITING_PAYMENT -> CREDITED -> REVERSED
   |             |  \-> FAILED
   v             \---> EXPIRED -> CREDITED (late capture found by reconciliation)
 FAILED
```

## 2. Pay with the wallet

1. On the billing step, the wallet panel shows the balance (owner) or the remaining allowance (family member), with a "Sandbox - Not for Live Money" badge in SANDBOX mode.
2. **Use wallet** (`Wallet-Apply`) adds a `WALLET` payment instrument. Its amount is computed on the server: the smallest of the balance, the order total, the requested amount and the spending limits (`walletMaxTransactionCents`, `walletDailySpendLimitCents`, `walletMonthlySpendLimitCents`; member limits for a family member). Reaching a limit sends a `LIMIT_REACHED` notification (once a day).
3. **Step-up**: a code is required when the amount is at least `walletStepUpThresholdCents` (0 = always), or when the session has not paid with this wallet before. The code is e-mailed (`Wallet-PaymentCode`), bound to the payer, basket and amount, and used once.
4. If the wallet covers the total, the shopper submits with the wallet only. Otherwise they also enter a card; the card gets the rest.
5. **Place order**: the pre-check re-validates approval, limits and member categories. Authorize places a hold (available → held). After the order is placed the hold is captured; if placement fails it is released.
6. The owner gets `WALLET_PAYMENT` (or `FAMILY_PAYMENT_MADE` for a member payment, and the member gets `WALLET_PAYMENT`). The `Wallet-Holds` job sends these for holds captured since its last run, not place-order itself, because a storefront request may create at most 10 custom objects and place-order already writes the ledger.

Hold states: `ACTIVE -> CAPTURED | RELEASED | REVIEW`, `REVIEW -> CAPTURED | RELEASED`. A captured hold is never released.

## 3. Family wallet

1. The owner enables a member (`Wallet-Invite`): e-mail, nickname, per-order, daily and monthly limits (defaults `walletFamily*LimitCents`), up to `walletFamilyMaxMembers`. Self-invitations are refused.
2. The invitee gets an e-mail link valid for `walletInvitationTtlHours`. They must sign in with the invited e-mail address, request a code and accept. A customer can be a member of one wallet only.
3. The owner can change limits, restrict categories, require approval of each payment, pause (`FROZEN`), resume or remove (`REVOKED`) a member. Pausing or removing takes effect on the next authorization and expires open approvals.
4. A member pays like an owner, from the owner's balance, within their limits. They see only their remaining allowance. If the owner requires approval, the member asks (`Wallet-RequestApproval`), the owner approves or declines in the wallet dashboard (`FAMILY_PAYMENT_REQUEST` notification), and the approval is valid for `walletApprovalTtlMinutes` for that basket and amount only.

Member states:

```
INVITED -> ACTIVE <-> FROZEN
   |         \-> REVOKED -> ACTIVE (new invitation)
   +-> DECLINED | EXPIRED
```

Approval states: `PENDING -> APPROVED | DECLINED | EXPIRED`, `APPROVED -> USED | EXPIRED`.

## 4. Lock and unlock

- The owner can lock the wallet at once (`Wallet-Lock`). Nobody can pay with it while it is locked.
- The owner can lift their own lock with an e-mailed code (`Wallet-UnlockCode`, `Wallet-Unlock`).
- After `walletLockAfterLockedCodes` codes were locked by wrong attempts, the wallet locks itself and a `FAILED_CODES` case is opened. A chargeback also locks the wallet. These locks need customer service.
- Customer service can freeze a wallet. Only customer service can unfreeze it.

Wallet states: `ACTIVE <-> LOCKED`, `ACTIVE | LOCKED -> FROZEN -> ACTIVE`, any → `CLOSED` (final).

## 5. Refunds

Called by the OMS through `wallet-admin` `POST /refunds`, or by customer service in Business Manager.

- **WALLET_PORTION**: refunds up to the captured, not yet refunded amount of a hold, back to the wallet.
- **STORE_CREDIT**: credits a wallet for a refund of a card payment. Allowed only when `walletCardRefundToWalletAllowed` is on.
- Each refund has a `refundId`; repeating it returns the first result. `walletRefundAbuseCount` refunds within `walletRefundAbuseWindowDays` open a `REFUND_ABUSE` case.

## 6. Chargebacks of top-ups

The gateway webhook (`chargeback.created`) or `wallet-admin` `POST /chargebacks` reverses the top-up. What is still available is debited; the rest is recorded as `shortfallCents` with a `CHARGEBACK_SHORTFALL` case, and the wallet is locked.

## 7. Customer service (Business Manager)

Merchant Tools › Smart Wallet:

| Module | What it does |
|---|---|
| Overview | Mode (sandbox or external), preference problems, total customer liability (available + held), open cases |
| Wallets | Search wallets; view balances, ledger replay result, holds, top-ups and activity; change status; post an adjustment (reason ≥ 10 characters, at most `walletAdjustmentMaxCents`); refund; reverse a top-up |
| Cases | Work security and finance cases (`OPEN -> IN_PROGRESS -> RESOLVED | DISMISSED`) with notes |
| Audit trail | Search the append-only audit events |

Every action is audited with the Business Manager user.

## 8. Shipping advisor

The cart shows "You are $X away from free shipping" from the live shipping promotion, a note that wallet top-ups do not count, items priced around the gap and recommended accessories. It is turned off with `walletAdvisorEnabled`.

## 9. Notifications

Inbox messages appear in My Account › Wallet › Notifications at once. E-mail copies (`walletNotificationChannels` contains `EMAIL`) are sent by the `Wallet-Notifications` job with retries; the address is looked up when sending, so records hold no e-mail address. Types: `TOPUP_SUCCEEDED`, `TOPUP_FAILED`, `TOPUP_REVERSED`, `WALLET_PAYMENT`, `FAMILY_PAYMENT_MADE`, `REFUND_CREDITED`, `FAMILY_JOINED`, `FAMILY_DECLINED`, `FAMILY_PAYMENT_REQUEST`, `FAMILY_PAYMENT_APPROVED`, `FAMILY_PAYMENT_DECLINED`, `FAMILY_ACCESS_CHANGED`, `FAMILY_REACTIVATED`, `WALLET_LOCKED`, `WALLET_UNLOCKED`, `FUNDS_EXPIRED`, `LIMIT_REACHED`, `WALLET_ADJUSTED`.
