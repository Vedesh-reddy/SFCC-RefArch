# plugin_seller metadata

This site import archive belongs to `plugin_seller` only. Its contents are described in [docs/plugin_seller/METADATA.md](../../docs/plugin_seller/METADATA.md).

| File | Contents |
|---|---|
| `meta/custom-objecttype-definitions.xml` | 16 site-scoped `Marketplace*` custom object types |
| `meta/system-objecttype-extensions.xml` | 73 site preferences (group `PluginSeller`), `Product.mkt*` and `ProductLineItem.mkt*` attributes |
| `sites/RefArch_Practice/preferences.xml` | Sandbox values. **Not for live money.** Rename the folder to your site ID |
| `jobs.xml` | 10 `MarketplaceSeller-*` jobs, triggers disabled; replace `RefArch_Practice` with your site ID |
| `services.xml` | 4 `plugin-seller.*` services without secrets; enter them in Business Manager |

All files validate against the platform XSDs:

```bash
X="$(dirname "$(npx @salesforce/b2c-cli docs schema metadata --path)")"
xmllint --noout --schema "$X/metadata.xsd" meta/*.xml
xmllint --noout --schema "$X/preferences.xsd" sites/*/preferences.xml
xmllint --noout --schema "$X/jobs.xsd" jobs.xml
xmllint --noout --schema "$X/services.xsd" services.xml
```

To import: `npx @salesforce/b2c-cli job import ./metadata/plugin_seller`. To roll back, see [docs/plugin_seller/ROLLBACK.md](../../docs/plugin_seller/ROLLBACK.md).
