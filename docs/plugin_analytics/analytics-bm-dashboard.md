# Business Manager dashboard

**Merchant Tools › Storefront Analytics** (`bm_analytics`). Every page has a period filter: Today, Yesterday, Last 7 days, Last 30 days, Current month, Previous month, Custom range (`yyyy-MM-dd`, at most 366 days). Days are calendar days in the site time zone.

| Page | Menu action | Shows |
|---|---|---|
| Overview | `plugin-analytics-overview` | Impressions, selections, product page views, add-to-cart actions and units, checkout starts, orders, units sold, gross and net revenue, AOV, checkout completion, cart and checkout abandonment, selection rate — with the previous period and change; daily views and net revenue bars; daily table |
| Products | `plugin-analytics-products` | Searchable (product ID contains, category), sortable, paginated (50) product table; drill-down per product with daily figures |
| Rankings | `plugin-analytics-rankings` | 13 top/bottom 10 lists (see below) |
| Categories | `plugin-analytics-categories` | Category totals, parent category, conversion, best product by net revenue |
| Checkout funnel | `plugin-analytics-funnel` | 8 steps in session mode or event mode: count, step conversion, drop-off, share of first step; completion and abandonment |
| Orders | `plugin-analytics-orders` | Orders, units, gross, discounts, refunds, net, shipping, tax, totals, AOV, cancelled and refunded orders, daily trend |
| Search | `plugin-analytics-search` | Searches, no-result searches, product selections from search, search-to-product rate, top terms, no-result terms |
| Health | `plugin-analytics-health` | Enabled state, currency, time zone, sample rate, backlog, paused collection, writer lock, accepted/rejected/dropped events, last run of each job, integrity problems |
| CSV export | `plugin-analytics-export` | Daily site figures, products, categories, search terms |

Product, category, ranking and product/category/search exports cover at most 93 days.

## Rankings

| Top 10 | Bottom 10 |
|---|---|
| Most viewed (page views) | Lowest-selling (units, includes zero-sale catalog products) |
| Most selected | Lowest net revenue (includes zero-sale catalog products) |
| Most added to cart (actions, then units) | Least viewed (includes catalog products without views) |
| Best-selling (units, then net) | Most viewed without sales (≥ `analyticsMinRankingViews` sessions) |
| Highest net revenue | Often added to cart, poor conversion (≥ `analyticsMinRankingViews` adding sessions) |
| Highest converting (orders / viewing sessions, ≥ minimum sessions) | Impressions without selections (≥ `analyticsMinRankingImpressions`) |
| Best cart-to-purchase (orders / adding sessions, ≥ minimum sessions) | |

Ties are broken by a second metric and then by product ID, so lists are stable. For the four standard periods the page shows the lists stored by `Analytics-GenerateRankings`, which include online master/standalone catalog products without any activity. Other periods are computed live from the daily figures and only include products with activity. A "most wishlisted" list is not offered: the storefront has no base wishlist integration (see limitations).

## Notices on pages

- **Disabled** — analytics off or site currency not USD.
- **Sampled at N%** — event counts are not extrapolated; orders are complete.
- **N events dropped** — rate limit or paused collection.
- **Incomplete** — the period has more records than one page view reads.

## Example (Overview, last 7 days)

| Metric | This period | Previous period | Change |
|---|---|---|---|
| Product impressions | 48,210 | 45,100 | +6.9% |
| Product page views | 6,402 | 6,550 | -2.3% |
| Add-to-cart actions | 812 | 760 | +6.8% |
| Orders | 131 | 118 | +11.0% |
| Net revenue | $14,880.40 | $13,020.10 | +14.3% |
| Average order value | $121.06 | $117.31 | +3.2% |
| Checkout completion rate | 41.2% | 38.9% | +2.3 pts |

## Permissions

See [analytics-security.md](analytics-security.md#business-manager). Grant the menu actions per role in **Administration › Organization › Roles & Permissions › (role) › Business Manager Modules**, for each site.
