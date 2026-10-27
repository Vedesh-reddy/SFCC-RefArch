# plugin_luckydraw metadata

This site import archive belongs to `plugin_luckydraw` only. Its contents are described in [docs/plugin_luckydraw/METADATA.md](../../docs/plugin_luckydraw/METADATA.md).

| File | Contents |
|---|---|
| `meta/custom-objecttype-definitions.xml` | 13 site-scoped `LuckyDraw*` custom object types |
| `meta/system-objecttype-extensions.xml` | 24 site preferences (group `PluginLuckyDraw`) |
| `sites/RefArch_Practice/preferences.xml` | Sandbox values (`luckyDrawLegalApproved=false`). Rename the folder to your site ID |
| `jobs.xml` | 9 `LuckyDraw-*` jobs, triggers disabled; replace `RefArch_Practice` with your site ID |
| `services.xml` | `plugin-luckydraw.hmac` key holder without a secret; enter it in Business Manager |

The reward promotion and coupon, and the official rules content asset, are merchant-specific and not part of this archive (see [docs/plugin_luckydraw/DEPLOYMENT.md](../../docs/plugin_luckydraw/DEPLOYMENT.md)).

All files validate against the platform XSDs:

```bash
X="$(dirname "$(npx @salesforce/b2c-cli docs schema metadata --path)")"
xmllint --noout --schema "$X/metadata.xsd" meta/*.xml
xmllint --noout --schema "$X/preferences.xsd" sites/*/preferences.xml
xmllint --noout --schema "$X/jobs.xsd" jobs.xml
xmllint --noout --schema "$X/services.xsd" services.xml
```

To import: `npx @salesforce/b2c-cli job import ./metadata/plugin_luckydraw`. To roll back, see [docs/plugin_luckydraw/ROLLBACK.md](../../docs/plugin_luckydraw/ROLLBACK.md).
