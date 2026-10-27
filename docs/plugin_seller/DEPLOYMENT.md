# Deployment

The plugin is independent of the other plugins in this repository. It needs only `app_storefront_base` (SFRA 7+), and it does not change any base file.

## 1. Build and upload

```bash
npm install
npx sgmf-scripts --compile js --cartridgeName plugin_seller   # or the repo's compile scripts
npx sgmf-scripts --compile css --cartridgeName plugin_seller
npx sgmf-scripts --uploadCartridge plugin_seller
npx sgmf-scripts --uploadCartridge bm_seller
```

`client/default/js/marketplace-offers.js` and `client/default/scss/seller-central.scss` compile to `static/default/js/marketplace-offers.js` and `static/default/css/seller-central.css`.

## 2. Cartridge paths

| Site | Path |
|---|---|
| Storefront (e.g. `RefArch`) | `plugin_seller:<other plugins>:app_storefront_base` |
| Business Manager | `bm_seller:plugin_seller` (prepend to the existing BM path) |

`plugin_seller` must be left of `app_storefront_base`, because its `dw.order.calculateTax` hook has to run before the base one. If another cartridge also overrides `product/productTileFooter`, `cart/productCard/cartProductCardHeader` or `checkout/productCard/productCardProductName`, merge the "Sold by" line into that override.

Re-activate the code version after the first deployment and after any `schema.yaml` or `api.json` change, so the Custom APIs register.

## 3. Import metadata

1. Rename `metadata/plugin_seller/sites/RefArch_Practice` to your site ID.
2. Replace `RefArch_Practice` in `jobs.xml`.
3. Review the sandbox values in `preferences.xml` (catalog IDs, categories, e-mail addresses).
4. Import:

```bash
npx @salesforce/b2c-cli job import ./metadata/plugin_seller
```

## 4. Business Manager configuration

1. **Services:** set the passwords of `plugin-seller.hmac` and `plugin-seller.webhook` to random values of at least 32 characters. For SCAPI_ADMIN, set the Account Manager client on `plugin-seller.am.oauth` and the short code URL on `plugin-seller.scapi.admin`.
2. **Price book:** after the first provisioning import, assign `sellerPriceBookId` to the site.
3. **Commission:** Marketplace › Finance › create a DEFAULT rule (e.g. 1000 bps = 10%).
4. **Roles:** Administration › Organization › Roles › Business Manager Modules. Grant the Marketplace modules per team: Overview, Sellers, Products and offers, Trust and safety, Finance, Audit trail.
5. **WebDAV:** create the folders `IMPEX/plugin-seller-private/documents` and `IMPEX/plugin-seller-private/images` (storefront requests cannot create folders, so uploads fail until they exist), then limit access to `IMPEX/plugin-seller-private`.
6. **Jobs:** enable and schedule the ten `MarketplaceSeller-*` jobs (see [CONFIGURATION.md](CONFIGURATION.md#jobs)).
7. **Seller agreement:** create a content asset and set `sellerAgreementContentAssetId` and `sellerAgreementVersion`.
8. **Custom APIs:** create a SLAS client with scopes `c_mkt_shopper c_mkt_seller` for headless sellers, and an Account Manager client with `c_mkt_admin` for the OMS.
9. **Providers:** keep MANUAL/NONE in the sandbox. For EXTERNAL, deploy the integration cartridge with the hooks and give the provider the webhook URL `https://<host>/on/demandware.store/Sites-<site>-Site/default/MarketplaceWebhook-Receive` and the secret.

## 5. Enable

Set `sellerMarketplaceEnabled = true` (and `sellerRegistrationEnabled` when ready). Check Marketplace › Overview: it must show "Preference problems: none" and "Provisioning ready: yes".

## 6. Smoke test

Run the sandbox plan in [TESTING.md](TESTING.md#sandbox-verification-plan).
