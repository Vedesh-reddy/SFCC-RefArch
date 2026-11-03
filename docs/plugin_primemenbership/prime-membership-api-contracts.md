# API contracts

There is no native membership API in SCAPI or OCAPI, so the plugin ships two Custom APIs and a set of storefront routes. Paying is only possible through the storefront checkout.

## Storefront routes

All are HTTPS. Routes marked *login* redirect guests to login. Every POST validates the CSRF token, and every route acts on the signed-in customer only.

| Route | Method | Login | Purpose |
|---|---|---|---|
| `PrimeMembership-Show` | GET | | Plans, comparison, FAQ, terms |
| `PrimeMembership-Details?plan=` | GET | | One plan with its conditions |
| `PrimeMembership-Join?plan=` | GET | yes | Review a new membership |
| `PrimeMembership-Upgrade?plan=` | GET | yes | Review an upgrade with the proration |
| `PrimeMembership-Renew` | GET | yes | Review a renewal |
| `PrimeMembership-StartCheckout` | POST | yes | Fix the price in a quote, open the basket |
| `PrimeMembership-Checkout?id=` | GET | yes | Billing address, then tax and payment |
| `PrimeMembership-SaveBilling?id=` | POST | yes | Store the address, calculate tax |
| `PrimeMembership-PlaceOrder?id=` | POST | yes | Pay |
| `PrimeMembership-Confirmation?id=` | GET | yes | Outcome |
| `PrimeMembership-Dashboard` | GET | yes | Status, benefits, usage, payments |
| `PrimeMembership-UpdateSettings` | POST | yes | Renewal and e-mail choices |
| `PrimeMembership-Cancel` | GET | yes | Shows the effective date |
| `PrimeMembership-CancelSubmit` | POST | yes | Cancels |
| `PrimeMembership-Reactivate` | POST | yes | Takes a cancellation back |
| `PrimeMembership-Event?id=` | GET | yes | VIP event page, for entitled members |
| `PrimeMembership-PageContext` | GET | | JSON: badge, join link, basket savings |
| `PrimeMembership-ProductLabels?pids=` | GET | | JSON: labels, at most 48 products |

Extended routes: `Cart-AddProduct` and `CheckoutServices-PlaceOrder` (prepends).

## Shopper API `prime-membership`

Scope `c_prime_membership`, SLAS shopper token. The customer always comes from the token, so there is no parameter that could name another customer.

| Endpoint | Purpose |
|---|---|
| `GET /plans` | Plans on sale |
| `GET /plans/{planId}/upgrade-quote` | `chargeCents`, `unusedCreditCents`, `targetCostCents`, `remainingSeconds` |
| `GET /membership` | Status, dates, benefits |
| `POST /membership/cancellation` | Cancels; returns `effectiveDate` |
| `GET /membership/transactions?c_limit=` | Payments, at most 100 |

## Admin API `prime-membership-admin`

Scope `c_prime_membership_admin`, Account Manager client. Grant it to back-office clients only, and call it with a storefront `siteId`.

| Endpoint | Purpose |
|---|---|
| `GET /memberships/{customerNo}` | One membership with its payments |
| `POST /memberships/{customerNo}/refunds` | Records a refund made in the payment system. Body: `c_orderNo`, `c_amountCents`, `c_reference`, `c_endMembership`. The reference makes it idempotent |
| `GET /transactions/review?c_limit=` | Payments held for review |

Neither API can mark a payment as paid or activate a membership.

### Errors

Errors are problem responses with type `prime-membership-<code>`:

| Status | Codes |
|---|---|
| 400 | `invalid` and business refusals such as `not-an-upgrade` |
| 401 | `unauthenticated` |
| 404 | `not-found` |
| 409 | `invalid-transition`, `payment-pending` |
| 503 | `disabled` |

### Rate limits

SCAPI applies the platform's limits to Custom APIs. The storefront routes that create records are limited by login, CSRF, the per-customer lock and the platform's 4 temporary baskets per customer. There is no separate request counter.

## OCAPI Data API

Nothing in the plugin needs OCAPI. For an authorized back-office system, the generic custom object resources can read these records. A least-privilege client configuration looks like this, and must never be given to a storefront client:

```json
{
  "client_id": "<back-office client>",
  "resources": [
    { "resource_id": "/custom_objects/PrimeMembershipSubscription/*", "methods": ["get"], "read_attributes": "(**)", "write_attributes": "()" },
    { "resource_id": "/custom_objects/PrimeMembershipTransaction/*", "methods": ["get"], "read_attributes": "(**)", "write_attributes": "()" }
  ]
}
```

Keep it read-only. A write through OCAPI bypasses the state machine and the audit trail; use the Admin API for refunds.

## OCAPI and SCAPI shopper hooks

| Hook | Behavior |
|---|---|
| `dw.order.calculateTax` | Same savings for SCAPI baskets |
| `dw.ocapi.shop.basket.items.beforePOST` | Refuses a product the shopper may not buy |
| `dw.ocapi.shop.order.afterPOST` | Reserves the order's savings; refuses the order when they're no longer allowed |

A headless storefront must also commit or release reservations, which it leaves to `Reconciliation` step of `PrimeMembership-Job`.

## Integration adapters

All optional hooks, called only outside transactions. `status` is `CAPTURED`, `PENDING` or `FAILED`; any other answer, or an exception, counts as unknown and never as paid.

| Hook | Function | Input | Output |
|---|---|---|---|
| `app.plugin.primemembership.payment` | `verifyPayment` | `{orderNo, totalCents, currency}` | `{status, amountCents, currency, reference}` |
| `app.plugin.primemembership.recurring` | `chargeRenewal` | `{transactionID, customerNo, planID, amountCents, currency}` | `{status, orderNo, amountCents, currency, reference}` |
| `app.plugin.primemembership.loyalty` | `applyMultiplier` | `{orderNo, customerNo, multiplier}` | `{status: APPLIED, PENDING or VOID, bonusPoints}` |

`transactionID` is stable per term, so use it as the provider's idempotency key. An implementation asks its provider server to server; a browser redirect or webhook body alone is not proof of payment.
