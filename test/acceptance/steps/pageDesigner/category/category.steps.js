const { I, pageDesigner } = inject();

Then('shopper should see the category components', () => {
    I.seeElement('.experience-commerce_assets-category .shop-category-label');
    let el = locate('.experience-commerce_assets-category').at(1);

    I.see('Shoes', el);
    I.see('Scarves', el);
    I.see('Accessories', el);
    I.see('Men\'s New Arrivals', el);
    I.see('Women\'s New Arrivals', el);
});

Then('shopper can click on a category link', () => {
    pageDesigner.clickPopulareCategory(1, '.shop-category-label', '/s/RefArch/womens/?lang=default');
});
