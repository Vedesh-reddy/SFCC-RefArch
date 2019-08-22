const { I, pageDesigner, utilities } = inject();

Then('shopper should see the product tile component', () => {
    I.seeElement(pageDesigner.locators.productTile1);
});

Then('shopper should see the alt attribute on product image', () => {
    I.seeAttributesOnElements(pageDesigner.locators.productTile1Image, { alt: 'Floral Print Pencil Skirt.' });
});

Then('shopper should see the title attribute on product image', () => {
    I.seeAttributesOnElements(pageDesigner.locators.productTile1Image, { title: 'Floral Print Pencil Skirt., ' });
});

Then('shopper should not see quickview on product tile', () => {
    I.dontSeeElement(pageDesigner.locators.productTile1Quickview);
});

Then('shopper should see the product name on product tile', () => {
    I.see('Floral Print Pencil Skirt.', pageDesigner.locators.productTile1ProductName);
});

Then('shopper should see the regular price on product tile', () => {
    I.see('$129.00', pageDesigner.locators.productTile1ProductPrice);
});

Then('shopper should see the strike-through price on product tile', () => {
    I.see('$59.00', pageDesigner.locators.productTile3StrikeThroughPrice);
});

Then('shopper should see the sales price on product tile', () => {
    I.see('$43.99', pageDesigner.locators.productTile3ProductPrice);
});

Then('shopper should go to the product details page clicking on the image', () => {
    utilities.clickToLoadPage(pageDesigner.locators.productTile1ImageLinkToPdp, '/s/RefArch/floral-print-pencil-skirt/25696881M.html?lang=default');
});

Then('shopper should go to the product details page clicking on product name', () => {
    utilities.clickToLoadPage(pageDesigner.locators.productTile1NameLinkToPdp, '/s/RefArch/floral-print-pencil-skirt/25696881M.html?lang=default');
});

