# Benefits

Each benefit of the brief either works in the plugin or goes through a named integration. A benefit whose dependency is missing shows as "Coming soon" on the dashboard. It's never shown as active.

| # | Benefit ID | Prime | Ultra | Max | How it is delivered | Depends on |
|---|---|---|---|---|---|---|
| 1 | `free-shipping` | yes | yes | yes | Shipping adjustment on the listed methods; the method list decides standard, express or same-day | Merchant lists the method IDs |
| 2 | `member-discount` | 5% | 10% | 15% | Line adjustment | |
| 3 | `early-access` | 12 h | 24 h | 48 h | Product attribute `primeMembershipPublicAt`, enforced at add to cart and place order | Merchant sets the date |
| 4 | `exclusive-deals` | yes | yes | yes | Deal percent on listed products or categories; product attribute `primeMembershipMinRank` limits who may buy | Merchant lists the deals |
| 5 | `birthday-reward` | yes | yes | yes | Job issues a single-use code | Coupon with system codes; birthday on the profile |
| 6 | `priority-support` | | yes | yes (`vip`) | Contact shown to members | `support` integration, contact |
| 7 | `extended-returns` | | 45 d | 60 d | `Order.custom.primeMembershipReturnDays` for the returns system | `returns` integration |
| 8 | `loyalty-multiplier` | | 2x | 3x | Adapter credits the bonus after loyalty releases the points | `plugin_loyalty` or the loyalty hook |
| 9 | `gift-wrap` | | | yes | `Order.custom.primeMembershipGiftWrap` when a shipment is a gift | `gift-wrap` integration. Base SFRA has no gift wrap fee |
| 10 | `launch-access` | | | 72 h | Product attribute `primeMembershipLaunchAt` | Merchant sets the date |
| 11 | `monthly-voucher` | | | yes | Job issues a single-use code per month | Coupon with system codes |
| 12 | `vip-event` | | | yes | `PrimeMembership-Event` shows a content asset to entitled members | Merchant lists the events |

`support`, `returns` and `gift-wrap` count as connected when listed in the `primeMembershipConnectedIntegrations` preference. That preference is the merchant's statement that the system exists. The plugin can't verify it.

The brief gives no launch-access head start, so 72 hours is an initial value to confirm.

## Configuration

A plan's `benefits` attribute is JSON, keyed by benefit ID:

```json
{
  "member-discount": {
    "enabled": true,
    "percent": 5,
    "perOrderCapCents": 10000,
    "annualCapCents": 60000,
    "promotionPolicy": "exclude-promoted",
    "reversal": "restore",
    "excludedProductIDs": [],
    "excludedCategoryIDs": ["gift-cards"],
    "includedCategoryIDs": [],
    "countries": ["US"]
  },
  "free-shipping": {
    "enabled": true,
    "methodIDs": ["001"],
    "perOrderCapCents": 2500,
    "annualCapCents": 30000
  },
  "exclusive-deals": {
    "enabled": true,
    "perOrderCapCents": 5000,
    "annualCapCents": 30000,
    "deals": [{ "percent": 20, "categoryIDs": ["sale"], "startsAt": "2027-01-01T00:00:00Z", "endsAt": "2027-02-01T00:00:00Z" }]
  }
}
```

### Options on any benefit

| Option | Meaning |
|---|---|
| `enabled` | On or off |
| `validFrom`, `validTo` | ISO dates |
| `countries` | Limits by shipping country |
| `customerGroupIDs` | Limits further. A group can narrow a benefit, never grant one |
| `maxUsesPerPeriod` | Orders per benefit period |
| `perOrderCapCents`, `annualCapCents` | Required on monetary benefits |
| `reversal` | `restore` gives the allowance back when an order is cancelled; `keep` doesn't |

### Discount options

| Option | Meaning |
|---|---|
| `percent` | Above 0, at most `primeMembershipMaxDiscountPercent` |
| `excludedProductIDs`, `excludedCategoryIDs`, `includedCategoryIDs` | A product is eligible if not excluded and, when a list is given, included |
| `promotionPolicy` | `exclude-promoted`: skip lines that have a promotion. `stack`: percent of the promoted price. `best-of`: top up to the member price if that is better |

### Failing closed

A plan with a missing cap, an unknown benefit, a broken JSON value or a percent out of range is invalid. An invalid plan can't be saved through the desk. If one gets in another way, it can't be sold and grants its members nothing until it is fixed. An error during the basket calculation removes the member savings, and the shopper checks out at the normal price.

## Tiers replace each other

Each plan lists its own values, so a higher tier's 10% replaces the lower tier's 5%. A customer has one plan, so no two plans can add up. On one line, a member discount and a deal don't add up either: the higher percentage applies.

## How savings are counted

1. **Calculation:** adjustments are rebuilt on every basket calculation from the current counters.
2. **Order created:** savings are reserved, and the caps are checked again. If they no longer fit, or the membership ended, the order fails and no savings are given.
3. **Order placed:** committed. **Payment or placement failed:** released.
4. **Order cancelled later:** `MembershipReconciliationJob` reverses the usage by the `reversal` rule. It also settles any reservation left open by a crashed request.
5. **New benefit period:** counters start over. The usage rows stay as history.

The promotion IDs on the adjustments are `prime-membership-discount`, `prime-membership-deal` and `prime-membership-shipping`. The platform refuses custom adjustments with the ID of a real promotion, so don't create promotions with these IDs.
