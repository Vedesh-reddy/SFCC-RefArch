# Metadata

Everything is in `metadata/plugin_wallet` and imports as one site archive. All files validate against the platform XSDs (see [metadata/plugin_wallet/README.md](../../metadata/plugin_wallet/README.md)). The unit-test harness reads the same files and fails on any write to an undefined or wrongly typed attribute.

## Custom object types

All are site-scoped and not replicable. Keys are generated server-side (`SecureRandom`) unless noted.

| Type | Key | Holds | Changed after creation? |
|---|---|---|---|
| `WalletAccount` | `walletId` (= owner customer number) | status, available/held balance snapshot, entry sequence, lock data, chargeback shortfall, recent sessions (hashed), last activity, revision | yes, only through the ledger and status rules |
| `WalletEntry` | `<walletId>:<sequence>` | one per wallet per journal: deltas and balances after it, order, member, actor | never |
| `WalletJournal` | idempotency key (`TOPUP:…`, `HOLD:…`, `REFUND:…`) | type, amount, balanced postings (JSON), references, reason, actor | never |
| `WalletTopUp` | `TOP-<24 hex>` | amount, status, provider reference, sandbox outcome, attempts, credit and reversal data | status fields |
| `WalletHold` | `HOLD-<24 hex>` | order, amount, captured and refunded cents, member, approval, expiry, status | status fields |
| `WalletMember` | member customer number | owner wallet, status, nickname, limits, allowed categories, approval requirement | yes |
| `WalletInvitation` | `INV-<24 hex>` | owner wallet, e-mail hash, token hash, limits (JSON), status, expiry | status |
| `WalletApproval` | `APR-<24 hex>` | payer, member, basket hash, amount, method (CODE/OWNER), status, expiry | status |
| `WalletAuditEvent` | `AUD-<24 hex>` | entity, action, actor, from/to status, reason, detail | never |
| `WalletNotification` | `WNTF-<24 hex>` | recipient customer number, type, channel, parameters, delivery status | status |
| `WalletCase` | `WCASE-<24 hex>` | case type, severity, status, wallet, entity, dedupe key, detail, notes | yes |
| `WalletOtp` | purpose + subject | keyed hash of salt + code, session hash, expiry, attempts | yes; retention 7 days |
| `WalletJobState` | job ID | cursor JSON | yes |
| `WalletRateBucket` | bucket + window | count | yes; retention 2 days |
| `WalletRequestKey` | `webhook:<event id>`, idempotency keys, daily limit-notice keys | request hash, result | never; removed by `Wallet-Cleanup` after `walletRequestKeyRetentionDays` |

No custom object stores a card number, a code, a token or an e-mail address in clear text.

## System object extensions

| Object | Attributes | Group |
|---|---|---|
| `SitePreferences` | 52 `wallet*` preferences ([CONFIGURATION.md](CONFIGURATION.md)) | PluginWallet |
| `OrderPaymentInstrument` | `walletMode` (OWN/FAMILY), `walletPayerCustomerNo`, `walletRequestedCents`, `walletBasketId`, `walletHoldId` | PluginWallet |

## Payment method and processor

`sites/RefArch_Practice/payment-processors.xml` defines processor `WALLET`; `payment-methods.xml` defines method `WALLET` using it, enabled for USD. The hook names `app.payment.processor.wallet` and `app.payment.form.processor.wallet` follow from the processor ID (lowercase), as SFRA requires.

## Jobs

`jobs.xml`: seven jobs `Wallet-Holds`, `Wallet-TopUps`, `Wallet-Reconcile`, `Wallet-Risk`, `Wallet-Expiry`, `Wallet-Notifications`, `Wallet-Cleanup`, each one step of the matching `custom.Wallet.*` type from `steptypes.json`. All recurring triggers ship **disabled**. Replace `RefArch_Practice` with your site ID.

## Services

`services.xml`: `plugin-wallet.hmac` and `plugin-wallet.webhook`, with credentials and profiles. The credentials ship with empty user and password; enter the secrets in Business Manager.

## Changing the metadata

When you add an attribute or a preference, add it to the XML, validate it with xmllint and re-run the tests. The harness rejects writes to attributes that are not in the metadata, and `integrity.test.js` fails when the code reads a preference that is not in it.
