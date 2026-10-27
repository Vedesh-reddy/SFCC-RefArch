# Architecture

## Components

```
Storefront (SFRA)                     Headless / back office            Business Manager
  Wallet-* (My Account pages)           SCAPI custom API "wallet"         bm_wallet
  Billing panel + Wallet-Apply          SCAPI custom API "wallet-admin"   WalletAdmin-* (4 modules)
  CheckoutServices-PlaceOrder (ext.)    WalletWebhook-Receive (gateway)
  Cart advisor (Wallet-Advisor)
            \                              |                                /
             +---------- scripts/helpers/wallet*Helpers.js ------------------+
                  walletHelpers  walletAccountHelpers  walletTopUpHelpers
                  walletPaymentHelpers  walletFamilyHelpers  walletAdvisorHelpers
                                           |
                           Custom objects Wallet*  (site scope)
                           Jobs Wallet-*  (holds, top-ups, reconcile, expiry, risk,
                                           notifications, cleanup)
```

All code is in `plugin_wallet` and `bm_wallet`, laid out like base SFRA. No file in `app_storefront_base` is changed.

| File | Contents |
|---|---|
| `scripts/helpers/walletHelpers.js` | Shared pieces: on/off and sandbox checks, results, bounded queries, IDs and HMAC, webhook signature, rate limits, status moves, audit, notifications, one-time codes, review cases, cents formatting, API responses, job state |
| `scripts/helpers/walletAccountHelpers.js` | Wallet context and status, spending limits, the double-entry ledger, admin adjustments and transfers, liability, monthly insights |
| `scripts/helpers/walletTopUpHelpers.js` | Gateway (SANDBOX or hook) and top-ups, chargebacks, reconciliation |
| `scripts/helpers/walletPaymentHelpers.js` | Checkout: apply, split, step-up approvals, hold, capture, release, refunds, checkout panel |
| `scripts/helpers/walletFamilyHelpers.js` | Invitations, members, member limits and allowance |
| `scripts/helpers/walletAdvisorHelpers.js` | Free-shipping advisor in the cart |
| `forms/default/walletTopUp.xml`, `walletMember.xml` | SFRA forms for the top-up and family pages |

Helpers return base-style result objects: `{ error: false, ... }` on success, or `{ error: true, errorCode, errorMessage, fields }`. Inside a transaction, the ledger refuses a posting by throwing (`walletHelpers.abort`) so the whole transaction rolls back; the calling helper turns that into a result.

Base behavior is extended with:

| Extension point | How |
|---|---|
| Payment processor `WALLET` | hooks `app.payment.processor.wallet` (Handle, Authorize) and `app.payment.form.processor.wallet` |
| Split payment | `scripts/checkout/checkoutHelpers.js` wraps the base module (`module.superModule`) and replaces `calculatePaymentTransaction` only when a wallet instrument exists |
| Order placement | `CheckoutServices-PlaceOrder` prepend (step-up and limit pre-check) and append (capture or release) |
| Templates | overrides of `account/paymentCard`, `checkout/billing/paymentOptions`, `paymentOptionsSummary`, `checkout/confirmation/confirmationPaymentInfo`, `cart/cartApproachingDiscount`; each override keeps the base markup and adds a remote or local include |
| Login redirect | `config/oAuthRenentryRedirectEndpoints.js` slot 8 → `Wallet-Show` |

## Money model

- All amounts are integer cents in USD (`walletCurrency` accepts only `USD`). `dw.value.Money` is used only at the platform boundary and rounded once.
- A wallet has two balances: **available** (spendable) and **held** (reserved for orders in checkout).

## Double-entry ledger

`walletAccountHelpers.postTransaction` is the only code that changes a balance.

- One **journal** per money movement. Its key is the idempotency key (for example `TOPUP:<topUpId>`, `HOLD:<holdId>`, `REFUND:<refundId>`). Posting the same key again returns the existing journal (`replayed: true`); posting it with different data is a `conflict`.
- The journal carries balanced postings: total debits equal total credits. Wallet accounts are `WALLET:<id>:AVAILABLE` and `WALLET:<id>:HELD`; the other side is a system account.

| Type | Available | Held | Counter account |
|---|---|---|---|
| TOPUP | + | | SYSTEM:TOPUP_CLEARING |
| PURCHASE_HOLD | − | + | (internal move) |
| PURCHASE_CAPTURE | | − | SYSTEM:SALES |
| HOLD_RELEASE | + | − | (internal move) |
| REFUND | + | | SYSTEM:REFUNDS |
| REVERSAL (chargeback) | − | | SYSTEM:CHARGEBACKS |
| ADJUSTMENT (signed) | ± | | SYSTEM:ADJUSTMENTS |
| EXPIRY | − | | SYSTEM:EXPIRY |
| TRANSFER | − source, + target | | (wallet to wallet) |

- One **entry** per affected wallet with the deltas and the balances after it. Journals and entries are never updated or deleted; corrections are new journals.
- `walletAccountHelpers.replayWallet(wallet)` recomputes the balance from the entries; the reconciliation job and the BM wallet page compare it with the snapshot.

### Concurrency

The entry key is `<walletId>:<sequence padded to 12 digits>`, and the next sequence is read from the wallet record in the same transaction. Two concurrent writers to one wallet both try to create the same entry key. The platform's unique key constraint lets one commit; the other transaction fails, rolls back completely (journal, entry and balance), and is reported as `CONFLICT`. A negative balance is refused before the write. Therefore a balance cannot be spent twice.

Spending limits (daily, monthly, family limits) are computed from holds before the hold is written. Two simultaneous checkouts by the same payer can each pass the limit check; the balance itself is still protected. See [Limitations](#limitations).

## Payment lifecycle

```
Billing: Wallet-Apply  ->  basket PI "WALLET" (amount from server: min(balance, total, request, limits))
Submit:  Handle (wallet-only) or calculatePaymentTransaction (wallet + card)
Place:   PlaceOrder prepend: preCheck (approval, limits, categories)
         base: createOrder -> handlePayments -> Authorize -> ledger PURCHASE_HOLD (WalletHold ACTIVE)
         PlaceOrder append: order placed -> PURCHASE_CAPTURE (CAPTURED)
                            order failed  -> HOLD_RELEASE   (RELEASED)
Job:     Wallet-Holds settles holds left behind (placed -> capture, failed/cancelled -> release,
         still CREATED after walletHoldTtlMinutes -> REVIEW case)
```

- The payment instrument stores `walletMode` (OWN/FAMILY), `walletPayerCustomerNo`, `walletRequestedCents`, `walletBasketId` and, after authorization, `walletHoldId`. The amount always comes from the server; no form field sets it.
- Authorize refuses a payer who is not the signed-in customer, a locked or frozen wallet, a revoked or paused member, missing approvals and insufficient funds.
- When the wallet covers the total, `afterPlaceOrder` sets the order payment status to PAID.

## Top-ups

A top-up is a funding transaction, not a basket line, so it never changes merchandise totals, promotions or shipping thresholds.

```
Wallet-TopUp -> WalletTopUp PENDING -> gateway.createPayment -> AWAITING_PAYMENT -> redirect
Return / webhook / reconcile job -> gateway.verifyPayment (server to server)
   CAPTURED with same amount, USD and reference -> TOPUP journal (once) -> CREDITED
   FAILED -> FAILED;  mismatch -> GATEWAY_MISMATCH case, stays AWAITING_PAYMENT
Chargeback -> REVERSAL of what is still available, shortfall recorded, wallet LOCKED
```

`walletTopUpHelpers` selects SANDBOX or EXTERNAL. SANDBOX stores the simulated outcome server-side and refuses to run on a production instance. EXTERNAL calls the `app.plugin.wallet.gateway` hook and also needs `walletLiveMoneyApproved = true`.

## Family wallet

The owner invites by e-mail. The invitation stores only hashes of the token and the e-mail address. The invitee signs in with that address, confirms with a code, and becomes a `WalletMember` (key: member customer number, so a customer is a member of at most one wallet). Member payments are holds on the owner's wallet tagged with `memberCustomerNo`, which drives the member limits and the owner's notifications.

## Shipping advisor and benefit

- The cart advisor uses `dw.campaign.PromotionMgr.getDiscounts(basket).getApproachingShippingDiscounts()`, so the threshold always matches the live shipping promotion. Suggestions are products in `walletAdvisorCategoryId` priced within `walletAdvisorPriceBandPercent` of the gap, plus recommended accessories of the basket products.
- The optional shipping benefit sets `session.custom.walletShippingBenefit` when the wallet pays at least `walletShippingBenefitMinShareBps` of the order. A merchant builds a customer group on that session attribute and a shipping promotion for it. The plugin grants no discount itself.

## Jobs

All steps are `transactional="false"`, take `MaxItems`, are idempotent, and return `DISABLED` when the wallet is off. Each record is changed in its own transaction.

| Step | Work |
|---|---|
| `custom.Wallet.Holds` | Settle holds by order status; expire approvals and invitations |
| `custom.Wallet.TopUps` | Verify open top-ups with the gateway; expire stale ones |
| `custom.Wallet.Reconcile` | Replay wallets against snapshots (cursor in `WalletJobState`); check recent journals balance; compare captured holds with order payment amounts; open `RECONCILIATION_MISMATCH` cases |
| `custom.Wallet.Expiry` | Expire balances of inactive wallets (off unless `walletFundsExpiryDays` ≥ 1825) |
| `custom.Wallet.Risk` | Open `REFUND_ABUSE` cases for wallets with `walletRefundAbuseCount` refunds within `walletRefundAbuseWindowDays` (failed codes are flagged at once, when they lock the wallet) |
| `custom.Wallet.Notifications` | Send queued e-mails with backoff |
| `custom.Wallet.Cleanup` | Delete expired rate buckets, old request keys and used codes |

## Logging

`Logger.getLogger('plugin-wallet', <category>)` with categories `wallet-transaction`, `wallet-gateway`, `wallet-security`, `wallet-notifications`, `wallet-advisor`, `wallet-jobs`, `wallet-api` and `wallet-admin`. A custom log file `plugin-wallet` collects them. No codes, tokens, secrets or e-mail addresses are logged.

## Limitations

- **SFRA checkout only.** Wallet payment relies on SFRA `handlePayments` and the PlaceOrder extension. Headless checkout through SCAPI needs a separate integration (for example `dw.ocapi.shop.order.afterPOST` hooks); the `wallet` Custom API covers balance, history, top-ups and family, not order payment.
- **Limits under concurrency**: spending limits are not serialized across simultaneous checkouts of the same payer. The balance is.
- **Category restriction** for members is checked in the PlaceOrder pre-check, not again inside Authorize.
- `request.custom` carries the hold IDs from Authorize to the PlaceOrder append; verify on the sandbox (spike W3).
