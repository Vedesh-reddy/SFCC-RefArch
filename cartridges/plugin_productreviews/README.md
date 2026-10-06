# Product reviews

An SFRA overlay for product ratings and customer reviews. Install it before
`app_storefront_base` in the site's cartridge path. It uses the repository's
root `package.json`, build configuration, and `dw.json`.

## Behavior

- Guests can read approved reviews. Customers must sign in to submit or edit.
- Each customer has one review per product per site. Variants and variation
  groups share their master product's reviews; bundles and sets have their own.
- Reviews contain a 1–5 star rating, public display name, title, and plain text.
  Customer numbers and custom object keys are never exposed publicly.
- Approval is required by default. Editing a published review returns it to
  pending and removes it from public totals until approved again.
- Product detail pages show the average, star distribution, and five reviews
  per page, ordered by latest submission. Pending and rejected reviews are
  excluded from all public totals.
- The customer-specific form is fetched separately with caching disabled,
  keeping customer identity and CSRF tokens out of cached product pages.
- The full reviews page also supports reading, pagination and form submission
  without JavaScript. Login and registration return to the product.
- A customer can update a product's review at most once per minute. This is a
  duplicate-submission guard, not a general bot mitigation service.

## Installation

1. Run `npm run build` from the repository root. Both base storefront and review
   assets are built; generated files live under each cartridge's `cartridge/static`.
2. Import the metadata archive in **Administration → Site Development → Site
   Import & Export**. Create the ZIP from the repository root:

   ```sh
   cd metadata
   zip -r /tmp/product-reviews.zip product-reviews
   ```

   The ZIP contains `product-reviews/meta/custom-objecttype-definitions.xml` and
   `product-reviews/meta/system-objecttype-extensions.xml`. It defines a site-scoped
   `ProductReview` custom object and the `ProductReviews` site preference group.
   It imports definitions only; it contains no customer data or site IDs.
3. Upload the code and compiled static assets using your usual deployment process.
   `npm run uploadCartridge` now includes `plugin_productreviews`. It uses the root
   `dw.json`. Activate the uploaded code version if necessary.
   The deployed controller must be at
   `<code-version>/plugin_productreviews/cartridge/controllers/Reviews.js`.
   Do not upload an additional `cartridges/plugin_productreviews` directory inside
   the deployed plugin; that nested scaffold cannot register the review controller.
4. In **Administration → Sites → Manage Sites → your site → Settings**, insert
   `plugin_productreviews` before `app_storefront_base`, for example:

   ```text
   plugin_productreviews:app_storefront_base:modules
   ```

   Preserve any other cartridges already in your site's path. Any custom cartridge
   ahead of this plugin that overrides the same templates must include the review
   widget explicitly.
5. In **Merchant Tools → Site Preferences → Custom Site Preference Groups → Product Reviews**,
   enable product reviews and leave approval enabled unless immediate publication
   is intended. Clear the site's page cache after the first installation or after
   changing the enabled preference, so cached product pages pick up the widget.

`npm run watch:reviews` watches this plugin's client source and uploads changes.
The regular `npm run watch` continues to watch the base storefront client source.

## Moderation

In the appropriate site, open **Merchant Tools → Custom Objects → Manage Custom Objects** and choose `ProductReview`. Search for `status = pending`, or filter by
`productID` / `customerNo`. Open a review, inspect its text, and change `status`:

| Status | Storefront behavior |
| --- | --- |
| `pending` | Visible only to the author in their edit form |
| `approved` | Published and included in the average and histogram |
| `rejected` | Hidden; the author can revise and resubmit |

Save the custom object. The next review-panel request reflects the change; review
fragments and aggregates are not cached. Give moderators the appropriate Manage Custom Objects permission. There is no public moderation endpoint.

Disabling approval affects **future submissions**, not already pending reviews.
The objects use `no-staging`, so customer reviews aren't replaced by data
replication. Do not change `reviewID`, `productID` or `customerNo` while moderating.
To remove a review entirely, delete its object in the editor. A customer's reviews
can be found by `customerNo` for account data removal; automatic account-deletion
integration is not provided by this cartridge.

## Integration points

- `Reviews-Show`: accessible full reviews page (`pid`, optional `page`).
- `Reviews-List`: uncached HTML fragment with reviews and the current customer's form.
- `Reviews-Submit`: HTTPS POST, authenticated customer and valid CSRF required.
- `Reviews-Login` / `Reviews-Return`: product-aware sign-in round trip.
- `product/components/descriptionAndDetails`: includes the widget on standard,
  bundle, and standard Page Designer dynamic product details.
- `product/setDetails`: includes the widget once for the complete set.
- `product/components/pidRating`: replaces the placeholder PDP rating with the
  review link, which updates with real totals when the panel loads. Quick views
  and nested bundle/set items link to the full reviews page.
- Login redirect slot **3** is reserved for `Reviews-Return`; existing slots 1
  and 2 are inherited from the base cartridge.

Personal responses expire through SFCC's `Response.setExpires` API. The platform
generates the cache headers; setting `Cache-Control` or `Pragma` directly through
`setHttpHeader` is not supported. Rate-limit responses use HTTP 429 and a JSON
`retryAfter` value of 60 seconds.

Custom Page Designer layouts that don't use these templates need an explicit
`reviews/widget` include with the page's `product` model. Product listing tile
ratings and structured-data ratings are not changed by this plugin.

## Validation

```sh
npm run test:reviews
npm test
npm run build
```

The unit tests mock SFCC platform services; they do not replace sandbox testing.
After installation, check this complete workflow on your sandbox:

1. Open a simple product and a variant as a guest. Check the empty state and login link.
2. Sign in from the widget. Submit a review; confirm the author sees pending status
   and a different customer cannot see it publicly.
3. Approve it in the site's Manage Custom Objects page. Reload the product and verify the
   text, stars, count and average. Check that another variant shows the same review.
4. Edit the review after a minute. Confirm there is still only one custom object
   and it returns to pending; reject and then resubmit it.
5. Submit invalid ratings/lengths, an expired CSRF token, and a signed-out request.
   Confirm no write occurs and failures are understandable.
6. Create more than five approved reviews with different customers. Check pagination
   and averages; confirm rejected and pending reviews do not contribute.
7. Test a bundle, set, and Page Designer PDP, then the full reviews page with
   JavaScript disabled. Check keyboard navigation and a narrow screen.
8. Turn off approval and verify immediate publication of a new submission. Disable
   reviews and clear the page cache; the widget should disappear and submissions
   should be rejected.

The metadata was validated against Salesforce's [metadata schema](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/xsd/metadata.xsd).
Storage uses [CustomObjectMgr](https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-script-api/dw.object.CustomObjectMgr.html)
and closes [SeekableIterator](https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_util_SeekableIterator.html)
resources after reading. Counts use database queries per rating bucket; lists only
materialize one page. High-traffic sites should measure query latency and may need
an aggregate strategy with explicit invalidation on moderation.
