# plugin_primemenbership metadata

This site import archive belongs to `plugin_primemenbership` only. Import order and setup are in [the deployment guide](../../docs/plugin_primemenbership/prime-membership-deployment.md).

| File | Contents |
|---|---|
| `meta/custom-objecttype-definitions.xml` | 7 site-scoped `PrimeMembership*` custom object types |
| `meta/system-objecttype-extensions.xml` | Basket, Order and Product attributes, and 21 site preferences (group `PluginPrimeMembership`) |
| `sites/RefArch_Practice/preferences.xml` | Sandbox values, plugin off. Rename the folder to your site ID |
| `sites/RefArch_Practice/custom-objects/PrimeMembershipPlan.xml` | The three plans with their initial values, off until configured |
| `jobs.xml` | 7 `Membership*` jobs, schedules off; replace `RefArch_Practice` with your site ID |

No secrets are stored in this archive. Coupons, promotions, content assets and shipping methods are merchant-specific, and aren't part of it.

All files validate against the platform XSDs:

```bash
X="$(dirname "$(npx @salesforce/b2c-cli docs schema metadata --path)")"
xmllint --noout --schema "$X/metadata.xsd" meta/*.xml
xmllint --noout --schema "$X/preferences.xsd" sites/*/preferences.xml
xmllint --noout --schema "$X/customobject.xsd" sites/*/custom-objects/*.xml
xmllint --noout --schema "$X/jobs.xsd" jobs.xml
```
