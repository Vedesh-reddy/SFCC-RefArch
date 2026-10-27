# Rollback

Promised prizes are commitments to customers. Before stopping a running campaign, legal must decide how its announced draws and rewards are honored.

## Level 0: pause one campaign (reversible)

Lucky Draw › Campaigns › campaign › **Pause** with a reason.

- Orders and free entries made during the pause earn no entries.
- Draws whose time falls in the pause wait until the campaign resumes.
- Draws that already started finish, and their winners stand.

**Resume** continues; **Cancel** ends the campaign. After a cancel, draws that were not yet selected are cancelled, and issued rewards stay valid.

## Level 1: switch the program off (no data loss, reversible at once)

1. Set `luckyDrawEnabled = false`. When it is off:
   - the lucky draw pages answer "not available" (404);
   - the Custom APIs answer 503 `DISABLED`;
   - jobs exit with `DISABLED`: no new entries, draws, rewards or e-mails.
   The coupon owner and expiry checks in `Cart-AddCoupon` and `PlaceOrder` stay active as long as the cartridge is on the path, so issued codes keep their restrictions.
2. Optionally disable the `LuckyDraw-*` job schedules.

Campaigns, entries, draws and rewards stay as they are. When the program is switched on again, the jobs continue from the stored state. Missed draw times are drawn on the next run, with their original windows.

## Level 2: remove from the cartridge path

1. Do Level 1, and finish or cancel every campaign. Make sure no reward is PENDING (Draws and winners).
2. Decide what happens to issued codes. Without the plugin, codes are no longer bound to their winner or to their per-reward expiry. Either end the reward promotion in Business Manager, or keep its end date as the only limit.
3. Remove `plugin_luckydraw` from the storefront path, and `bm_luckydraw` and `plugin_luckydraw` from the Business Manager path. Re-activate the code version so the Custom APIs unregister.

## Level 3: remove the data (irreversible)

Only after legal and the retention rules allow it. Draw records may need to be kept for audits and disputes.

1. Export the records for the archive:
   - the custom objects: Administration › Site Development › Site Import & Export › Custom Objects, types `LuckyDraw*`;
   - the `IMPEX/src/plugin-luckydraw` folder (snapshots and audit exports).
2. Remove the custom object types and the `luckyDraw*` preferences by importing a metadata file with `<custom-type type-id="..." mode="delete"/>` and attribute definitions with `mode="delete"`, or in Business Manager.
3. Delete the `plugin-luckydraw.hmac` service and the nine `LuckyDraw-*` jobs. Remove the reward promotion and coupon if they are no longer needed.

## Code rollback

All plugin files are under `cartridges/plugin_luckydraw`, `cartridges/bm_luckydraw`, `metadata/plugin_luckydraw`, `docs/plugin_luckydraw` and `test/plugin_luckydraw`. No base or shared file is modified, so removing these folders restores the previous code state.
