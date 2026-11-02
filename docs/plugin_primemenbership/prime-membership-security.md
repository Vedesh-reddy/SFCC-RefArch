# Security

| Threat | Control | Test suite |
|---|---|---|
| Unauthorized access | Login required on all account routes; a remembered customer who hasn't logged in counts as a guest | `security` |
| Cross-customer access (IDOR) | Records are looked up with the session's customer; a transaction belonging to someone else is treated as not found | `security`, `api` |
| CSRF | `csrfProtection.validateRequest` on every POST. An integrity test fails if a route lacks it | `security`, `integrity` |
| XSS | ISML default encoding. `encoding="off"` only for merchant content assets. Client script sets text with `.text()` | Code review |
| Forged payment confirmation | No request value can mark a payment as paid. Activation reads the order on the server | `security` |
| Payment replay | The order must belong to this transaction and customer, and a transaction completes only once | `security`, `jobs` |
| Duplicate subscriptions | The customer number is the primary key | `lifecycle` |
| Duplicate upgrades and double submit | Idempotency key, per-customer lock, transaction status, `pendingTransactionID` | `security` |
| Concurrent state changes | The lock row's unique key works across app servers. Quotes are re-checked against a stamp of the membership | `security`, `upgrade` |
| Negative or tampered charges | Amounts come from the server. Negative is refused. The basket must equal the quote before payment | `upgrade`, `security` |
| Excessive discounts | Per-order and annual caps are required, and a maximum percent; invalid configuration grants nothing | `plans`, `benefits` |
| Duplicate redemption | Unique usage keys; reward codes tied to their owner | `benefits`, `jobs`, `security` |
| Administrative abuse | BM login and module permission, CSRF, POST only, audit with user name; no way to mark as paid | `security` |
| Data leakage | Logs hold identifiers only. Errors show a message, not internals | `security` |
| Privileged API exposure | Admin scope is separate from the shopper scope. Both APIs have no paying or activating endpoints | `api` |

## Transactions

Membership changes commit together with their audit record and notification in one short transaction. Payment processor calls and adapter calls happen outside transactions. If a payment was verified but couldn't be applied, the record goes to `REVIEW` instead of being lost.

## Residual risks

- **Cap overrun under concurrency.** Custom objects have no row locks, and an order's reservation isn't under the customer lock. Two orders placed by one customer at the same moment could both pass the annual cap check, so the overrun is at most one order's cap. A checkout-wide lock would slow every order for an edge case that is bounded and visible in the usage records.
- **Reward codes.** Coupon codes aren't bound to a customer by the platform. `CheckoutServices-PlaceOrder` checks the owner, but a SCAPI checkout doesn't pass through that route.
- **Headless order placement.** SCAPI orders are reserved by the hook, and settled by the job within its interval.
- **Card data.** The membership form posts card data to the storefront the way base SFRA does. A production gateway should use its own hosted fields or tokens. The form is cleared after each request.
- **Merchant-confirmed integrations.** `primeMembershipConnectedIntegrations` is a statement, not a check.
