const { I, data, homePage, productPage, cartPage, checkoutPage } = inject();
let product;

Given('Shopper searches for {string}', (inputProduct) => {
    product = inputProduct;
    homePage.search(product);
});

When('selects size {string}', (size) => {
    productPage.selectSize(size);
});

When('shopper changes product quantity', () => {
    productPage.selectQuantity(data.product.quantity);
});

When('he adds the product to cart', async () => {
    I.wait(1);
    productPage.addToCart();
});

Then('he is able to see the correct product in cart', () => {
    productPage.viewCart();
    I.see(product, cartPage.locators.lineItemName);
    cartPage.verifyCart(data.product.quantity, data.product.itemPrice, data.product.totalItemPrice,
        data.product.shipping, data.product.tax, data.product.estimatedTotal);
});

Then('shopper is able to add a product to minicart for remove', () => {
    homePage.search(data.product4.searchWord);
    productPage.selectSize(data.product4.size);
    productPage.selectColor(data.product4.color);
    productPage.selectQuantity(data.product4.originalQuantity);
    productPage.addToCart();
});

Then('shopper is able to remove the product from minicart', () => {
    I.moveCursorTo(cartPage.locators.cartIcon);
    cartPage.removeProductFromMiniCart(data.product4.name);
    I.see(data.product4.afterRemoveQuantity, productPage.locators.miniCartQuantity);
});

Then('shopper is able to add a product to minicart for edit', () => {
    homePage.search(data.product4.searchWord);
    productPage.selectColor(data.product4.color);
    productPage.selectSize(data.product4.size);
    productPage.selectQuantity(data.product4.originalQuantity);
    productPage.addToCart();
});

Then('shopper is able to modify the quantity and verify the product in minicart', () => {
    I.moveCursorTo(cartPage.locators.cartIcon);
    cartPage.verifyMiniCart(data.product4.originalQuantity, data.product4.name, data.product4.colorAttribute,
        data.product4.sizeAttribute, data.product4.availability, data.product4.originalPrice);
    cartPage.editQuantity(data.product4.editQuantity);
    I.waitForText(data.product4.finalQuantity, cartPage.locators.lineItemQuantity);
    I.waitForText(data.product4.finalPrice, cartPage.locators.subTotal);
    cartPage.verifyMiniCart(data.product4.finalQuantity, data.product4.name, data.product4.colorAttribute,
        data.product4.sizeAttribute, data.product4.availability, data.product4.finalPrice);
});

Then('shopper goes to Guest Checkout page from minicart', () => {
    productPage.clickCheckoutBtnOnMiniCart();
    I.seeElement(checkoutPage.locators.checkoutAsGuestBtn);
});

Then('shopper goes to Registered Checkout page from minicart', () => {
    productPage.clickCheckoutBtnOnMiniCart();
    let locator = locate('.data-checkout-stage').withAttr({ 'data-customer-type': 'registered' });
    I.waitForElement(locator);
    I.seeElement(locator);
});

Then('shopper goes back to home page from Checkout page', () => {
    checkoutPage.gotoHomePageFromCheckout();
});
