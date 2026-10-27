# API reference

## Storefront controllers

All `Wallet-*` routes use HTTPS and require a signed-in registered customer (`requireLogin` redirects to login, then back through slot 8 of `oAuthRenentryRedirectEndpoints`). Every POST validates the CSRF token. The wallet is always the signed-in customer's own; no route accepts a wallet or customer ID.

### My Account

| Route | Method | Purpose |
|---|---|---|
| `Wallet-Show` | GET | Creates the wallet on the first visit. Dashboard: balance, top-up form, recent activity and top-ups, monthly summary, family, security, notifications |
| `Wallet-History` | GET | Paged activity (`page`) |
| `Wallet-TopUp` | POST | Start a top-up (`amount` or `customAmount`, USD) and redirect to the gateway |
| `Wallet-SandboxPay` | GET | Sandbox payment page (`id`); only in SANDBOX mode |
| `Wallet-SandboxComplete` | POST | Sandbox outcome (`id`, `outcome` APPROVED/DECLINED) |
| `Wallet-TopUpReturn` | GET | Return from the gateway (`id`); verifies with the gateway |
| `Wallet-Invite` | POST | Invite a family member (`email`, `nickname`, limits in USD) |
| `Wallet-UpdateMember` | POST | Change member limits, categories, approval requirement |
| `Wallet-MemberStatus` | POST | `action` = freeze, activate, revoke |
| `Wallet-ApprovalDecision` | POST | Owner approves or declines a member payment |
| `Wallet-Invitation` | GET | Invitation page (`token`) |
| `Wallet-InvitationCode` | POST | Send the acceptance code |
| `Wallet-AcceptInvitation` | POST | Accept with `token` and `code` |
| `Wallet-DeclineInvitation` | POST | Decline |
| `Wallet-Lock` | POST | Lock the wallet |
| `Wallet-UnlockCode` | POST | Send an unlock code (owner locks only) |
| `Wallet-Unlock` | POST | Unlock with the code |
| `Wallet-Notifications` | GET | Inbox |
| `Wallet-MarkRead` | POST | Mark a notification read |
| `Wallet-AccountCard` | GET | Remote include for the account overview card |

### Checkout (AJAX, JSON, CSRF via `validateAjaxRequest`)

| Route | Purpose | Answer |
|---|---|---|
| `Wallet-Apply` | Apply the wallet (`mode` OWN/FAMILY, optional `amount`) | `{success, walletCents, remainingCents, walletFormatted, remainingFormatted, coversTotal, requirement: NONE/CODE/OWNER, approved}` |
| `Wallet-Remove` | Remove the wallet instrument | `{success, …amounts}` |
| `Wallet-PaymentCode` | E-mail a step-up code for the current basket and amount | `{success, sent}` |
| `Wallet-VerifyPaymentCode` | Verify the code (`code`) | `{success, approved}` |
| `Wallet-RequestApproval` | Member asks the owner | `{success, requested}` |

Errors answer `{success: false, error: <errorCode>, message}` (HTTP 401 when signed out, else 400); the codes are in the table below.

### Cart

`Wallet-Advisor` (GET, remote include in `cart/cartApproachingDiscount.isml`): free-shipping advisor. Renders nothing when the advisor is off or no shipping promotion is approaching.

### Extended base routes

`CheckoutServices-PlaceOrder`: a prepend runs the wallet pre-check (approval, limits, categories) and answers the SFRA error JSON when it fails; an append captures or releases the holds placed during this request.

## Webhook

`WalletWebhook-Receive` (POST, HTTPS, no session, no CSRF). Only in EXTERNAL mode.

```
POST /on/demandware.store/Sites-<site>-Site/default/WalletWebhook-Receive
x-wallet-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the plugin-wallet.webhook secret>

{"id": "evt_...", "type": "payment.updated" | "chargeback.created",
 "data": {"topUpId": "TOP-...", "reference": "<provider reference>", "amountCents": 4000}}
```

| Answer | Meaning |
|---|---|
| 200 `accepted` | Processed |
| 200 `duplicate` | Event ID seen before |
| 400 `invalid-event` / `unknown-type` | Bad body |
| 401 `invalid-signature` | Signature wrong, missing or older than `walletWebhookToleranceSeconds` |
| 409 `conflict` | Reference does not match the top-up |
| 503 `disabled` | Wallet off or not in EXTERNAL mode |

`payment.updated` never credits by itself: the plugin calls `verifyPayment` on the gateway and credits only a verified capture.

## Gateway hook

An integration cartridge implements `app.plugin.wallet.gateway` (register it in its `hooks.json`) for a licensed provider:

| Function | Input | Must return |
|---|---|---|
| `createPayment(topUp)` | `{topUpId, amountCents, currency: 'USD', returnUrl}` | `{status: 'REDIRECT', redirectUrl: <https URL>, reference}` |
| `verifyPayment(topUp)` | `{topUpId, amountCents, currency, reference}` | `{status: 'CAPTURED' \| 'PENDING' \| 'FAILED', amountCents, currency, reference}`, read from the provider server to server |

A missing hook or an exception fails closed: the top-up is FAILED (create) or stays AWAITING_PAYMENT (verify) and nothing is credited.

## Custom SCAPI: `wallet` (Shopper)

Base: `https://{shortCode}.api.commercecloud.salesforce.com/custom/wallet/v1/organizations/{organizationId}`. Every call needs `siteId` and a registered-shopper SLAS token with scope `c_wallet`. The wallet is the token customer's.

| Method | Path | Operation | Notes |
|---|---|---|---|
| GET | `/me` | getWallet | Balance, status, insights. `status: NONE` when there is no wallet yet (GET never creates one) |
| GET | `/me/transactions` | listTransactions | `c_type`, `c_offset`, `c_limit` |
| POST | `/me/top-ups` | createTopUp | Body `{amount: "25.00"}`; 201 `{topUpId, redirectUrl}` |
| GET | `/me/top-ups/{topUpId}` | getTopUp | 404 for another customer's top-up |
| POST | `/me/top-ups/{topUpId}/verify` | verifyTopUp | Asks the gateway; may credit (POST because GET cannot commit) |
| GET | `/me/family` | getFamily | Members and pending approvals |
| POST | `/me/family/invitations` | createInvitation | `{email, nickname, perOrderLimit, dailyLimit, monthlyLimit, allowedCategoryIds, requireOwnerApproval}`; limits in dollars |
| PATCH | `/me/family/members/{customerNo}` | updateMember | The same limit fields (dollars); optional `revision` for optimistic locking |
| PUT | `/me/family/members/{customerNo}/status` | setMemberStatus | `{status: ACTIVE \| FROZEN \| REVOKED}` |
| POST | `/me/approvals/{approvalId}/decision` | decideApproval | `{decision: APPROVED \| DECLINED}` |
| GET | `/me/allowance` | getAllowance | For a family member: remaining limits only |

## Custom SCAPI: `wallet-admin` (Admin)

Account Manager client token with scope `c_wallet_admin`; `siteId` required. Every action is audited as `ADMIN/admin-api`.

| Method | Path | Operation | Body / query |
|---|---|---|---|
| POST | `/refunds` | postRefund | `{refundId, holdId, amountCents}` (WALLET_PORTION), or `{refundId, kind: 'STORE_CREDIT', walletId, amountCents}`. Idempotent by `refundId` |
| POST | `/chargebacks` | postChargeback | `{topUpId, amountCents, reference}` |
| GET | `/wallets/{customerNo}` | getWallet | |
| PUT | `/wallets/{customerNo}/status` | setWalletStatus | `{status, reason}` |
| GET | `/holds` | listHolds | `c_status`, `c_offset`, `c_limit` |

## Errors

Custom APIs answer RFC 9457 problem details: `type` is `wallet-<errorCode>`, `detail` is the localized message, and safe details (field problems, limit names) are in the custom property `fields`. Unknown errors are 500 without internals. Storefront pages use the same codes; their messages are the `error.<errorCode>` keys in `wallet.properties`.

| `errorCode` | HTTP | Meaning |
|---|---|---|
| `invalid` | 400 | Invalid input (`fields`) |
| `code-invalid`, `code-expired`, `code-locked`, `code-missing` | 400 | One-time code problems |
| `unauthenticated` | 401 | No registered customer |
| `forbidden` | 403 | Not allowed (support-only unlock, store credit off, not a member) |
| `not-found` | 404 | Missing or not yours |
| `conflict` | 409 | Concurrent change or idempotency key reused with other data |
| `stale` | 409 | Revision changed |
| `not-allowed-now` | 409 | Status change not allowed |
| `limit-reached` | 422 | Spending, top-up or member limit (`fields.limit`) |
| `insufficient-funds` | 422 | Balance too low |
| `locked` | 423 | Wallet locked |
| `rate-limited` | 429 | Too many requests |
| `disabled` | 503 | Wallet off |
| `unavailable` | 503 | Gateway or e-mail unavailable |

Checkout answers (`Wallet-Apply` and the PlaceOrder check) can also return `approval-required` and `payer-changed`.
