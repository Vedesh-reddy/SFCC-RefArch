# Deployment

Use a development sandbox first. Nothing here changes production settings by itself.

## 1. Build and upload code

```bash
npm install
npx sgmf-scripts --compile js --cartridgeName plugin_analytics   # static/default/js/analytics.js (git-ignored)
npx sgmf-scripts --uploadCartridge plugin_analytics
npx sgmf-scripts --uploadCartridge bm_analytics
```

## 2. Cartridge paths

- Storefront site (**Administration › Sites › Manage Sites › (site) › Settings**): add `plugin_analytics` left of `app_storefront_base`, e.g. `...:plugin_analytics:app_storefront_base`. Its controllers only `append`, so the order among other plugins does not matter.
- Business Manager (**Administration › Sites › Manage Sites › Business Manager Site › Settings**): add `bm_analytics:plugin_analytics` (the desk uses the plugin's helpers).

## 3. Import metadata

Review conflicts first: the archive adds new custom object types, 15 new site preferences (`analytics*`), 4 new `Order` attributes and 5 new jobs. It does not change existing attributes, preferences or jobs.

```bash
npx @salesforce/b2c-cli job import ./metadata/plugin_analytics
```

- Rename `sites/RefArch_Practice` to your site ID, or delete that folder to keep all preferences at their defaults (analytics off).
- Replace `RefArch_Practice` in `jobs.xml` with your site ID.
- If the import runs before the cartridge path is set, the jobs are rejected (unknown step type); re-import `jobs.xml` afterwards.
- The Business Manager cartridge path is shared by every site on the instance. Add `bm_analytics:plugin_analytics` in front of the existing entries; do not replace them.

## 4. Configure

1. Site currency must be USD.
2. **Site Preferences › Storefront Analytics**: set `analyticsEnabled` = true; review the other values ([configuration](analytics-configuration.md)).
3. **Administration › Operations › Jobs**: enable schedules — AggregateEvents and ReconcileOrders every 15 min, GenerateRankings, Cleanup and IntegrityCheck daily.
4. Grant the Storefront Analytics menu actions to roles ([security](analytics-security.md#role-setup)).

## 5. Verify

1. Browse a category page, open a product, add to cart, check out.
2. Run `Analytics-AggregateEvents` and `Analytics-ReconcileOrders`.
3. Open **Merchant Tools › Storefront Analytics › Overview** for Today and **Health**.

## Sandbox validation checklist

| # | Check | Expected | zyeu-002, 2026-10-28 |
|---|---|---|---|
| A1 | Network tab on a PLP | `Analytics-Collect` POST, 204, after scrolling or leaving the page | Pass — script and page context render on PLP and PDP; beacons answered 204 |
| A2 | Origin of the beacon | Same host; a POST from another origin stores nothing | Pass — cross-origin, replayed and oversized beacons stored nothing |
| A3 | Add to cart, refresh PDP twice | 1 cart action; 3 views, 1 unique view | Pass — one add per run; views and unique-session views counted separately |
| A4 | Checkout, invalid then valid shipping form | 1 shipping step | Pass (accepted steps) — one session: 2 × Checkout-Begin, 1 × shipping, 1 × payment counted as 1 attempt each. Invalid form not exercised on the sandbox (unit-tested) |
| A5 | Place order, run ReconcileOrders twice | 1 order, figures unchanged by the second run | Pass — second run reported the order as `unchanged` |
| A6 | Cancel the order in BM, run ReconcileOrders | Orders −1, cancelled +1 | Pass — snapshot became `{"s":"C"}`, orders 2 → 1, cancelled 1 |
| A7 | `OrderMgr.searchOrders('lastModified >= {0}')` | Works in the job (the reconciliation cursor depends on it) | Pass — first run backfilled 36 orders |
| A8 | Refund via invoices (if Order post-processing APIs are enabled) | Refund shown on the order's day | Not tested — no invoices on the sandbox |
| A9 | BM user without the Storefront Analytics module | Pages refused by the platform | Pass — "You tried to access a module without permissions" until the role got the modules |
| A10 | Quota Status after a load test | No `CustomObjectMgr.create` or session size violations | Pass (functional run, no load test) — storefront `create()` max 2 per request, 0 violations; Session quota OK |

Also verified on the sandbox: a forged `purchase` and `add_to_cart` in a consented session were rejected (sales and cart figures unchanged); variant lines roll up to the master and category; all five jobs ran OK; the integrity check found 0 problems over 7 days; the products CSV downloads as an attachment.

## Rollback

1. Disable the job schedules and set `analyticsEnabled` = false (the script stops loading after page caches expire; the endpoint stores nothing).
2. Remove `plugin_analytics` and `bm_analytics` from the cartridge paths.
3. Optionally delete the `Analytics*` custom object types, the `analytics*` preferences and the `Order.analytics*` attributes in Business Manager. Order attributes hold only hashes, tokens and the snapshot.
