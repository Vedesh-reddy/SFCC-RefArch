# Rollback

Customer balances are liabilities. Before any rollback that ends wallet use, finance must decide how open balances are paid out or honored. The plugin never deletes balances by itself.

## Level 1: switch off (no data loss, reversible at once)

1. Set `walletEnabled = false`. When it is off:
   - the wallet pages answer "not available" (404);
   - the billing step offers no wallet, and `Wallet-Apply` is refused;
   - a wallet instrument still in a basket is removed at PlaceOrder and the shopper is sent back to the payment step; card checkout is unchanged;
   - the Custom APIs answer 503 `DISABLED`; the webhook answers 503;
   - jobs exit with `DISABLED`.
2. Optionally disable the `Wallet-*` job schedules.

Wallet balances, holds and history stay as they are. Before switching off, run `Wallet-Holds` once (or wait for open checkouts to finish) so no hold stays ACTIVE. Holds left ACTIVE are settled by `Wallet-Holds` after the wallet is enabled again.

A softer option is to stop only new money: set `walletGatewayMode = EXTERNAL` without `walletLiveMoneyApproved` (top-ups refused, spending of existing balances still possible).

## Level 2: remove from the cartridge path

1. Do Level 1. Make sure no hold is ACTIVE or REVIEW (BM › Smart Wallet › Wallets, or `wallet-admin` `GET /holds`).
2. Disable the `WALLET` payment method (Merchant Tools › Ordering › Payment Methods). Baskets still holding a wallet instrument then fail payment validation, and the shopper chooses another method.
3. Remove `plugin_wallet` from the storefront path, and `bm_wallet` and `plugin_wallet` from the Business Manager path. Re-activate the code version so the Custom APIs unregister.

Orders already paid with the wallet remain normal orders with a `WALLET` payment instrument. Refunds of those orders to the wallet need the plugin back on the path (or a manual process agreed with finance).

## Level 3: remove the data (irreversible)

Only after finance, legal and the unclaimed-property rules allow it, and after open balances are settled:

1. Export the custom objects for the archive: Administration › Site Development › Site Import & Export › Custom Objects, types `Wallet*`.
2. Remove the custom object types, the `wallet*` preferences and the `OrderPaymentInstrument.wallet*` attributes. Import a metadata file with `<custom-type type-id="..." mode="delete"/>` and attribute definitions with `mode="delete"`, or use Business Manager › System Object Types / Custom Object Types. Removing the payment instrument attributes removes them from historical orders too; keep them if orders are retained.
3. Delete the `WALLET` payment method and processor, the two `plugin-wallet.*` services and the seven `Wallet-*` jobs.

The journals, entries, holds and audit events are financial records. Archive them before deletion and keep them for the period your accountants require.

## Code rollback

All plugin files are under `cartridges/plugin_wallet`, `cartridges/bm_wallet`, `metadata/plugin_wallet`, `docs/plugin_wallet` and `test/plugin_wallet`. No base or shared file is modified, so removing these folders restores the previous code state.
