# Configuration

All settings are site preferences in the group **PluginWallet** (Merchant Tools › Site Preferences › Custom Preferences). Nothing business-related is hardcoded. Amounts are integer **cents** (USD).

The code reads them directly with `Site.getCurrent().getCustomPreferenceValue()`, as base SFRA does. Defaults and integer ranges are part of the metadata (`default-value`, `min-value`, `max-value`): Business Manager applies the default when a value is not set and refuses values outside the range. Security switches fail closed: a code is skipped only when `walletFamilyRequireCode` is explicitly `false`, and EXTERNAL mode needs `walletLiveMoneyApproved = true`. Business Manager › Wallet › Overview lists missing required values and the combinations that the metadata cannot check (minimum above maximum top-up, EXTERNAL without approval, a funds expiry below five years).

## Activation

The wallet is active only when all of these are true:

- `walletEnabled` is true;
- `walletCurrency` is `USD`, and the site's default currency is USD;

Top-ups additionally need:

- SANDBOX mode on a non-production instance, or
- EXTERNAL mode with `walletLiveMoneyApproved = true`.

## General and gateway

| Preference | Type | Default | Range / values | Purpose |
|---|---|---|---|---|
| `walletEnabled` | boolean | false | | Master switch |
| `walletCurrency` | string | (none, required) | `USD` | Wallet currency; anything else disables the wallet |
| `walletPaymentMethodId` | string | `WALLET` | | Payment method ID of the wallet (must match the imported method) |
| `walletGatewayMode` | enum | `SANDBOX` | SANDBOX, EXTERNAL | Sandbox gateway ("Not for Live Money") or the `app.plugin.wallet.gateway` hook |
| `walletLiveMoneyApproved` | boolean | false | | Set only after the legal, finance and provider sign-off in [SECURITY.md](SECURITY.md#production-blockers). EXTERNAL mode stays closed without it |

## Top-ups and balance

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletTopUpMinimumCents` | int | 500 | 100–100000000 | Smallest top-up |
| `walletTopUpMaximumCents` | int | 50000 | 100–100000000 | Largest top-up (must be ≥ minimum) |
| `walletSuggestedTopUpCents` | set of string | (empty: custom amount only) | cents | Amount buttons on the dashboard; the sandbox values are 1000, 2500, 5000, 10000 |
| `walletMaximumBalanceCents` | int | 100000 | 100–100000000 | Balance plus pending top-ups may not exceed this |
| `walletTopUpDailyCountLimit` | int | 5 | 1–50 | Top-ups per wallet per day; reaching it opens a `TOPUP_VELOCITY` case |
| `walletTopUpDailyAmountCents` | int | 100000 | 100–100000000 | Top-up amount per wallet per day |
| `walletTopUpPendingMinutes` | int | 60 | 5–1440 | An unpaid top-up expires after this |

## Spending and holds

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletMaxTransactionCents` | int | 50000 | 100–100000000 | Largest wallet amount per order |
| `walletDailySpendLimitCents` | int | 100000 | 100–100000000 | Wallet spending per day (holds included) |
| `walletMonthlySpendLimitCents` | int | 500000 | 100–100000000 | Wallet spending per calendar month (UTC) |
| `walletHoldTtlMinutes` | int | 60 | 10–1440 | A hold of an order still in CREATED after this goes to review |

## Security

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletStepUpThresholdCents` | int | 0 | 0–100000000 | Payments at or above this need an e-mailed code. 0 = every payment |
| `walletRecentSessionsTracked` | int | 5 | 1–20 | Sessions remembered as "has paid before"; other sessions need a code |
| `walletLockAfterLockedCodes` | int | 2 | 1–10 | Codes locked by wrong attempts before the wallet locks itself |
| `walletOtpLength` | int | 6 | 6–8 | Code digits |
| `walletOtpTtlMinutes` | int | 10 | 2–60 | Code validity |
| `walletOtpMaxAttempts` | int | 5 | 1–10 | Wrong attempts before a code is locked |
| `walletOtpResendCooldownSeconds` | int | 60 | 30–3600 | Wait before a new code |
| `walletOtpMaxSendsPerHour` | int | 5 | 1–20 | Codes per purpose and customer per hour |
| `walletWriteRateLimitPerHour` | int | 60 | 1–10000 | Top-ups started and invitations sent per wallet per hour (storefront and API) |
| `walletWebhookToleranceSeconds` | int | 300 | 60–900 | Maximum age of a signed webhook |

## Family wallet

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletFamilyEnabled` | boolean | false | | Allow family members |
| `walletFamilyMaxMembers` | int | 5 | 1–20 | Members and open invitations per wallet |
| `walletFamilyRequireCode` | boolean | true | | Members confirm each payment with a code (unless the owner approves instead) |
| `walletFamilyDefaultDailyLimitCents` | int | 5000 | 0–100000000 | Default member limit per day |
| `walletFamilyDefaultMonthlyLimitCents` | int | 20000 | 0–100000000 | Default member limit per month |
| `walletFamilyDefaultPerOrderLimitCents` | int | 5000 | 0–100000000 | Default member limit per order |
| `walletInvitationTtlHours` | int | 72 | 1–720 | Invitation validity |
| `walletApprovalTtlMinutes` | int | 30 | 5–1440 | Validity of an owner approval or a verified code |

## Refunds, adjustments and expiry

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletCardRefundToWalletAllowed` | boolean | false | | Allow STORE_CREDIT refunds (card refunds credited to the wallet) |
| `walletRefundAbuseCount` | int | 5 | 1–100 | Refunds within the window that open a `REFUND_ABUSE` case |
| `walletRefundAbuseWindowDays` | int | 30 | 1–365 | Window for the refund count |
| `walletAdjustmentMaxCents` | int | 50000 | 1–100000000 | Largest manual adjustment per action |
| `walletFundsExpiryDays` | int | 0 | 0, or 1825–3650 | Days of inactivity after which the balance expires. 0 = never. With a value below five years the expiry job does nothing and logs an error (US gift-card rules). Keep 0 until legal approves |

## Shipping benefit and advisor

| Preference | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `walletShippingBenefitEnabled` | boolean | false | | Set `session.custom.walletShippingBenefit` for a merchant customer-group shipping promotion |
| `walletShippingBenefitMinShareBps` | int | 10000 | 1–10000 | Wallet share of the order (basis points) needed for the flag. 10000 = wallet pays all |
| `walletAdvisorEnabled` | boolean | true | | Show the free-shipping advisor in the cart |
| `walletAdvisorCategoryId` | string | `root` | | Category searched for items around the gap |
| `walletAdvisorMaxSuggestions` | int | 4 | 1–12 | Items shown |
| `walletAdvisorPriceBandPercent` | int | 25 | 0–100 | Price band around the gap |

## Notifications, paging and retention

| Preference | Type | Default | Range / values | Purpose |
|---|---|---|---|---|
| `walletNotificationChannels` | set of string | (empty: INBOX) | INBOX, EMAIL | Shopper channels |
| `walletNotificationMaxAttempts` | int | 5 | 1–20 | E-mail delivery attempts |
| `walletFromEmail` | string | (none) | | Sender address; e-mails are not sent without it |
| `walletAdminNotificationEmails` | set of string | (empty) | | Recipients of case alerts |
| `walletHistoryPageSize` | int | 20 | 5–100 | Rows per history page |
| `walletApiMaxPageSize` | int | 50 | 1–200 | Largest `limit` in the Custom APIs |
| `walletRequestKeyRetentionDays` | int | 30 | 1–365 | How long idempotency and webhook keys are kept |

## Sandbox values

`metadata/plugin_wallet/sites/RefArch_Practice/preferences.xml` sets: `walletEnabled=true`, `walletCurrency=USD`, `walletGatewayMode=SANDBOX`, `walletLiveMoneyApproved=false`, `walletSuggestedTopUpCents`, `walletFamilyEnabled=true`, `walletStepUpThresholdCents=20000`, both notification channels, and example e-mail addresses. Review them before import.

## Services

| Service | Use | Configure |
|---|---|---|
| `plugin-wallet.hmac` | Key for hashing codes, tokens and e-mail addresses | Password: random, at least 32 characters. Changing it invalidates open codes and invitations |
| `plugin-wallet.webhook` | Webhook signature secret, shared with the gateway | Password: the secret from the provider |

These are local key holders, not HTTP calls. No secret is in code, preferences or the import files.

## Jobs

`metadata/plugin_wallet/jobs.xml` imports seven jobs with disabled schedules. Enable them after the smoke test.

| Job | Imported interval | MaxItems |
|---|---|---|
| `Wallet-Holds` | 5 minutes | 500 |
| `Wallet-TopUps` | 10 minutes | 200 |
| `Wallet-Reconcile` | daily | 200 |
| `Wallet-Risk` | daily | 5000 |
| `Wallet-Expiry` | daily | 100 |
| `Wallet-Notifications` | 5 minutes | 500 |
| `Wallet-Cleanup` | daily | 1000 |

Change the interval and `MaxItems` in Business Manager to fit your volume.

## Custom log file

Create a custom log file for the prefix `plugin-wallet` (Administration › Operations › Custom Log Settings) and set the levels per category (`wallet-transaction`, `wallet-gateway`, `wallet-security`, …).
