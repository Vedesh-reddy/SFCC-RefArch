# Configuration

All business values are site preferences in the group **Marketplace (plugin_seller)** (Merchant Tools › Site Preferences › Custom Preferences). The code reads them directly with `Site.getCurrent().getCustomPreferenceValue()`, as base SFRA does.

## Defaults and limits

- Defaults and integer ranges are part of the metadata (`default-value`, `min-value`, `max-value`). Business Manager applies the default when a value is not set, and refuses values outside the range.
- Approval and safety switches fail closed. Approval is skipped only when `sellerApprovalRequired`, `sellerProductApprovalRequired` or `sellerOfferApprovalRequired` is explicitly `false`. A clean scan is waived only when `sellerRequireCleanDocumentScan` is explicitly `false`.
- **Required** preferences have no default:
  - Without `sellerCurrency = USD` (and a site default currency of USD), the marketplace is off.
  - Without `sellerAgreementVersion`, registration is closed.
  - Without the catalog, price book and inventory IDs, provisioning and offer sync do nothing and log an error.
- Business Manager › Marketplace › Overview lists missing required preferences.
- Switching the marketplace off (`sellerMarketplaceEnabled = false`) does the following:
  - Seller Central and the Marketplace pages return "not available".
  - Offers disappear from the PDP.
  - Offer lines are refused at checkout.
  - Jobs exit with `DISABLED`.
  - No data is deleted, and first-party catalog and checkout are unaffected.

## Preferences

| Preference | Type | Default | Range / allowed values | Required |
|---|---|---|---|---|
| `sellerMarketplaceEnabled` | Boolean | `false` | — |  |
| `sellerRegistrationEnabled` | Boolean | `false` | — |  |
| `sellerCurrency` | String | — | USD | Yes |
| `sellerApprovalRequired` | Boolean | `true` | — |  |
| `sellerProductApprovalRequired` | Boolean | `true` | — |  |
| `sellerOfferApprovalRequired` | Boolean | `true` | — |  |
| `sellerAgreementVersion` | String | — | — | Yes |
| `sellerAgreementContentAssetId` | String | — | — |  |
| `sellerOtpLength` | Integer | `6` | 6 – 8 |  |
| `sellerOtpTtlMinutes` | Integer | `10` | 2 – 60 |  |
| `sellerOtpMaxAttempts` | Integer | `5` | 1 – 10 |  |
| `sellerOtpResendCooldownSeconds` | Integer | `60` | 30 – 3600 |  |
| `sellerOtpMaxSendsPerHour` | Integer | `5` | 1 – 20 |  |
| `sellerKycProvider` | Enum | `MANUAL` | MANUAL, EXTERNAL |  |
| `sellerBankVerificationProvider` | Enum | `MANUAL` | MANUAL, EXTERNAL |  |
| `sellerPayoutProvider` | Enum | `MANUAL` | MANUAL, EXTERNAL |  |
| `sellerDocumentScanProvider` | Enum | `NONE` | NONE, EXTERNAL |  |
| `sellerRequireCleanDocumentScan` | Boolean | `true` | — |  |
| `sellerRequiredDocumentTypes` | Set of strings | — | BUSINESS_REGISTRATION, TAX_CERTIFICATE, IDENTITY, BANK_PROOF, COMPLIANCE, OTHER |  |
| `sellerDocumentMaxBytes` | Integer | `5242880` | 10240 – 10485760 |  |
| `sellerDocumentAllowedTypes` | Set of strings | empty = PDF, PNG, JPEG | application/pdf, image/png, image/jpeg, image/webp |  |
| `sellerDocumentRetentionDays` | Integer | `2555` | 30 – 3650 |  |
| `sellerDocumentExpiryWarningDays` | Integer | `30` | 1 – 365 |  |
| `sellerSuspendOnExpiredDocuments` | Boolean | `false` | — |  |
| `sellerMaximumProducts` | Integer | `500` | 1 – 100000 |  |
| `sellerMaxImagesPerProduct` | Integer | `8` | 1 – 20 |  |
| `sellerImageMaxBytes` | Integer | `2097152` | 10240 – 10485760 |  |
| `sellerProductIdPattern` | String | `{sellerId}-{sku}` | — |  |
| `sellerMasterCatalogId` | String | — | — | Yes |
| `sellerSiteCatalogId` | String | — | — | Yes |
| `sellerAllowedCategoryIds` | Set of strings | empty = sellers cannot list | — |  |
| `sellerRestrictedCategoryIds` | Set of strings | — | — |  |
| `sellerAllowedTaxClassIds` | Set of strings | — | — |  |
| `sellerColorAttributeId` | String | `color` | — |  |
| `sellerSizeAttributeId` | String | `size` | — |  |
| `sellerPriceBookId` | String | — | — | Yes |
| `sellerSiteInventoryListId` | String | — | — | Yes |
| `sellerInventoryListPrefix` | String | `marketplace-` | — |  |
| `sellerProvisioningStrategy` | Enum | `IMPEX` | IMPEX, SCAPI_ADMIN |  |
| `sellerScapiOrganizationId` | String | — | — |  |
| `sellerProvisioningMaxAttempts` | Integer | `5` | 1 – 20 |  |
| `sellerProvisioningRetryMinutes` | Integer | `30` | 5 – 1440 |  |
| `sellerMinPriceCents` | Integer | `100` | 1 – 100000000 |  |
| `sellerMaxPriceCents` | Integer | `10000000` | 1 – 100000000 |  |
| `sellerPriceDeviationPercent` | Integer | `40` | 5 – 95 |  |
| `sellerFeaturedOfferStrategy` | Enum | `LOWEST_PRICE` | LOWEST_PRICE, WEIGHTED |  |
| `sellerFeaturedOfferWeights` | Text | — | JSON, weights sum to 100 |  |
| `sellerDefaultHandlingDays` | Integer | `2` | 0 – 30 |  |
| `sellerMaxHandlingDays` | Integer | `10` | 0 – 30 |  |
| `sellerShippingFeesEnabled` | Boolean | `false` | — |  |
| `sellerMaxShippingFeeCents` | Integer | `5000` | 0 – 100000 |  |
| `sellerMaxReturnDays` | Integer | `90` | 0 – 365 |  |
| `sellerOrderSyncLookbackHours` | Integer | `72` | 1 – 720 |  |
| `sellerSettlementHoldDays` | Integer | `14` | 0 – 180 |  |
| `sellerSettlementMinimumCents` | Integer | `1000` | 0 – 100000000 |  |
| `sellerOrderFeeCents` | Integer | `0` | 0 – 100000 |  |
| `sellerUpdateOrderShippingStatus` | Boolean | `false` | — |  |
| `sellerPerformanceWindowDays` | Integer | `90` | 7 – 365 |  |
| `sellerPerformanceMinOrders` | Integer | `20` | 1 – 100000 |  |
| `sellerMaxDefectRateBps` | Integer | `100` | 1 – 10000 |  |
| `sellerMaxLateShipmentRateBps` | Integer | `400` | 1 – 10000 |  |
| `sellerMaxCancellationRateBps` | Integer | `250` | 1 – 10000 |  |
| `sellerAutoSuspendOnBreach` | Boolean | `false` | — |  |
| `sellerNotificationChannels` | Set of strings | empty = INBOX | INBOX, EMAIL |  |
| `sellerNotificationMaxAttempts` | Integer | `5` | 1 – 20 |  |
| `sellerFromEmail` | String | — | — |  |
| `sellerAdminNotificationEmails` | Set of strings | — | — |  |
| `sellerApprovalReminderHours` | Integer | `48` | 1 – 720 |  |
| `sellerApiMaxPageSize` | Integer | `50` | 1 – 200 |  |
| `sellerWriteRateLimitPerHour` | Integer | `300` | 1 – 10000 |  |
| `sellerReportRateLimitPerDay` | Integer | `5` | 1 – 100 |  |
| `sellerWebhookToleranceSeconds` | Integer | `300` | 60 – 900 |  |
| `sellerRequestKeyRetentionDays` | Integer | `30` | 1 – 365 |  |

### What the preferences control

| Area | Preferences | Notes |
|---|---|---|
| Switches | `sellerMarketplaceEnabled`, `sellerRegistrationEnabled`, `sellerCurrency` | USD is the only currency; the site default currency must also be USD |
| Approval | `sellerApprovalRequired`, `sellerProductApprovalRequired`, `sellerOfferApprovalRequired` | When seller approval is off, a seller with verified identity and complete documents is approved automatically |
| Agreement | `sellerAgreementVersion`, `sellerAgreementContentAssetId` | Changing the version requires a new acceptance before submission |
| Verification codes | `sellerOtp*` | Codes are HMAC-hashed with a salt, bound to the session, single use |
| Providers | `sellerKycProvider`, `sellerBankVerificationProvider`, `sellerPayoutProvider`, `sellerDocumentScanProvider` | MANUAL/NONE keep a reviewer in the loop; EXTERNAL needs the hook in [API_REFERENCE.md](API_REFERENCE.md#provider-hooks) |
| Documents | `sellerRequiredDocumentTypes`, `sellerDocument*`, `sellerRequireCleanDocumentScan`, `sellerSuspendOnExpiredDocuments` | File types are checked by content, not by name |
| Catalog | `sellerMasterCatalogId`, `sellerSiteCatalogId`, `sellerAllowedCategoryIds`, `sellerRestrictedCategoryIds`, `sellerAllowedTaxClassIds`, `sellerProductIdPattern`, `sellerMaximumProducts`, `sellerMaxImagesPerProduct`, `sellerImageMaxBytes`, `sellerColorAttributeId`, `sellerSizeAttributeId` | Categories include their subcategories. An empty allowed list means sellers cannot list |
| Pricing and offers | `sellerPriceBookId`, `sellerMinPriceCents`, `sellerMaxPriceCents`, `sellerPriceDeviationPercent`, `sellerFeaturedOfferStrategy`, `sellerFeaturedOfferWeights` | Weights are JSON `{"price":…, "rating":…, "handling":…}` that sum to 100 |
| Inventory | `sellerSiteInventoryListId`, `sellerInventoryListPrefix` | The prefix plus the lowercase seller ID gives the seller list |
| Provisioning | `sellerProvisioningStrategy`, `sellerScapiOrganizationId`, `sellerProvisioningMaxAttempts`, `sellerProvisioningRetryMinutes` | SCAPI_ADMIN needs the organization ID and the Account Manager client |
| Shipping and returns | `sellerShippingFeesEnabled`, `sellerMaxShippingFeeCents`, `sellerDefaultHandlingDays`, `sellerMaxHandlingDays`, `sellerMaxReturnDays` | Seller fees are per item, waived above the seller's free-shipping amount |
| Finance | `sellerSettlementHoldDays`, `sellerSettlementMinimumCents`, `sellerOrderFeeCents`, `sellerOrderSyncLookbackHours`, `sellerUpdateOrderShippingStatus` | Commission rates are not preferences: they are commission rules (Marketplace › Finance) |
| Performance | `sellerPerformance*`, `sellerMax*RateBps`, `sellerAutoSuspendOnBreach` | Rates in basis points (100 = 1%) |
| Notifications | `sellerNotificationChannels`, `sellerNotificationMaxAttempts`, `sellerFromEmail`, `sellerAdminNotificationEmails`, `sellerApprovalReminderHours` | Admin messages always go by e-mail |
| API and abuse | `sellerApiMaxPageSize`, `sellerWriteRateLimitPerHour`, `sellerReportRateLimitPerDay`, `sellerWebhookToleranceSeconds`, `sellerRequestKeyRetentionDays` | |

## Commission rules

Commission rules live in Marketplace › Finance › Commission rules (custom object `MarketplaceCommissionRule`). Each rule has:

- **Scope**: SELLER, PROMOTION, CATEGORY, TIER or DEFAULT, plus a scope value.
- **Rate and fee**: a rate in basis points and a fixed fee per unit.
- **Selection**: a priority and an optional validity window.
- **Refunds**: whether commission is reversed on refunds.

The most specific scope wins, then the higher priority. Keep one DEFAULT rule active. Without any matching rule, no earnings are booked for the line and a case is opened.

Seller tiers (STANDARD, SILVER, GOLD, PLATINUM) are set per seller in Marketplace › Sellers.

## Services (Administration › Operations › Services)

| Service | Use | Credential |
|---|---|---|
| `plugin-seller.hmac` | Key for tax ID hashes and verification-code hashes (never called) | Password: at least 32 random characters |
| `plugin-seller.webhook` | Secret shared with providers for webhook signatures (never called) | Password: at least 32 random characters |
| `plugin-seller.am.oauth` | Account Manager token for SCAPI Admin provisioning | User = API client ID, password = client secret; the client needs the scopes in [API_REFERENCE.md](API_REFERENCE.md#scapi-admin-calls-made-by-jobs) |
| `plugin-seller.scapi.admin` | SCAPI host for provisioning | URL `https://<shortCode>.api.commercecloud.salesforce.com` |

Missing or short keys fail closed: verification codes cannot be issued, and webhooks are rejected.

## Jobs

All jobs are imported with their recurring triggers **disabled**. Enable and schedule them in Administration › Operations › Jobs. The intervals in `jobs.xml` are suggestions. Each step takes `MaxItems`.

| Job | Suggested interval | Notes |
|---|---|---|
| `MarketplaceSeller-ProvisionProducts` | 30 min | Prepare (site) → Import catalog, prices, inventory (organization) → Verify (site) |
| `MarketplaceSeller-SyncOffers` | 15 min | Prepare (site) → imports (organization) → Confirm (site) |
| `MarketplaceSeller-OrderSync` | 15 min | Watermark kept in `MarketplaceJobState` |
| `MarketplaceSeller-Settlements` | daily | `AutoRequestPayout` only with an EXTERNAL payout provider |
| `MarketplaceSeller-Performance` | daily | Cursor-based, wraps around |
| `MarketplaceSeller-Notifications` | 5 min | Exponential back-off |
| `MarketplaceSeller-Reminders` | daily | One admin reminder per run |
| `MarketplaceSeller-DocumentExpiry` | daily | |
| `MarketplaceSeller-Recovery` | hourly | `StalePayoutHours` |
| `MarketplaceSeller-Cleanup` | daily | Also purges documents past retention |

Replace the site ID `RefArch_Practice` in `jobs.xml` with your site before importing.
