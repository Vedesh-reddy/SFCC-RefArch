# Business Manager

Merchant Tools > Prime Membership, from cartridge `bm_primemenbership`. Each menu item is a separate permission, so these can go to different roles.

| Menu item | Purpose | Suggested role |
|---|---|---|
| Overview and reports | Configuration check, member counts, daily figures | All |
| Plans and benefits | Prices, terms, on/off, benefit JSON. Validated on save, versioned, audited | Merchandising lead |
| Memberships | Search by customer or status; status, payments, usage, audit | Support |
| Reconciliation and corrections | Payments held for review, refunds to handle; suspend, restore, record a refund | Finance only |
| Audit trail | Read-only | Finance, audit |

Every change is a CSRF-protected POST and is recorded with the BM user name. Grant modules under Administration > Organization > Roles & Permissions > Business Manager Modules.

The suspend, restore and refund form appears on the membership page, which the support role can read. The action behind it belongs to the *corrections* menu item, so a role without that item is refused when it submits.

No screen can mark a payment as paid. "Apply" on a held payment still checks that the order is paid for the quoted amount.

## Site preferences

Group `PluginPrimeMembership` under Merchant Tools > Site Preferences > Custom Preferences.

| Preference | Default | Meaning |
|---|---|---|
| `primeMembershipEnabled` | false | Master switch |
| `primeMembershipCurrency` | USD | Only USD is accepted |
| `primeMembershipPaymentMethods` | | Payment methods for fees. Required |
| `primeMembershipBillingCountries` | | Billing countries. Required |
| `primeMembershipFromEmail` | | E-mail sender. Required |
| `primeMembershipFeeProductID` | `prime-membership-fee` | Fee line ID. Must not exist in the catalog |
| `primeMembershipFeeTaxClass` | | Fee tax class; empty uses the default |
| `primeMembershipExportFeeOrders` | false | Send fee orders to the OMS |
| `primeMembershipQuoteMinutes` | 14 | Quote lifetime, 1 to 14 |
| `primeMembershipMinUpgradeChargeCents` | 100 | Smallest upgrade charge |
| `primeMembershipRenewalWindowDays` | 30 | When renewal opens |
| `primeMembershipReminderDays` | 30,7,1 | Reminder days |
| `primeMembershipMaxDiscountPercent` | 50 | Highest percent a plan may set |
| `primeMembershipDiscountSellerOffers` | false | Discount seller offers; needs a funding policy |
| `primeMembershipLoyaltyEnabled` | false | Use the loyalty adapter |
| `primeMembershipAutoRenewEnabled` | false | Offer automatic renewal; needs the adapter |
| `primeMembershipConnectedIntegrations` | | Confirmed systems: `returns`, `gift-wrap`, `support` |
| `primeMembershipTermsAssetId`, `primeMembershipFaqAssetId` | | Content assets |
| `primeMembershipJoinLinkEnabled` | true | Join link in the header |
| `primeMembershipNotificationMaxAttempts` | 5 | E-mail attempts |

The overview's configuration check lists anything missing. **Nothing can be bought while the list isn't empty.**

## Product attributes

On products or their masters, under the Prime Membership attribute group:

| Attribute | Meaning |
|---|---|
| `primeMembershipMinRank` | Only members of this plan rank or higher may buy |
| `primeMembershipPublicAt` | Public start of a sale. Members with early access buy earlier by their hours |
| `primeMembershipLaunchAt` | Public launch. Members with launch access buy earlier |

In a catalog import, these dates use the format `2027-01-15T12:00:00.000+0000`. The platform refuses a value ending in `Z`.

## Jobs

Every step below runs in one job, `PrimeMembership-Job`, every 15 minutes. Daily steps wait for their `RunEveryMinutes` setting, and a failing step doesn't stop the others, and the last step, `ReportFailures`, then marks the job `ERROR`. The schedule ships off, so enable it after the sandbox test.

| Step | Runs every | Does |
|---|---|---|
| `Reconciliation` | 15 minutes | Activates paid memberships, closes abandoned records, settles reservations, reverses cancelled orders, pays loyalty bonuses |
| `Notifications` | 15 minutes | Sends queued e-mails with backoff |
| `Expiration` | Daily | Reminders and expirations |
| `Renewal` | Daily | Automatic renewals; does nothing without the adapter |
| `BenefitReset` | Daily | Benefit periods, monthly vouchers |
| `BirthdayReward` | Daily | Birthday rewards |
| `Reporting` | Daily | Daily figures for the overview |

Each has a `MaxItems` parameter, can be repeated safely, and resumes from a saved position or from record state. A step reports `ERROR` for real failures such as an exhausted coupon, but not for a customer's declined payment. Logs: `prime-membership` prefix, categories `membership-job`, `membership-payment`, `membership-benefit`, `membership-reward`, `membership-notification`, `membership-integration`, `membership-admin`.

## E-mail text

All messages are `notification.<TYPE>.subject` and `.body` in `templates/resources/primemembership.properties`, with one shared template, `membership/email/notification.isml`. Types: `ACTIVATED` (purchase and activation), `UPGRADED`, `RENEWED`, `EXPIRING`, `EXPIRED`, `PAYMENT_FAILED`, `CANCELLED`, `BIRTHDAY_REWARD`, `MONTHLY_VOUCHER`, `MEMBERSHIP_CHANGED`. `BIRTHDAY_REWARD` and `MONTHLY_VOUCHER` respect the customer's marketing choice. The others are service messages about a paid membership and are always sent.

## Reports

Daily figures: new members, upgrades, renewals, membership, upgrade and renewal revenue, gross, refunds, net, member savings, failed payments, cancellations, expirations, conversion, and redemptions per benefit. Revenue is before tax. Conversion is completed payments divided by checkouts started. A day marked *partial* hit the job's `MaxItems`; raise it and run the job again.
