'use strict';

import { assert } from 'chai';
import { config } from '../webdriver/wdio.conf';
import * as homePage from '../../mocks/testDataMgr/pageObjects/home';
import * as testDataMgr from '../../mocks/testDataMgr/main';
import * as common from '../../mocks/testDataMgr/helpers/common';
import * as productTile from '../../mocks/testDataMgr/pageObjects/productTile';


/*
 - Verify product tiles displayed on Home page as configured in Business Manager
 1. There are 5 product tiles displayed (base on current configuration in demo data)
 2. Product tiles are displayed in order specified in Business Manager.
 3. Each product tile should contain these information:
 - an image of the product
 - the image contains a link to the PDP page
 - the correct number of color swatch(es)
 - correct color swatch images
 - if product has more then 3 colors, only first 3 colors will be shown, follwed by ... notaion
   to indicate more color available
 - the "..." notation contains a link to PDP page to display the product in the selected color
 - Product name
 - Product name contains a link to the PDP page
 - list price (Note: The application is supposedly showing list price only for the time being,
   But for product that has both list and sale prices, it is showing sale price
   only currently. This is due to RAP-5171.)
 */

describe('Home - Product Tiles Display', () => {
    const locale = config.locale;
    const localeStr = locale === 'x_default' ? 'en_US' : locale;

    const baseUrl = config.baseUrl;

    const productMasterId1 = '25696513';
    const productVariantId1 = '701644329402';

    const productMasterId2 = '25697682';
    const productVariantId2 = '701644391737';

    const productMasterId3 = '25604524';
    const productVariantId3 = '750518699578';

    const productMasterId4 = '25519318';

    const productMasterId5 = '25720054';
    const productVariantId5 = '013742003154';

    // This flag is to indicate whether Quickview is expected to be present.
    // Currently it is only available on desktop and tablet-landscape.
    let isQuickViewExpected = false;


    before(() => {
        return testDataMgr.load()
            .then(() => homePage.navigateTo())
            .then(() => common.isQuickViewExpected())
            .then(expectedFlag => {
                isQuickViewExpected = expectedFlag;
            });
    });

    function verifyQuickView(productId) {
        if (!isQuickViewExpected) {
            return Promise.resolve();
        }
        // verify QuickView image url and link
        return productTile.getProductTileQuickViewImageSrc(productId)
            .then(qViewImageSrc => {
                assert.isTrue(qViewImageSrc.endsWith('/images/quickview.png'), 'Quick View image: url not end with /images/quickview.png.');
            })
            .then(() => productTile.getProductTileQuickViewImageHref(productId))
            .then(quickViewLink => {
                const expLinkEnding = '/Product-ShowQuickView?pid=' + productId;
                assert.isTrue(quickViewLink.endsWith(expLinkEnding), 'Quick View link: url not end with ' + expLinkEnding);
            });
    }

    it('Should display 5 product tiles.', function () {
        return homePage.getProductTileCount()
            .then(count => {
                assert.equal(count, 5, 'Expected the number of product tiles to be 5.');
            });
    });

    it('Product tile 1 - product variant of single color.', function () {
        const productMaster = testDataMgr.getProductById(productMasterId1);
        const expectedDisplayName = productMaster.getLocalizedProperty('displayName', locale);

        return productTile.getProductTileImageSrc(productVariantId1)
            .then(imageSrc => {
                assert.isTrue(imageSrc.endsWith('/images/medium/PG.10251227.JJE86XX.PZ.jpg'), 'product image: url not end with /images/medium/PG.10251227.JJE86XX.PZ.jpg.');
            })

            .then(() => productTile.getProductTileImageHref(productVariantId1))
            .then(imageLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId1 + '.html?lang=' + localeStr;
                assert.equal(imageLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => verifyQuickView(productVariantId1))

            .then(() => productTile.getProductTileColorSwatchCount(productVariantId1))
            .then(count => {
                assert.equal(count, 1, 'Expected: the number of color swatch to be 1.');
            })

            .then(() => productTile.getProductTileColorSwatchUrls(productVariantId1))
            .then(swatchUrls => {
                assert.isTrue(swatchUrls[0].endsWith('/images/swatch/PG.10251227.JJE86XX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10251227.JJE86XX.CP.jpg.');
            })

            .then(() => productTile.getProductTileProductName(productVariantId1))
            .then(productName => {
                assert.equal(productName, expectedDisplayName, 'Expected: displayed product name = ' + expectedDisplayName);
            })

            .then(() => productTile.getProductTileProductNameHref(productVariantId1))
            .then(nameLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId1 + '.html?lang=' + localeStr;
                assert.equal(nameLink, expectedLink, 'Expected: product name link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductPrice(productVariantId1))
            .then(price => {
                const expectedListedPrice = testDataMgr.getPricesByProductId(productVariantId1, locale).list;
                assert.equal(price, expectedListedPrice, 'Expected: list price = ' + expectedListedPrice);
            });
    });

    it('Product tile 2 - product variant of multiple colors.', function () {
        const productMaster = testDataMgr.getProductById(productMasterId2);
        const expectedDisplayName = productMaster.getLocalizedProperty('displayName', locale);

        return productTile.getProductTileImageSrc(productVariantId2)
            .then(imageSrc => {
                assert.isTrue(imageSrc.endsWith('/images/medium/PG.10256582.JJI15XX.PZ.jpg'), 'product image: url not end with /images/medium/PG.10256582.JJI15XX.PZ.jpg.');
            })

            .then(() => productTile.getProductTileImageHref(productVariantId2))
            .then(imageLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId2 + '.html?lang=' + localeStr;
                assert.equal(imageLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => verifyQuickView(productVariantId2))

            .then(() => productTile.getProductTileColorSwatchCount(productVariantId2))
            .then(count => {
                assert.equal(count, 2, 'Expected: the number of color swatch to be 2.');
            })

            .then(() => productTile.getProductTileColorSwatchUrls(productVariantId2))
            .then(swatchUrls => {
                assert.isTrue(swatchUrls[0].endsWith('/images/swatch/PG.10256582.JJAE6A0.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10256582.JJAE6A0.CP.jpg.');
                assert.isTrue(swatchUrls[1].endsWith('/images/swatch/PG.10256582.JJI15XX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10256582.JJI15XX.CP.jpg.');
            })

            .then(() => productTile.getProductTileProductName(productVariantId2))
            .then(productName => {
                assert.equal(productName, expectedDisplayName, 'Expected: displayed product name = ' + expectedDisplayName);
            })

            .then(() => productTile.getProductTileProductNameHref(productVariantId2))
            .then(nameLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId2 + '.html?lang=' + localeStr;
                assert.equal(nameLink, expectedLink, 'Expected: product name link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductPrice(productVariantId2))
            .then(price => {
                const expectedListedPrice = testDataMgr.getPricesByProductId(productVariantId2, locale).list;
                assert.equal(price, expectedListedPrice, 'Expected: list price = ' + expectedListedPrice);
            });
    });

    it('Product tile 3 - product variant with list and sale prices.', function () {
        const productMaster = testDataMgr.getProductById(productMasterId3);
        const expectedDisplayName = productMaster.getLocalizedProperty('displayName', locale);

        return productTile.getProductTileImageSrc(productVariantId3)
            .then(imageSrc => {
                assert.isTrue(imageSrc.endsWith('/images/medium/PG.52001RUBN4Q.BLACKFB.PZ.jpg'), 'product image: url not end with /images/medium/PG.52001RUBN4Q.BLACKFB.PZ.jpg.');
            })

            .then(() => productTile.getProductTileImageHref(productVariantId3))
            .then(imageLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId3 + '.html?lang=' + localeStr;
                assert.equal(imageLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => verifyQuickView(productVariantId3))

            .then(() => productTile.getProductTileColorSwatchCount(productVariantId3))
            .then(count => {
                assert.equal(count, 1, 'Expected product tile 3: the number of color swatch to be 1.');
            })

            .then(() => productTile.getProductTileColorSwatchUrls(productVariantId3))
            .then(swatchUrls => {
                assert.isTrue(swatchUrls[0].endsWith('/images/swatch/PG.52001RUBN4Q.BLACKFB.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.52001RUBN4Q.BLACKFB.CP.jpg.');
            })

            .then(() => productTile.getProductTileProductName(productVariantId3))
            .then(productName => {
                assert.equal(productName, expectedDisplayName, 'Expected: displayed product name = ' + expectedDisplayName);
            })

            .then(() => productTile.getProductTileProductNameHref(productVariantId3))
            .then(nameLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId3 + '.html?lang=' + localeStr;
                assert.equal(nameLink, expectedLink, 'Expected: product name link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductPrice(productVariantId3))
            .then(price => {
                // Currently MFSG only display one price.  Will need to add check for list price once implemented

                const expectedSalePrice = testDataMgr.getPricesByProductId(productVariantId3, locale).sale;
                assert.equal(price, expectedSalePrice, 'Expected: sale price = ' + expectedSalePrice);
            });
    });

    it('Product tile 4 - master product with more then 3 colors.', function () {
        const productMaster = testDataMgr.getProductById(productMasterId4);
        const expectedDisplayName = productMaster.getLocalizedProperty('displayName', locale);

        return productTile.getProductTileImageSrc(productMasterId4)
            .then(imageSrc => {
                assert.isTrue(imageSrc.endsWith('/images/medium/PG.10221714.JJ169XX.PZ.jpg'), 'product image: url not end with /images/medium/PG.10221714.JJ169XX.PZ.jpg.');
            })

            .then(() => productTile.getProductTileImageHref(productMasterId4))
            .then(imageLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productMasterId4 + '.html?lang=' + localeStr;
                assert.equal(imageLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => verifyQuickView(productMasterId4))

            .then(() => productTile.getProductTileColorSwatchCount(productMasterId4))
            .then(count => {
                assert.equal(count, 3, 'Expected product tile 4: the number of color swatch to be 3.');
            })

            .then(() => productTile.getProductTileColorSwatchUrls(productMasterId4))
            .then(swatchUrls => {
                assert.isTrue(swatchUrls[0].endsWith('/images/swatch/PG.10221714.JJ169XX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10221714.JJ169XX.CP.jpg.');
                assert.isTrue(swatchUrls[1].endsWith('/images/swatch/PG.10221714.JJ370XX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10221714.JJ370XX.CP.jpg.');
                assert.isTrue(swatchUrls[2].endsWith('/images/swatch/PG.10221714.JJ8UTXX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.10221714.JJ8UTXX.CP.jpg.');
            })

            .then(() => productTile.getProductTileMoreColorSwatch(productMasterId4))
            .then(moreColorSymbol => {
                assert.equal(moreColorSymbol, '...', 'Expected to display ... after the third color swatch.');
            })

            .then(() => productTile.getProductTileMoreColorSwatchHref(productMasterId4))
            .then(moreSwatchLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productMasterId4 + '.html?lang=' + localeStr;
                assert.equal(moreSwatchLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductName(productMasterId4))
            .then(productName => {
                assert.equal(productName, expectedDisplayName, 'Expected: displayed product name = ' + expectedDisplayName);
            })

            .then(() => productTile.getProductTileProductNameHref(productMasterId4))
            .then(nameLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productMasterId4 + '.html?lang=' + localeStr;
                assert.equal(nameLink, expectedLink, 'Expected: product name link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductPrice(productMasterId4))
            .then(price => {
                const expectedListedPrice = testDataMgr.getPricesByProductId(productMasterId4, locale).list;
                assert.equal(price, expectedListedPrice, 'Expected list price = ' + expectedListedPrice);
            });
    });

    it('Product tile 5 -  master product with single variant.', function () {
        const productMaster = testDataMgr.getProductById(productMasterId5);
        const expectedDisplayName = productMaster.getLocalizedProperty('displayName', locale);

        return productTile.getProductTileImageSrc(productVariantId5)
            .then(imageSrc => {
                assert.isTrue(imageSrc.endsWith('/images/medium/PG.60119273.JJG03XX.PZ.jpg'), 'product image: url not end with /images/medium/PG.60119273.JJG03XX.PZ.jpg.');
            })

            .then(() => productTile.getProductTileImageHref(productVariantId5))
            .then(imageLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId5 + '.html?lang=' + localeStr;
                assert.equal(imageLink, expectedLink, 'Expected: image link = ' + expectedLink);
            })

            .then(() => verifyQuickView(productVariantId5))

            .then(() => productTile.getProductTileColorSwatchCount(productVariantId5))
            .then(count => {
                assert.equal(count, 1, 'Expected product tile 5: the number of color swatch to be 1.');
            })

            .then(() => productTile.getProductTileColorSwatchUrls(productVariantId5))
            .then(swatchUrls => {
                assert.isTrue(swatchUrls[0].endsWith('/images/swatch/PG.60119273.JJG03XX.CP.jpg'), 'product swatch image: url not end with /images/swatch/PG.60119273.JJG03XX.CP.jpg.');
            })

            .then(() => productTile.getProductTileProductName(productVariantId5))
            .then(productName => {
                assert.equal(productName, expectedDisplayName, 'Expected: displayed product name = ' + expectedDisplayName);
            })

            .then(() => productTile.getProductTileProductNameHref(productVariantId5))
            .then(nameLink => {
                const expectedLink = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName) + '/' + productVariantId5 + '.html?lang=' + localeStr;
                assert.equal(nameLink, expectedLink, 'Expected: product name link = ' + expectedLink);
            })

            .then(() => productTile.getProductTileProductPrice(productVariantId5))
            .then(price => {
                const expectedListedPrice = testDataMgr.getPricesByProductId(productVariantId5, locale).list;
                assert.equal(price, expectedListedPrice, 'Expected list price = ' + expectedListedPrice);
            });
    });
});
