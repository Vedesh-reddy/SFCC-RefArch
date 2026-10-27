# Data model

All custom object types are **site-scoped**, `no-staging`, and defined in `metadata/plugin_analytics/meta/custom-objecttype-definitions.xml`. Days are `yyyyMMdd` in the site time zone. Money is integer cents (USD). Counters are `int` (32-bit); a single site-day above $21 million would overflow the cent fields.

| Type | Key | Written by | Grows with |
|---|---|---|---|
| `AnalyticsEventBatch` | `day_batchId` | Storefront (create only) | Traffic; removed on aggregation |
| `AnalyticsSiteDaily` | `yyyyMMdd` | Jobs | 1 per day |
| `AnalyticsProductDaily` | `yyyyMMdd_productId` | Jobs | Products with activity per day |
| `AnalyticsCategoryDaily` | `yyyyMMdd_categoryId` | Jobs | Categories with activity per day |
| `AnalyticsSearchDaily` | `yyyyMMdd_term` (spaces as `_`) | Jobs | Distinct terms per day |
| `AnalyticsJobCheckpoint` | job ID, `writer-lock` | Jobs | 6 records |
| `AnalyticsRanking` | `last-7`, `last-30`, `month`, `previous-month` | Rankings job | 4 records |

The prompt's `AnalyticsEventDedup` type is not needed: replays are stopped by the unique batch key, and unique-session markers live in the session (see [performance](analytics-performance.md)).

## AnalyticsSiteDaily

| Group | Fields |
|---|---|
| Discovery | `sessions`, `impressions`, `impressionSessions`, `selections`, `selectionSessions`, `views`, `viewSessions` |
| Cart | `cartAdds`, `unitsAdded`, `cartSessions` |
| Checkout | `checkoutStarts`, `checkoutFlows`, `shippingSubmits`, `shippingFlows`, `paymentSubmits`, `paymentFlows`, `completedFlows` (counted on the day the attempt began) |
| Orders | `orders`, `unitsSold`, `grossCents`, `discountCents`, `shippingCents`, `taxCents`, `totalCents`, `refundCents`, `netCents`, `cancelledOrders`, `refundedOrders` |
| Search | `searches`, `noResultSearches`, `searchSelections` |
| Collection | `batches`, `eventsAccepted`, `eventsRejected`, `eventsDropped`, `sampleRate` (lowest of the day) |

## AnalyticsProductDaily

`day`, `productId` (master or standalone product), `categoryId`, `impressions`, `uniqueImpressions`, `selections`, `uniqueSelections`, `views`, `uniqueViews`, `cartAdds`, `uniqueCartAdds`, `unitsAdded`, `orders` (orders containing the product), `unitsSold`, `grossCents`, `discountCents`, `refundCents`, `netCents`, `updatedAt`.

## AnalyticsCategoryDaily

`day`, `categoryId`, `impressions`, `selections`, `views`, `cartAdds`, `unitsAdded`, `orders`, `unitsSold`, `netCents`, `updatedAt`.

## Order attributes

| Attribute | Type | Set by |
|---|---|---|
| `analyticsFlowId` | string | `PlaceOrder` append (checkout attempt hash) |
| `analyticsFlowDay` | string | `PlaceOrder` append |
| `analyticsSessionToken` | string | `PlaceOrder` append (opaque token) |
| `analyticsSnapshot` | text | `Analytics-ReconcileOrders` |

## Attribution policies

| Topic | Policy |
|---|---|
| Variants | Every event and order line rolls up to the master product (`productId`). Products without variations are their own master |
| Category | One category per product: primary category, else classification category, else the master's. Category rows never add up to more than the site; parents are not rolled up |
| Order day | Order creation date in the site time zone |
| Refunds | Counted on the order's day (not the refund date). Source: `order.invoices` of type `RETURN`, `RETURN_CASE`, `APPEASEMENT` (`refundedAmount`), capped at the order total, spread over product lines by net amount |
| Cancellation | A cancelled order contributes only `cancelledOrders`; earlier sales are taken back |
| Gross / net | Gross = line base price × quantity before discounts; discounts = gross − prorated price (product and order discounts); net = gross − discounts − refunds. Shipping and tax are separate |
| Average order value | `totalCents / orders` (order totals incl. shipping and tax) |
| Currency | USD only; other orders and non-USD sites are skipped |
| Rounding | Cents are integers; rates are percentages rounded to one decimal |
