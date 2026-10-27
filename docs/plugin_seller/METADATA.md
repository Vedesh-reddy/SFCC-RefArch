# Metadata

`metadata/plugin_seller` is a site import archive. It is generated from the code-level definitions and validated against the platform XSDs (`metadata.xsd`, `preferences.xsd`, `jobs.xsd`, `services.xsd`). It shares no files with other plugins.

```
metadata/plugin_seller/
├── meta/custom-objecttype-definitions.xml   16 site-scoped custom object types
├── meta/system-objecttype-extensions.xml    SitePreferences (73), Product (7), ProductLineItem (5)
├── sites/RefArch_Practice/preferences.xml   sandbox values (rename the folder to your site ID)
├── jobs.xml                                 10 jobs, triggers disabled
└── services.xml                             4 services, no secrets
```

## Custom object types

All types are site-scoped (`storage-scope site`) and not staged.

| Type | Key | Purpose | Notes |
|---|---|---|---|
| `MarketplaceSeller` | `sellerId` | Seller account, status, verification state, settings, rating | Tax ID stored as last 4 digits plus a keyed hash only |
| `MarketplaceSellerMember` | `customerNo` | Which customer may act for which seller, with role | One seller per customer |
| `MarketplaceDocument` | `documentId` | Verification document metadata | The file is in `IMPEX/plugin-seller-private/documents/` |
| `MarketplaceSubmission` | `submissionId` | Product submission and provisioning state | Payload JSON in cents |
| `MarketplaceOffer` | `offerId` = `<sellerId>:<productId>` | Price, stock, terms, review state | One offer per seller and product |
| `MarketplaceSellerOrder` | `sellerOrderId` = `<orderNo>:<sellerId>` | Seller part of an order: lines, shipments, events, ship-to | Ship-to is cleared when the seller order closes |
| `MarketplaceLedgerEntry` | `entryId` = idempotency key | Signed earnings entries | Not edited; settlement link written once |
| `MarketplaceCommissionRule` | `ruleId` | Commission rules | Deactivated, never deleted |
| `MarketplaceSettlement` | `settlementId` | Settlement statements and payout state | |
| `MarketplaceAuditEvent` | `eventId` | Append-only audit trail | Detail is redacted |
| `MarketplaceNotification` | `notificationId` | Inbox entries and queued e-mails | No e-mail addresses stored |
| `MarketplaceCase` | `caseId` | Trust and safety cases | Seller visibility per case type |
| `MarketplaceOtp` | `otpId` = `<purpose>:<subject>` | Hashed verification code | Platform retention 7 days |
| `MarketplaceJobState` | `jobId` | Watermarks, cursors and batch markers | |
| `MarketplaceRateBucket` | `bucketId` | Fixed-window counters | Platform retention 2 days |
| `MarketplaceRequestKey` | `requestKeyId` | Idempotency keys and webhook replay guard | Removed after `sellerRequestKeyRetentionDays` |

The unit-test harness reads these definitions and rejects any write to an attribute that is not defined, or of the wrong type. Code and metadata therefore cannot drift without a failing test.

## System object attributes

| Object | Attribute | Type | Written by |
|---|---|---|---|
| ProductLineItem | `mktOfferId`, `mktSellerId` | String | cart (add to cart) |
| ProductLineItem | `mktOfferValid` | Boolean | offer pricing hook |
| ProductLineItem | `mktUnitPriceCents`, `mktShippingFeeCents` | Integer | offer pricing hook |
| Product | `mktOwnerSellerId`, `mktSubmissionId` | String | provisioning |
| Product | `mktSpecifications`, `mktWarranty`, `mktDimensions` | Text | provisioning |
| Product | `mktFeaturedSellerId` | String | offer sync |
| Product | `mktOfferCount` | Integer | offer sync |

Line item attributes are copied to the order line items by the platform when the order is created.

## Site preferences

There are 73 preferences in group `PluginSeller`. Each is listed with its default and range in [CONFIGURATION.md](CONFIGURATION.md).

## Not included (create them per environment)

- **The marketplace price book** (`sellerPriceBookId`). The import step creates it on first import. Assign it to the site in Merchant Tools › Products and Catalogs › Price Books.
- **Seller inventory lists.** They are created by the first inventory import. They do not need to be assigned to the site; the plugin addresses them by ID.
- **Business Manager role permissions** for the Marketplace modules.
- **Account Manager API client** (SCAPI_ADMIN strategy only), with role "Salesforce Commerce API", tenant scope and the scopes listed in [API_REFERENCE.md](API_REFERENCE.md#scapi-admin-calls-made-by-jobs).
- **SLAS client** for the Custom Shopper API, with scopes `c_mkt_shopper` and `c_mkt_seller`.
- **Account Manager client** for `marketplace-admin`, with scope `c_mkt_admin`.

## Import

```bash
# from the repository root, after renaming sites/RefArch_Practice if needed
npx @salesforce/b2c-cli job import ./metadata/plugin_seller
```

Or zip the folder, upload it to `Sites/Impex/src/instance/` and import it in Administration › Site Development › Site Import & Export.
