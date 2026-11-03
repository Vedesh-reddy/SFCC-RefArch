# plugin_primemenbership: Prime Membership

`plugin_primemenbership` adds a paid annual membership to an existing SFRA storefront, with a Business Manager desk in `bm_primemenbership`. The cartridge name keeps its original spelling, `primemenbership`.

| Plan | Annual price | Benefits | Term |
|---|---:|---:|---|
| Prime | $1,000 | 5 | 12 months |
| Ultra Prime | $2,500 | 8 | 12 months |
| Ultra Prime Max | $5,000 | 12 | 12 months |

These are the initial values in the site archive. Plans, prices, benefits, caps and exclusions can all be changed in Business Manager. USD only.

- **Separate order:** a membership is paid in its own order from a temporary basket, so the shopper's cart isn't touched.
- **Verified payment only:** nothing is granted until the order is verified as paid for the quoted amount.
- **Capped savings:** discounts and free shipping have required per-order and annual caps. Bad configuration grants nothing.
- **Prorated upgrades:** the customer pays only the difference for the remaining term, and the expiration date stays.

## Status

**Not ready for production.** The repository's base card processor doesn't take money, so a real payment gateway must be connected first. The [deployment guide](prime-membership-deployment.md#production-blockers) lists every blocker.

It has automated tests, and it ran on sandbox `zyeu-002` on 2026-11-02. [Testing](prime-membership-testing.md#sandbox-results) lists what passed and what hasn't been tested: real declines, rewards, Custom APIs, the loyalty multiplier, keyboard and screen reader use.

## Feature guide

Screenshots from sandbox `zyeu-002` (site `RefArch_Practice`), taken on 2026-11-02. The numbered red boxes mark what each section describes. Test data only. In the Business Manager shots, the sign-in name is replaced with `bm-user`.

### Plans

Every plan's price and benefits come from its configuration, so a change in Business Manager shows here without a code change.

1. The header shows a Join link to nonmembers, and a badge to members. A script adds it after the page loads, so cached pages stay shareable.
2. The plans on sale. An invalid or switched-off plan isn't listed.
3. A comparison table.

![Plans page](images/sf-landing.png)

Each plan has a details page with its benefits (1) and its conditions: validity, savings limits, restrictions, and cancellation and renewal terms (2).

![Plan details](images/sf-details.png)

### Joining

Joining needs a signed-in customer. The review page shows what the plan gives (1) and the exact amount, and asks the customer to accept the terms (2).

![Review before paying](images/sf-join-review.png)

The billing address (1) sets the tax. The fee has no shipping and no order promotions, and can't be discounted (2).

![Billing address](images/sf-join-billing.png)

The final amount with tax is shown before paying (2), and the card goes through the site's own payment processor (1). This run: $1,000 + $50 tax. If the basket no longer equals what was shown, no payment is taken and the customer sees the new amount first.

![Payment](images/sf-join-payment.png)

If the order isn't paid yet, the customer is told so (1), with the order and total (2). Nothing is granted. `Reconciliation` step of `PrimeMembership-Job` activates the membership when the order is verified as paid.

![Waiting for payment](images/sf-join-confirmation.png)

### Member dashboard

1. Member badge in the header.
2. Plan, status and dates.
3. Benefits with what is used and left this year. A benefit that can't be delivered yet shows "Coming soon", never "Active": here, the birthday reward has no coupon set up.
4. Renewal and e-mail choices. Automatic renewal is offered only when a recurring payment adapter exists, and turning it on records the consent.
5. Upgrades.

![Member dashboard](images/sf-dashboard.png)

Further down, usage against the caps (1), savings and reward codes (2), and membership payments (3).

![Usage and payments](images/sf-dashboard-history.png)

### Member savings

Savings are added during the normal basket calculation, from the membership record. A Prime member gets 5% on a $135 line (1) and sees the total saved (2).

![Member price in the cart](images/sf-cart-member.png)

They carry through the base checkout (1), with tax calculated after the discount (2). This Prime order used 2-Day Express, which the test plan doesn't cover, so shipping is charged.

![Prime member at checkout](images/sf-checkout-prime.png)

Ultra Prime gets 10% and, on covered methods, free shipping. $25.49 saved (1), shipping discounted (2), total $127.57 (3). When the order is created, the savings are counted against the caps. They are given back if payment fails, or if the order is cancelled later.

![Ultra Prime member at checkout](images/sf-checkout-ultra.png)

Nonmembers and guests pay normal prices, and no usage is recorded.

### Exclusive and early access

Three product attributes control who may buy: minimum plan rank, public sale date and launch date. Members get in early by the hours on their plan.

The label (1) and the disabled button (2) are only explanation. `Cart-AddProduct` and `CheckoutServices-PlaceOrder` refuse on the server, so bypassing the page doesn't help.

![Members-only product](images/sf-pdp-locked.png)

On the sandbox, with a sale 10 hours away, an Ultra Prime member (24 hours early) could buy and a nonmember couldn't. At 30 hours away, neither could.

### Upgrades

The customer sees the proration (1) and pays only the difference (2). Halfway through the term, Prime to Ultra Prime costs $1,250 for the new plan's remaining term, less $500 credit: **$750**.

![Upgrade quote](images/sf-upgrade.png)

The expiration date doesn't change, and the plan changes only after payment is verified. If the payment fails, the membership stays as it was.

### Cancelling

The customer sees when benefits end (1), and can confirm or keep the membership (2). Benefits stay until the paid-through date, and the customer can take it back until then.

![Cancel membership](images/sf-cancel.png)

### Business Manager

Merchant Tools > Prime Membership. Each menu item is a separate permission, so support and finance can be separate roles. No screen can mark a payment as paid.

**Overview and reports:** the configuration check (1), which must be clean before anything can be bought, then members by status (2) and plan (3), and daily figures with gross, refunds and net kept apart (4).

![Overview](images/bm-overview.png)

**Plans and benefits:** prices, terms and benefit JSON (1). A save is validated, versioned and audited. A discount without caps, or a percent above the maximum, is refused.

![Plan editor](images/bm-plans.png)

**Memberships:** search by customer or status (1), with results (2).

![Membership search](images/bm-memberships.png)

**One membership:** status and credit value (1), suspend, restore or record a refund (2), payments (3), benefit usage (4) and audit (5). Suspending removes all benefits at once. Refunds lower the value later upgrades get credit for, and can't exceed what was paid.

![Membership detail](images/bm-membership.png)

**Reconciliation and corrections:** payments held for review, payments still waiting, and refunds to handle (1). A cancelled paid order lands here, once, and benefits stop until someone records the outcome.

![Reconciliation](images/bm-reconciliation.png)

**Audit trail:** every status change and financial correction, with who made it (1).

![Audit trail](images/bm-audit.png)

**The fee order:** one non-catalog line (1), not exported by default (2), $1,000 + $50 tax with no shipping (3).

![Fee order](images/bm-order.png)

**Jobs:** seven jobs (1), which ship with schedules off. Each is bounded by `MaxItems` and safe to repeat.

![Jobs](images/bm-jobs.png)

## Dedicated repository

The same cartridges are published on their own, with tooling and CI, in [sfcc-prime-membership](https://github.com/Vedesh-reddy/sfcc-prime-membership).

## What is in the repository

| Path | Contents |
|---|---|
| `cartridges/plugin_primemenbership` | Storefront cartridge: routes, helpers, hooks, jobs, Custom APIs, templates |
| `cartridges/bm_primemenbership` | Business Manager desk |
| `metadata/plugin_primemenbership` | Site import archive: custom objects, preferences, plans, jobs |
| `test/plugin_primemenbership` | Automated tests: `npm run test:primemembership` |

## Documents

- [Architecture and compatibility](prime-membership-architecture.md)
- [Data model](prime-membership-data-model.md)
- [API contracts](prime-membership-api-contracts.md)
- [Benefits](prime-membership-benefits.md)
- [Payment flow](prime-membership-payment-flow.md)
- [Business Manager](prime-membership-business-manager.md)
- [Security](prime-membership-security.md)
- [Testing](prime-membership-testing.md)
- [Deployment and rollback](prime-membership-deployment.md)
