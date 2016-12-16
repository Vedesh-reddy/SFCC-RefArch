/**
 * Created by zsardone on 12/15/16.
 */

it('#8 should return 2 results when refine by Color, Price and Size', () => {
    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile device

            }
            // access desktop or laptop browser
            return browser.click(search.redColorRefinementSelector)
                .pause(2000)
                .click(search.price3RefinementSelector)
                .pause(2000)
                .getAttribute(search.price3RefinementTitle, 'title')
                .then(title => assert.equal(title, 'Currently Refined by Price: $50 - $99.99'))
                .click(search.size8RefinementSelector)
                .pause(2000)
                .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                    search.colorRefinementSmall))
                .then(mySearchSelector => browser.getText(mySearchSelector))
                .then(displayText => assert.equal(displayText, '2 Results'))
                .then(() => common.waitUntilPageLoaded())
                .then(() => browser.click(search.customSelect))
                .then(() => browser.click(search.sortOrderProductAtoZ))
                .then(() => browser.pause(2000))
                .then(() => common.waitUntilPageLoaded());
        });
});

it('#9 should return the correct names of the products when refined by Color, Price and Size', () => {
    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile devices
            }
            // access desktop/laptop browsers
            return search.getNthProductTileProductName(1)
                .then(productName => {
                    return assert.equal(productName, expectedDisplayName1, 'Expected: displayed product name = ' + expectedDisplayName1);
                })
                .then(() => search.getNthProductTileProductName(2)
                    .then(productName2 => {
                        return assert.equal(productName2, expectedDisplayName2, 'Expected: displayed product name = ' + expectedDisplayName2);
                    }))
                .then(() => common.waitUntilPageLoaded());
        });
});

it('#10. should return the correct images when refined by Color, Price and Size', () => {
    const product1ImageSrc = 'images/medium/PG.10229049.JJ1TOA0.PZ.jpg';
    const product2ImageSrc = 'images/medium/PG.10229049.JJ1TOA0.PZ.jpg';
    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile devices
            }
            // access desktop/laptop browsers
            return search.getNthProductTileImageSrc(1)
                .then(imageSrc => {
                    return assert.isTrue(imageSrc.endsWith(product1ImageSrc),
                        'product image: url not end with ' + product1ImageSrc);
                })
                .then(() => search.getNthProductTileImageSrc(1)
                    .then(imageSrc2 => {
                        return assert.isTrue(imageSrc2.endsWith(product2ImageSrc),
                            'product image :url not end with ' + product2ImageSrc);
                    }))
                .then(() => common.waitUntilPageLoaded());
        });
});

it('#11 should return the correct href links when refined by Color, Price and Size', () => {
    const product1ID = '25565106';
    const product2ID = '25565139';

    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile devices
            }
            // access desktop/laptop browsers
            const expectedLink1 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName1) + '/' + product1ID + '.html?lang=' + localeStr;
            const expectedLink2 = baseUrl + '/' + common.convertToUrlFormat(expectedDisplayName2) + '/' + product2ID + '.html?lang=' + localeStr;
            return search.getNthProductTileImageHref(1)
                .then(imageLink1 => {
                    assert.equal(imageLink1, expectedLink1, 'Expected image link not equal to ' + expectedLink1);
                })
                .then(() => search.getNthProductTileImageHref(2)
                    .then(imageLink2 => {
                        assert.equal(imageLink2, expectedLink2, 'Expected image link not equal to ' + expectedLink2);
                    }))
                .then(() => common.waitUntilPageLoaded());
        });
});

it('#12 should return the correct color swatch count when refined by Color, Price and Size', () => {
    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile devices
            }
            // access desktop/laptop browsers
            return search.getNthProductTileColorSwatchCount(1)
                .then(count => assert.equal(count, 1, 'Expected: the number of color swatch to be 1.'))
                .then(() => search.getNthProductTileColorSwatchCount(2)
                    .then(count => assert.equal(count, 2, 'Expected: the number of color swatch to be 2.')))
                .then(() => common.waitUntilPageLoaded());
        });
});

it('#13 should return 79 results for pants when reset button is clicked', () => {
    return browser.isVisible(search.filterButton)
        .then((isTrue) => {
            if (isTrue) {
                // access mobile devices
            }
            // access desktop/laptop browsers
            return browser.click(search.resetButton)
                .then(() => browser.waitForExist(search.pdpMain))
                .then(() => common.getVisibleSelector(search.colorRefinementLarge,
                    search.colorRefinementSmall))
                .then(mySearchSelector => browser.getText(mySearchSelector))
                .then(displayText => assert.equal(displayText, '275 Results'));
        });
});
