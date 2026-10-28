# plugin_analytics metadata

This site import archive belongs to `plugin_analytics` only. See [docs/plugin_analytics/analytics-deployment.md](../../docs/plugin_analytics/analytics-deployment.md).

| File | Contents |
|---|---|
| `meta/custom-objecttype-definitions.xml` | 7 site-scoped `Analytics*` custom object types |
| `meta/system-objecttype-extensions.xml` | 15 site preferences (group `PluginAnalytics`) and 4 `Order.analytics*` attributes |
| `sites/RefArch_Practice/preferences.xml` | Sandbox values (enables analytics and search tracking). Rename the folder to your site ID |
| `jobs.xml` | 5 `Analytics-*` jobs, triggers disabled; replace `RefArch_Practice` with your site ID |

All files validate against the platform XSDs:

```bash
X="$(dirname "$(npx @salesforce/b2c-cli docs schema metadata --path)")"
xmllint --noout --schema "$X/metadata.xsd" meta/*.xml
xmllint --noout --schema "$X/preferences.xsd" sites/*/preferences.xml
xmllint --noout --schema "$X/jobs.xsd" jobs.xml
```

To import: `npx @salesforce/b2c-cli job import ./metadata/plugin_analytics`.
