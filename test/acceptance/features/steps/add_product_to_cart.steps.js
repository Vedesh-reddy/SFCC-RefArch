const { I, homePage, productPage, cartPage } = inject();
let product;

Given('Shopper searches for {string}', (inputProduct) => {
    product = inputProduct;
    homePage.search(product);
});

When('selects size {string}', (size) => {
    productPage.selectSize(size);
});

When('he adds the product to cart', async () => {
    productPage.addToCart();
    productPage.viewCart();
});

Then('he is able to see the correct product in cart', () => {
    I.see(product, cartPage.locators.lineItemName);
});
