# Storefront Reference Architecture (SFRA)

## Product reviews extension

This workspace includes `plugin_productreviews` for customer ratings, authenticated
review submissions and editing, and Business Manager approval. It extends standard
and Page Designer product details while keeping personal review forms out of cached pages.

[Setup and screenshot gallery](cartridges/plugin_productreviews/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-reviews-cartridge)

![Customer reviews on the storefront](cartridges/plugin_productreviews/docs/images/reviews-guest.png)

Configure it at **Merchant Tools → Site Preferences → Custom Site Preference Groups → Product Reviews**.
Moderate submissions at **Merchant Tools → Custom Objects → Manage Custom Objects**.

## Custom wishlist extension

This workspace includes `plugin_customwishlist`. Signed-in shoppers save products to a
wishlist. A scheduled job compares saved prices with the price books and, when a price
drops, emails the shopper and shows a popup at their next sign-in.

[Setup and screenshot walkthrough](cartridges/plugin_customwishlist/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-custom-wishlist)

![Price-drop popup after sign-in](cartridges/plugin_customwishlist/docs/images/price-drop-popup.png)

Run the check at **Administration → Operations → Jobs → CustomWishlist-PriceDropCheck**.

## Shopping assistant chat widget

This workspace includes `plugin_chatwidget`, a shopping and account assistant in the
corner of every page. Shoppers browse, search, manage the cart and account, check out
with a saved card, and review the order inside the widget. Each journey is recorded in
privacy-safe custom objects that merchants read in Business Manager.

[Setup and screenshot walkthrough](cartridges/plugin_chatwidget/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-chat-widget)

![Shopping assistant on the storefront](cartridges/plugin_chatwidget/docs/images/storefront-widget-open.png)

Orders placed in the widget are real SFCC orders: the walkthrough includes the store's
confirmation email for order 00000102 placed through the assistant.

Read journeys at **Merchant Tools → Custom Objects → Manage Custom Objects → ChatWidgetJourney**.

## Smart commerce features

This workspace includes `plugin_smartcommerce`: email-code sign-in and registration,
product price history with the lowest price in 30 days, price-drop and back-in-stock alerts,
product comparison, order tracking without an account, a 15-minute order modification window,
store pickup with a pickup code verified in Business Manager, and price lock.

[Feature guide with screenshots](cartridges/plugin_smartcommerce/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-smart-commerce)

![Product page panel with price history, alerts, store pickup and price lock](cartridges/plugin_smartcommerce/docs/images/pdp-panel.png)

Run the jobs at **Administration → Operations → Jobs → SmartCommerce-PriceHistory** and
**SmartCommerce-Hourly**. Verify pickups at **Merchant Tools → Smart Commerce → Store Pickup Desk**.

## Social gifting

This workspace includes `plugin_socialgifting`: event registries with exact product variants,
reservations with double-gift protection, comments, polls, collaborator invitations, group gifts and
a private gift checkout that keeps the recipient's address hidden.

[Feature guide with sandbox screenshots](https://github.com/Vedesh-reddy/sfcc-social-gifting#features) ·
[Installation and integration guide](cartridges/plugin_socialgifting/README.md)

![Public registry page](cartridges/plugin_socialgifting/docs/screenshots/registry-guest-view.png)

Import `metadata/social-gifting` before adding the cartridge to the site path.

## Affiliate rewards (AffiliateX)

This workspace includes `plugin_affiliateproduct`: customers generate a permanent affiliate code,
share product links, and earn a single-use 10% voucher for each referred order that is paid,
delivered and past its return window. Referral codes can also be entered at checkout, referred
orders must be prepaid, and vouchers work only for the affiliate who earned them.

[Feature guide with sandbox screenshots](cartridges/plugin_affiliateproduct/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-affiliate-product)

![Affiliate dashboard with a rewarded referral and a redeemed voucher](cartridges/plugin_affiliateproduct/docs/images/dashboard-history.png)

Import `metadata/affiliate-product`, then schedule **AffiliateProduct-ProcessRewards** and
**AffiliateProduct-MaintainRewards** at **Administration → Operations → Jobs**.

## Loyalty program

This workspace includes `plugin_loyalty`: shoppers earn 5% of every delivered order back as points
(10 points = 1), redeem them at checkout from 100 points for up to 50% of an order, climb Silver, Gold
and Platinum tiers that earn more, and collect welcome, birthday, profile and review bonuses. Points
expire after 12 months, oldest first, with a reminder.

[Feature guide with sandbox screenshots](cartridges/plugin_loyalty/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-loyalty-program)

![My Points with earned, refunded and bonus points](cartridges/plugin_loyalty/docs/images/dashboard-gold.png)

Import `metadata/loyalty-program`, then schedule **Loyalty-ProcessOrders** and **Loyalty-Maintain**.

## Rentals

This workspace includes `plugin_rentals`: rent pieces such as lehengas, sherwanis and jewellery
sets for 3, 5 or 7 days. Every physical unit has its own calendar with cleaning days between
rentals, and a custom object unique key stops two shoppers from booking the same day. Shoppers
pick dates on the product page, pay a refundable deposit and can book a size trial. The
Business Manager Rental Desk runs dispatch, returns, damage inspection with photos and deposit
refunds, and a job charges late fees.

[Feature guide with sandbox screenshots](cartridges/plugin_rentals/README.md) ·
[Dedicated repository and code documentation](https://github.com/Vedesh-reddy/sfcc-rentals)

![Rental dates and live availability on the product page](cartridges/plugin_rentals/docs/images/pdp-rental-dates.png)

Import `metadata/rentals`, then schedule **Rentals-ReleaseHolds** and **Rentals-LateFees** at
**Administration → Operations → Jobs**.

This is a repository for the Storefront Reference Architecture reference application.

Storefront Reference Architecture has a base cartridge (`app_storefront_base`) provided by Commerce Cloud that is never directly customized or edited. Instead, customization cartridges are layered on top of the base cartridge. This change is intended to allow for easier adoption of new features and bug fixes.
Storefront Reference Architecture supplies an [plugin_applepay](https://github.com/SalesforceCommerceCloud/plugin-applepay) plugin cartridge to demonstrate how to layer customizations for the reference application.

Your feedback on the ease-of-use and limitations of this new architecture is invaluable during the developer preview. Particularly, feedback on any issues you encounter or workarounds you develop for efficiently customizing the base cartridge without editing it directly.

# The latest version

The latest version of SFRA is 8.0.0

# Getting Started

1. Clone this repository.

2. Run `npm install` to install all of the local dependencies (SFRA has been tested with v24.x)

3. Run `npm run compile:js` from the command line that would compile all client-side JS files. Run `npm run compile:scss` and `npm run compile:fonts` that would do the same for css and fonts.

4. Create `dw.json` file in the root of the project. Providing a [WebDAV access key from BM](https://documentation.b2c.commercecloud.salesforce.com/DOC1/index.jsp?topic=%2Fcom.demandware.dochelp%2Fcontent%2Fb2c_commerce%2Ftopics%2Fadmin%2Fb2c_access_keys_for_business_manager.html) in the `password` field is optional, as you will be prompted if it is not provided.

```json
{
    "hostname": "your-sandbox-hostname.demandware.net",
    "username": "AM username like me.myself@company.com",
    "password": "your_webdav_access_key",
    "code-version": "version_to_upload_to"
}
```

5. Run `npm run uploadCartridge`. It will upload `app_storefront_base`, `modules` and `bm_app_storefront_base` cartridges to the sandbox you specified in `dw.json` file.

6. Use https://github.com/SalesforceCommerceCloud/storefrontdata to zip and import site data on your sandbox.

7. Add the `app_storefront_base` cartridge to your cartridge path in _Administration > Sites > Manage Sites > RefArch - Settings_ (Note: This should already be populated by the sample data in Step 6).

8. You should now be ready to navigate to and use your site.

# NPM scripts

Use the provided NPM scripts to compile and upload changes to your Sandbox.

## Compiling your application

-   `npm run compile:scss` - Compiles all .scss files into CSS.
-   `npm run compile:js` - Compiles all .js files and aggregates them.
-   `npm run compile:fonts` - Copies all needed font files. Usually, this only has to be run once.

If you are having an issue compiling scss files, try running 'npm rebuild node-sass' from within your local repo.

## Linting your code

`npm run lint` - Execute linting for all JavaScript and SCSS files in the project. You should run this command before committing your code.

## Watching for changes and uploading

`npm run watch` - Watches everything and recompiles (if necessary) and uploads to the sandbox. Requires a valid `dw.json` file at the root that is configured for the sandbox to upload.

## Uploading

`npm run uploadCartridge` - Will upload `app_storefront_base`, `modules` and `bm_app_storefront_base` to the server. Requires a valid `dw.json` file at the root that is configured for the sandbox to upload.

`npm run upload <filepath>` - Will upload a given file to the server. Requires a valid `dw.json` file.

# Testing

## Running unit tests

You can run `npm test` to execute all unit tests in the project. Run `npm run cover` to get coverage information. Coverage will be available in `coverage` folder under root directory.

-   UNIT test code coverage:

1. Open a terminal and navigate to the root directory of the mfsg repository.
2. Enter the command: `npm run cover`.
3. Examine the report that is generated. For example: `Writing coverage reports at [/Users/yourusername/SCC/sfra/coverage]`
4. Navigate to this directory on your local machine, open up the index.html file. This file contains a detailed report.

## Running integration tests

Integration tests are located in the `storefront-reference-architecture/test/integration` directory.

To run integration tests you can use the following command:

```
npm run test:integration
```

**Note:** Please note that short form of this command will try to locate URL of your sandbox by reading `dw.json` file in the root directory of your project. If you don't have `dw.json` file, integration tests will fail.
sample `dw.json` file (this file needs to be in the root of your project)

```json
{
    "hostname": "devxx-sitegenesis-dw.demandware.net"
}
```

You can also supply URL of the sandbox on the command line:

```
npm run test:integration -- --baseUrl devxx-sitegenesis-dw.demandware.net
```

## Running acceptance tests

**Prerequisite:** The Java Runtime Environment (JRE 8+) is required to run Selenium and the acceptance tests. If you have not done so, install Java on your machine.

Acceptance tests are located in the `storefront-reference-architecture/test/acceptance` directory.

The acceptance tests will run against the site specified in the hostname property of `dw.json`. ie. To run the tests on `abcd-123.dx.commercecloud.salesforce.com`, in your dw.json set the following:

```
"hostname": "abcd-123.dx.commercecloud.salesforce.com"
```

There are several NPM scripts available for running the acceptance tests.

Tests will generally run on Chrome, Safari, and Firefox. To change the browser the tests are run in, add `-- --profile=safari` ie. `npm run test:acceptance:smoke -- --profile=safari`

To run the tests in chrome headless mode, set a HEADLESS environment to true before starting the npm run. ie. `HEADLESS=true && npm run test:acceptance:smoke -- --profile=chrome`

-   `test:acceptance:custom` - runs all tests (Note: some tests will fail as the browser size defaults to desktop)
-   `test:acceptance:deep` - runs all storefront tests
-   `test:acceptance:smoke` - runs happy path tests
-   `test:acceptance:pagedesigner` - runs page designer tests
-   `test:acceptance:desktop` - runs storefront desktop tests
-   `test:acceptance:mobile` - runs storefront mobile tests
-   `test:acceptance:tablet` - runs storefront tablet tests

### Notes

-   Selenium can be finicky to start. If the tests fail to start, simply rerun the command again until the tests start.
-   If you see version compatibility issues between browser and the driver, try configuring specific version of the driver in the [codecept config file](./codecept.conf.js). See the resolved [github issue](https://github.com/codeceptjs/CodeceptJS/issues/2885) for details.

#### Running the tests in Safari

After every test, Webdriverio's automated drivers will close and start a new safaridriver instance. Sometimes, the existing safaridriver does not close before webdriverio attempts to start a new instance and the test execution will error out because the selected port is still in use.

To workaround this:
-   In a separate terminal manually start the safaridriver: `safaridriver -p 4444`
-   In codecept.conf.js, update the Webdriver helper to point to `port: 4444,`. This will [force webdriverio to use your safaridriver instance for every test.](https://webdriver.io/docs/driverbinaries#safaridriver)
-   Start the tests: `npm run test:acceptance:smoke -- --profile=safari`

# [Contributing to SFRA](./CONTRIBUTING.md)

# Page Designer Components for Storefront Reference Architecture

See: [Page Designer Components](./page-designer-components.md)

# Bootstrap 5 Migration

See: [Bootstrap 5 Migration Guide](./bootstrap-5-migration.md)
