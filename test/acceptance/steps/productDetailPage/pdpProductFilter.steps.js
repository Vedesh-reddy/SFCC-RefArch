const { data, productPage } = inject();

Then('shopper filters product by color', () => {
    productPage.filterProductColor(data.filterProduct.color);
    productPage.verifyProductTotals(data.filterProduct.colorTotalItems);
});

Then('shopper filters product by size', () => {
    productPage.filterProductSize(data.filterProduct.size);
    productPage.verifyProductTotals(data.filterProduct.sizeTotalItems);
});

Then('shopper filters product by price', () => {
    productPage.filterProductPrice(data.filterProduct.price);
    productPage.verifyProductTotals(data.filterProduct.priceTotalItems);
});
