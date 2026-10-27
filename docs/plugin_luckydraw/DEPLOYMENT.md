# Deployment

The plugin is independent of the other plugins in this repository. It needs only `app_storefront_base` (SFRA 7+) and changes no base file. Do not schedule campaigns on production before the legal sign-off described in [SECURITY.md](SECURITY.md#production-blockers).

## 1. Build and upload

```bash
npm install
npx sgmf-scripts --compile js --cartridgeName plugin_luckydraw
npx sgmf-scripts --compile css --cartridgeName plugin_luckydraw
npx sgmf-scripts --uploadCartridge plugin_luckydraw
npx sgmf-scripts --uploadCartridge bm_luckydraw
```

`client/default/js/luckydraw-countdown.js` and `client/default/scss/luckydraw.scss` compile to `static/default/js/luckydraw-countdown.js` and `static/default/css/luckydraw.css`.

## 2. Cartridge paths

| Site | Path |
|---|---|
| Storefront (e.g. `RefArch`) | `plugin_luckydraw:<other plugins>:app_storefront_base` |
| Business Manager | `bm_luckydraw:plugin_luckydraw` (prepend to the existing BM path) |

`plugin_luckydraw` extends `Cart` and `CheckoutServices` with `module.superModule`, so it combines with other plugins that extend the same controllers (for example `plugin_wallet`). It overrides no template.

Re-activate the code version after the first deployment and after any `schema.yaml` or `api.json` change, so the Custom APIs register.

## 3. Import metadata

1. Rename `metadata/plugin_luckydraw/sites/RefArch_Practice` to your site ID.
2. Replace `RefArch_Practice` in `jobs.xml`.
3. Review `preferences.xml` (sender, notification channels).
4. Import:

```bash
npx @salesforce/b2c-cli job import ./metadata/plugin_luckydraw
```

## 4. Business Manager configuration

1. **Service:** set the password of `plugin-luckydraw.hmac` to a random value of at least 32 characters. Do not change it later: entry deduplication and coupon lookups depend on it.
2. **Reward promotion:** Merchant Tools › Online Marketing:
   - create a coupon of type **system codes** (or import a list of strong codes);
   - set **redemption limit per code: 1**;
   - create a promotion using the coupon (amount or percentage off, free shipping, category and basket conditions, maximum discount);
   - make the promotion end no earlier than the campaign end plus the code validity.
3. **Official rules:** create an online content asset with the legally approved rules, and note its version.
4. **Roles:** Administration › Organization › Roles › Business Manager Modules. Grant the Lucky Draw modules to separate teams: Overview, Campaigns, Draws and winners, Entries and cases, Audit trail.
5. **WebDAV:** restrict access to `IMPEX/src/plugin-luckydraw` (snapshots and audit exports).
6. **Logging:** create a custom log file for `plugin-luckydraw`.
7. **Custom APIs:** add scope `c_luckydraw` to the storefront SLAS client. Create an Account Manager API client with `c_luckydraw_admin` for the OMS (order events) and auditors.
8. **Navigation:** link `LuckyDraw-Show` from a content slot, a folder or the main menu.
9. **Jobs:** enable the nine `LuckyDraw-*` schedules after the smoke test (see [CONFIGURATION.md](CONFIGURATION.md#jobs)).
10. **Production only:** after legal sign-off, set `luckyDrawLegalApproved = true`.

## 5. First campaign

1. Set `luckyDrawEnabled = true` and `luckyDrawCurrency = USD` (the site's default currency must be USD).
2. Lucky Draw › Campaigns › New campaign. Fill in the rules, the prizes JSON with the coupon ID, the rules asset and version, and the legal approval reference.
3. Open the campaign. When Readiness shows no problems, choose **Schedule**.
4. Check Lucky Draw › Overview for "Preference problems: none".

## 6. Smoke test

Run the sandbox plan in [TESTING.md](TESTING.md#sandbox-verification-plan).
