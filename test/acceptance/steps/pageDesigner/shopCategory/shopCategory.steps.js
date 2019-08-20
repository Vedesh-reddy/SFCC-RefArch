const { I, pageDesigner, utilities } = inject();

Then('shopper should see the shop category heading', () => {
    I.see('Shop Category', pageDesigner.locators.shopCategoryHeading);
});

Then('shopper should see 5 shop categories', () => {
    I.seeNumberOfElements(pageDesigner.locators.shopCategoryLabel, 5);
    I.see('Women\'s New Arrivals', pageDesigner.locators.shopCategoryLink1);
    I.see('Men\'s New Arrivals', pageDesigner.locators.shopCategoryLink2);
    I.see('Shoes', pageDesigner.locators.shopCategoryLink3);
    I.see('Scarves', pageDesigner.locators.shopCategoryLink4);
    I.see('Accessories', pageDesigner.locators.shopCategoryLink5);
});

Then('shopper should go to the category page by clicking on the category link', () => {
    utilities.clickToLoadPage(pageDesigner.locators.shopCategoryLink3, '/s/RefArch/womens/accessories/shoes/?lang=default');
});
