'use strict';

import { assert } from 'chai';
import * as homePage from '../../../mocks/testDataMgr/pageObjects/home';
import * as footer from '../../../mocks/testDataMgr/pageObjects/footer';
import * as common from '../../../mocks/testDataMgr/helpers/common';
import * as search from '../../../mocks/testDataMgr/pageObjects/searchResult';
import url from 'url';

describe('Top Level category navigation', () => {
    let sparams;

    beforeEach(() => homePage.navigateTo()
        .then(() => browser.waitForExist(search.searchForm))
    );

    it('#1 Navigate to NewArrivals', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navNewArrivalButton))
                        .then(() => browser.waitForVisible(homePage.backButton))
                        .then(() => browser.click(homePage.navTopCategory))
                        .then(() => browser.waitForVisible(common.CategorySlot))
                        .then(() => browser.url())
                        .then(currentUrl => {
                            const parseUrl = url.parse(currentUrl.value);
                            return assert.isTrue(parseUrl.pathname.endsWith('new%20arrivals/'));
                        });
                }
                return browser.waitForVisible(footer.FOOTER_CONTAINER)
                    .click(homePage.NEW_ARRIVALS)
                    .waitForVisible(common.PRIMARY_CONTENT)
                    .url()
                    .then(currentUrl => {
                        const parseUrl = url.parse(currentUrl.value);
                        return assert.isTrue(parseUrl.pathname.endsWith('new%20arrivals/'));
                    })
                    .then(() => common.waitUntilPageLoaded());
            });
    });

    it('#2 Navigate to Womens', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navWomenButton))
                        .then(() => browser.waitForVisible(homePage.backButton))
                        .then(() => browser.click(homePage.navTopCategory))
                        .then(() => browser.waitForVisible(common.CategorySlot))
                        .then(() => browser.url())
                        .then(currentUrl => {
                            const parseUrl = url.parse(currentUrl.value);
                            return assert.isTrue(parseUrl.pathname.endsWith('womens/'));
                        })
                        .then(() => common.waitUntilPageLoaded());
                }
                return browser.waitForVisible(footer.FOOTER_CONTAINER)
                    .click(homePage.WOMEN)
                    .waitForVisible(common.PRIMARY_CONTENT)
                    .url()
                    .then(currentURL => {
                        const parseUrl = url.parse(currentURL.value);
                        return assert.isTrue(parseUrl.pathname.endsWith('womens/'));
                    });
            });
    });

    it('#3 Navigate to Mens', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navMenButton))
                        .then(() => browser.waitForVisible(homePage.backButton))
                        .then(() => browser.click(homePage.navTopCategory))
                        .then(() => browser.waitForVisible(common.CategorySlot))
                        .then(() => browser.url())
                        .then(currentUrl => {
                            const parseUrl = url.parse(currentUrl.value);
                            return assert.isTrue(parseUrl.pathname.endsWith('mens/'));
                        })
                        .then(() => common.waitUntilPageLoaded());
                }
                return browser.waitForVisible(footer.FOOTER_CONTAINER)
                    .click(homePage.MEN)
                    .waitForVisible(common.PRIMARY_CONTENT)
                    .url()
                    .then(currentURL => {
                        const parseUrl = url.parse(currentURL.value);
                        return assert.isTrue(parseUrl.pathname.endsWith('mens/'));
                    });
            });
    });

    it('#4 Navigate to Electronics', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navElectronics))
                        .then(() => browser.waitForVisible(homePage.backButton))
                        .then(() => browser.click(homePage.navTopCategory))
                        .then(() => browser.waitForVisible(common.CategorySlot))
                        .then(() => browser.url())
                        .then(currentUrl => {
                            const parseUrl = url.parse(currentUrl.value);
                            return assert.isTrue(parseUrl.pathname.endsWith('electronics/'));
                        })
                        .then(() => common.waitUntilPageLoaded());
                }
                return browser.waitForVisible(footer.FOOTER_CONTAINER)
                    .click(homePage.ELECTRONICS)
                    .waitForVisible(common.PRIMARY_CONTENT)
                    .url()
                    .then(currentURL => {
                        const parseUrl = url.parse(currentURL.value);
                        return assert.isTrue(parseUrl.pathname.endsWith('electronics/'));
                    });
            });
    });

    it('#5 Navigate to Top Sellers', () => {
        return browser.isVisible(homePage.navBarButton)
            .then((isTrue) => {
                if (isTrue) {
                    return browser.click(homePage.navBarButton)
                        .then(() => browser.waitForVisible(homePage.closeButton))
                        .then(() => browser.click(homePage.navTopSellers))
                        .then(() => browser.waitForVisible('.container .product-grid'))
                        .then(() => common.getSearchParams())
                        .then(params => {
                            sparams = params;
                        })
                        .then(() => assert.equal(sparams.srule, 'top-sellers'))
                        .then(() => common.waitUntilPageLoaded());
                }
                return browser.waitForVisible(footer.FOOTER_CONTAINER)
                    .click(homePage.TOP_SELLERS)
                    .waitForVisible(common.PRIMARY_CONTENT)
                    .then(() => common.getSearchParams())
                    .then(params => {
                        sparams = params;
                    })
                    .then(() => assert.equal(sparams.srule, 'top-sellers'));
            });
    });
});
