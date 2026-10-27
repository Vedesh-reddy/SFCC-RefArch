# plugin_wallet metadata

This site import archive belongs to `plugin_wallet` only. Its contents are described in [docs/plugin_wallet/METADATA.md](../../docs/plugin_wallet/METADATA.md).

| File | Contents |
|---|---|
| `meta/custom-objecttype-definitions.xml` | 15 site-scoped `Wallet*` custom object types |
| `meta/system-objecttype-extensions.xml` | 52 site preferences (group `PluginWallet`) and 5 `OrderPaymentInstrument.wallet*` attributes |
| `sites/RefArch_Practice/preferences.xml` | Sandbox values. **Not for Live Money.** Rename the folder to your site ID |
| `sites/RefArch_Practice/payment-processors.xml` | Payment processor `WALLET` |
| `sites/RefArch_Practice/payment-methods.xml` | Payment method `WALLET` (USD) |
| `jobs.xml` | 7 `Wallet-*` jobs, triggers disabled; replace `RefArch_Practice` with your site ID |
| `services.xml` | 2 `plugin-wallet.*` key holders without secrets; enter them in Business Manager |

All files validate against the platform XSDs:

```bash
X="$(dirname "$(npx @salesforce/b2c-cli docs schema metadata --path)")"
xmllint --noout --schema "$X/metadata.xsd" meta/*.xml
xmllint --noout --schema "$X/preferences.xsd" sites/*/preferences.xml
xmllint --noout --schema "$X/paymentprocessor.xsd" sites/*/payment-processors.xml
xmllint --noout --schema "$X/paymentmethod.xsd" sites/*/payment-methods.xml
xmllint --noout --schema "$X/jobs.xsd" jobs.xml
xmllint --noout --schema "$X/services.xsd" services.xml
```

To import: `npx @salesforce/b2c-cli job import ./metadata/plugin_wallet`. To roll back, see [docs/plugin_wallet/ROLLBACK.md](../../docs/plugin_wallet/ROLLBACK.md).
