# Deployment and rollback

## Production blockers

Don't take this to production until all of these are done:

1. **Payment gateway.** Base `basic_credit` takes no money. Connect a real gateway, and confirm it sets `PAID` or implements the payment adapter.
2. **Open items** from the [sandbox results](prime-membership-testing.md#sandbox-results): real declines, rewards, Custom APIs, the loyalty multiplier and a manual accessibility check.
3. **Terms and legal review.** Membership terms, cancellation and refund policy, and automatic renewal rules where it will be used.
4. **Finance sign-off** on savings caps, tax treatment of fees and the promotion policy.
5. **Decisions** on the [analytics question](prime-membership-architecture.md#open-decision-plugin_analytics), and the 72-hour launch access value, which the brief doesn't set.

## Install

1. Build and upload:
   ```bash
   npm run compile:js && npm run compile:scss
   npx sgmf-scripts --uploadCartridge plugin_primemenbership
   npx sgmf-scripts --uploadCartridge bm_primemenbership
   ```
2. Cartridge paths:
   - Storefront: put `plugin_primemenbership` left of `app_storefront_base`, and **right of `plugin_seller`** if that is installed.
   - Business Manager: add `bm_primemenbership:plugin_primemenbership` to the Business Manager site's path.
3. Import, in this order. Jobs must come after step 2, or the import rejects their step types.
   | Order | File | Contents |
   |---|---|---|
   | 1 | `meta/custom-objecttype-definitions.xml` | 7 custom object types |
   | 2 | `meta/system-objecttype-extensions.xml` | Basket, Order, Product attributes; 21 site preferences |
   | 3 | `sites/<site>/preferences.xml` | Payment methods and countries, plugin off |
   | 4 | `sites/<site>/custom-objects/PrimeMembershipPlan.xml` | 3 plans, off |
   | 5 | `jobs.xml` | 7 jobs, schedules off |

   Rename the `RefArch_Practice` folder and `site-id` to your site.
4. Grant the BM modules to the right roles. See [Business Manager](prime-membership-business-manager.md).

## Configure

1. In Plans and benefits, for each plan:
   - Set `methodIDs` on `free-shipping` to your shipping method IDs.
   - Create single-use system-code coupons with their promotions, and set `couponID` on `birthday-reward` and `monthly-voucher`.
   - Review the caps and exclusions. Exclude gift cards if you sell them.
   - Set **On sale** to Yes.
2. Set `primeMembershipFromEmail`, and the terms and FAQ content assets.
3. Add the fee's tax class if fees are taxed differently.
4. Check that the configuration check on the overview is empty.
5. Set `primeMembershipEnabled` to true.
6. Enable the job schedules.

Custom APIs in `cartridge/rest-apis` register with the code version. Check their status with `npx @salesforce/b2c-cli scapi custom status`. Add the scopes `c_prime_membership` to the SLAS client and `c_prime_membership_admin` to the Account Manager client that needs them.

## Sandbox smoke test

These confirm what the test harness can't. Items 1 to 4 are the ones most likely to find differences.

| # | Check | Expected |
|---|---|---|
| 1 | Join with a test card | Order created from a temporary basket; cart untouched; no shipping cost on the order |
| 2 | Tax | Billing address gives the expected tax; shown amount equals the order's total |
| 3 | Have the gateway or OMS set the order to Paid, run reconciliation. BM can't set it | Membership `ACTIVE`, e-mail queued, then sent by the notification job |
| 4 | Member buys merchandise | Discount and free shipping appear in cart and checkout totals, and on the order; usage row committed |
| 5 | Upgrade halfway through a term | Quoted charge matches the formula; expiration unchanged |
| 6 | Decline, and cancel an unpaid order | Benefits unchanged; failed state; notification |
| 7 | Exclusive and early access product | Label shown, add to cart refused, works for the right member |
| 8 | Cancel, then reactivate | Benefits kept; effective date correct |
| 9 | Each job with a small `MaxItems`, run twice | Counts sensible, no duplicates |
| 10 | Other plugins on the path | Wallet, loyalty, seller and lucky draw checkouts work. A fee order earns no points and no draw entries |
| 11 | Non-member checkout | Unchanged |
| 12 | Accessibility | Keyboard through the review and checkout forms; labels read correctly |

## Rollout

1. Sandbox, with one plan on sale.
2. Staging with the real gateway in test mode.
3. Production with `primeMembershipEnabled` off. Import, configure, verify the overview.
4. Turn it on for a small audience if your storefront allows it, then for everyone. Watch the `prime-membership` logs and the Reconciliation page.

## Rollback

| Goal | Steps | Effect |
|---|---|---|
| Stop selling, keep benefits | Set each plan's On sale to No | Existing members keep benefits |
| Stop everything fast | Set `primeMembershipEnabled` to false | **All member savings and access rules stop, including for paying members.** Jobs and pages stop too. Payments in flight wait; nothing is lost. Tell members |
| Remove the code | Disable the job schedules, then remove both cartridges from the paths | Baskets recalculate without savings. Adjustments already on placed orders stay |

Keep the custom objects after a rollback: they are the financial record of what members paid for. Don't delete them unless finance agrees. Re-enabling continues from the records as they are; run `Reconciliation` step of `PrimeMembership-Job` first.

The change in `plugin_luckydraw` is independent. It only skips non-catalog lines, so it can stay.
