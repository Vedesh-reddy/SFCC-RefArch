'use strict';

const { I, data, homePage } = inject();

Then('shopper goes to store locator page', () => {
    I.amOnPage(data.storeLocator.pageURL);
});

Then('shopper searches for a store', () => {
    I.wait(1)
    homePage.searchForStore(data.storeLocator.zipCode);
    I.wait(2)
    homePage.verifyStoreResults(data.storeLocator.numStores);
});

Then('shopper searches for a store with different radius', () => {
    I.wait(1)
    homePage.changeStoreRadius(data.storeLocator.radius);
    I.wait(1)
    homePage.verifyStoreResults(data.storeLocator.numStoresRadius);
});
