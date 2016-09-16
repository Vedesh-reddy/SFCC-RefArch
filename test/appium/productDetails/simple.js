"use strict";

import {assert} from 'chai';

describe('Product Details - Product Item', () => {
    const variantId = 708141677197;
    const basePath = 'en_US/Product-Show/?pid=708141677197';

    before(() => {
        console.log('[before] Starting...');
        return browser
            .url('http://dev02-lab03b-dw.demandware.net/on/demandware.store/Sites-SiteGenesis-Site/en_US/Product-Show/?pid=708141677197');
    });

    it('should display its product ID', () => {
        console.log('[it] Starting test...');
        return browser
            .getText(`.product-id`)
            .then(itemNumber => {
                return assert.equal(itemNumber, variantId);
            })
    });

})
