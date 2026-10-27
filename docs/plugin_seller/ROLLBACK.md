# Rollback

## Level 1: switch off (no data loss, reversible at once)

1. Set `sellerMarketplaceEnabled = false`. When it is off:
   - Seller Central, the Marketplace pages and the Custom APIs answer "not available" (404/503).
   - Offers disappear from the PDP.
   - Offer lines are refused at checkout.
   - Jobs exit with `DISABLED`.
2. Disable the `MarketplaceSeller-*` job schedules.

First-party catalog, cart and checkout keep working. Seller-created products have no first-party stock, so they become unbuyable. To hide them, set them offline or remove their category assignments.

Orders already placed with offer lines remain normal SFCC orders. Their seller parts stay in `MarketplaceSellerOrder` and can be settled after the plugin is re-enabled.

## Level 2: remove from the cartridge path

1. Do Level 1, and settle or export open settlements first (Marketplace › Finance).
2. Remove `plugin_seller` from the storefront path, and `bm_seller` and `plugin_seller` from the Business Manager path. Re-activate the code version so the Custom APIs unregister.
3. Baskets holding offer lines are then priced from the price book. Clear or expire them, or keep the plugin on the path but disabled until they have aged out.

## Level 3: remove the data (irreversible)

Only after finance, legal and the retention rules allow it:

1. Export the custom objects for the archive: Administration › Site Development › Site Import & Export › Custom Objects, types `Marketplace*`.
2. Delete the seller-created products, the marketplace price book and the seller inventory lists through import with mode `delete`, or in Business Manager.
3. Delete the private files under `IMPEX/plugin-seller-private`.
4. Remove the custom object types, the `mkt*` attributes and the `seller*` preferences. Do this by importing a metadata file with `<custom-type type-id="..." mode="delete"/>` and attribute definitions with `mode="delete"`, or in Business Manager › System Object Types / Custom Object Types.
5. Delete the four `plugin-seller.*` services and the ten `MarketplaceSeller-*` jobs.

The ledger, settlements and audit events are financial records. Archive them before deletion and keep them for the period your accountants require.

## Code rollback

All plugin files are under `cartridges/plugin_seller`, `cartridges/bm_seller`, `metadata/plugin_seller`, `docs/plugin_seller` and `test/plugin_seller`. No base or shared file is modified, so removing these folders restores the previous code state.
