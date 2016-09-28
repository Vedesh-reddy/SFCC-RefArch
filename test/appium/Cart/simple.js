'use strict';

import {assert} from 'chai';
import * as cartPage from '../../mocks/testDataMgr/pageObjects/cart';
import * as common from '../../mocks/testDataMgr/helpers/common';
import * as productDetailPage from '../../mocks/testDataMgr/pageObjects/productDetail';
import * as productQuickViewPage from '../../mocks/testDataMgr/pageObjects/productQuickView';
import * as testDataMgr from '../../mocks/testDataMgr/main';
import * as products from '../../mocks/testDataMgr/products';


describe('Cart - Simple', () => {
    let catalog;
    let productVariationMaster;
    let resourcePath;
    let itemRow = 1;
    let variant1 = {
        instance: undefined,
        color: {
            index: undefined,
            displayValue: undefined
        },
        size: {
            index: undefined,
            displayValue: undefined
        },
        width: {
            index: undefined,
            displayValue: undefined
        }
    };
    let variant2 = {
        instance: undefined,
        color: {
            index: undefined,
            displayValue: undefined
        },
        size: {
            index: undefined,
            displayValue: undefined
        },
        width: {
            index: undefined,
            displayValue: undefined
        }
    };

    //This price is after updated the product quantity the new total
    let updatedPrice = {
        'x_default': '$149.97',
        'en_GB': '£95.97',
        'fr_FR': '107,97 €',
        'it_IT': '€ 107,97',
        'ja_JP': '¥ 18,084',
        'zh_CN': '¥960.00'
    };

    before(() => {
        return testDataMgr.load()
            .then(() => {
                productVariationMaster = testDataMgr.getProductVariationMaster();
                return browser.url(productVariationMaster.getUrlResourcePath());
            })
            .then(() => {
                let variantIds;
                let variant1Selection = new Map();
                catalog = testDataMgr.parsedData.catalog;
                variantIds = productVariationMaster.getVariantProductIds();

                // No-Iron Textured Dress Shirt (Color: White, Size: 14 1/2, Width: 32/33)
                variant1.instance = products.getProduct(catalog, variantIds[0]);
                // No-Iron Textured Dress Shirt (Color: White, Size: 17 1/2, Width: 34/35)
                variant2.instance = products.getProduct(catalog, variantIds[10]);

                // We must increment the index by 1 for the attribute selectors that use CSS nth-child which is one-based.
                variant1.color.index = productVariationMaster.getAttrTypeValueIndex('color', variant1.instance.customAttributes.color) + 1;
                variant1.size.index = productVariationMaster.getAttrTypeValueIndex('size', variant1.instance.customAttributes.size) + 1;
                variant1.width.index = productVariationMaster.getAttrTypeValueIndex('width', variant1.instance.customAttributes.width) + 1;

                variant1Selection.set('resourcePath', resourcePath);
                variant1Selection.set('colorIndex', variant1.color.index);
                variant1Selection.set('sizeIndex', variant1.size.index);
                variant1Selection.set('widthIndex', variant1.width.index);

                return productDetailPage.addProductVariationToCart(variant1Selection);
            })
            .then(() => cartPage.navigateTo());
    });

    it('should display the correct number of rows', () =>
        cartPage
            .getItemList()
            .then(rows => assert.equal(1, rows.value.length))
    );


})

