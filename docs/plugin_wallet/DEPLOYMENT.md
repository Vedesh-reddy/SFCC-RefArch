# Deployment

The plugin is independent of the other plugins in this repository. It needs only `app_storefront_base` (SFRA 7+), and it does not change any base file. Do not deploy to a production instance: the sandbox gateway refuses to run there, and the production blockers in [SECURITY.md](SECURITY.md#production-blockers) are open.

## 1. Build and upload

```bash
npm install
npx sgmf-scripts --compile js --cartridgeName plugin_wallet
npx sgmf-scripts --compile css --cartridgeName plugin_wallet
npx sgmf-scripts --uploadCartridge plugin_wallet
npx sgmf-scripts --uploadCartridge bm_wallet
```

`client/default/js/wallet-checkout.js` and `client/default/scss/wallet.scss` compile to `static/default/js/wallet-checkout.js` and `static/default/css/wallet.css`.

## 2. Cartridge paths

| Site | Path |
|---|---|
| Storefront (e.g. `RefArch`) | `plugin_wallet:<other plugins>:app_storefront_base` |
| Business Manager | `bm_wallet:plugin_wallet` (prepend to the existing BM path) |

`plugin_wallet` overrides these templates: `account/header` and `account/mobileHeader` (the wallet balance in the header, filled by an `Account-Header` append), `account/paymentCard`, `checkout/billing/paymentOptions`, `checkout/billing/paymentOptions/paymentOptionsSummary`, `checkout/confirmation/confirmationPaymentInfo`, `cart/cartApproachingDiscount`. If another cartridge left of it overrides one of them, merge the wallet include into that override. It also wraps `scripts/checkout/checkoutHelpers` with `module.superModule`, so other cartridges that wrap the same module keep working when they also use `superModule`.

Re-activate the code version after the first deployment and after any `schema.yaml` or `api.json` change, so the Custom APIs register.

## 3. Import metadata

1. Rename `metadata/plugin_wallet/sites/RefArch_Practice` to your site ID.
2. Replace `RefArch_Practice` in `jobs.xml`.
3. Review the sandbox values in `preferences.xml` (sender address, notification channels, step-up threshold).
4. Import:

```bash
npx @salesforce/b2c-cli job import ./metadata/plugin_wallet
```

This creates the custom object types, preferences, the `WALLET` payment method and processor, jobs and services.

## 4. Business Manager configuration

1. **Services:** set the passwords of `plugin-wallet.hmac` (random, at least 32 characters) and `plugin-wallet.webhook` (EXTERNAL mode only: the provider's webhook secret).
2. **Payment method:** Merchant Tools › Ordering › Payment Methods: check that `WALLET` is enabled for USD and uses processor `WALLET`.
3. **Roles:** Administration › Organization › Roles › Business Manager Modules. Grant the Smart Wallet modules per team: Overview, Wallets, Cases, Audit trail.
4. **Logging:** create a custom log file for `plugin-wallet` (Administration › Operations › Custom Log Settings).
5. **Jobs:** enable the seven `Wallet-*` schedules after the smoke test (see [CONFIGURATION.md](CONFIGURATION.md#jobs)).
6. **Custom APIs:** add scope `c_wallet` to the SLAS client of a headless storefront, and create an Account Manager API client with `c_wallet_admin` for the OMS.
7. **Shipping benefit (optional):** create a dynamic customer group on `session.custom.walletShippingBenefit = true` and a shipping promotion for it, then set `walletShippingBenefitEnabled`.
8. **Gateway (later):** for EXTERNAL mode, deploy the integration cartridge with `app.plugin.wallet.gateway` left of `plugin_wallet`, give the provider the webhook URL `https://<host>/on/demandware.store/Sites-<site>-Site/default/WalletWebhook-Receive`, and set `walletGatewayMode = EXTERNAL`. Top-ups stay closed until `walletLiveMoneyApproved` is set after sign-off.

## 5. Enable

Set `walletEnabled = true` and `walletCurrency = USD` (the site's default currency must be USD). Check Smart Wallet › Overview: it must show "Preference problems: none" and the sandbox notice.

## 6. Smoke test

Run the sandbox plan in [TESTING.md](TESTING.md#sandbox-verification-plan).
