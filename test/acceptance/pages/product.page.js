const I = actor();

module.exports = {
    locators: {
        button: 'button',
        selectSize: '.select-size',
        selectQuantity: '.quantity-select',
        addToCartButton: '.add-to-cart',
        addToCartButtonEnabled: '.add-to-cart:not(:disabled)',
        miniCartIcon: '.minicart-icon.fa.fa-shopping-bag',
        cartHeader: '.cart-header',
        productImage: '.carousel-item.active > img',
        navigationCrumbs: '.product-breadcrumb:not(.d-md-none) .breadcrumb-item a',
        productName: '.product-name',
        productId: '.product-id',
        ratings: '.ratings',
        productAvailability: '.availability-msg',
        productPrice: '.prices .price .value',
        socialShare: 'ul.social-icons a',
        pinterest: '.fa-pinterest',
        facebook: '.fa-facebook-official',
        twitter: '.fa-twitter',
        copyLink: '.fa-link',
        productDescription: '.description-and-detail .description .content',
        productDetails: '.description-and-detail .details .content',
        copyLinkMsgVisible: '.copy-link-message:not(.d-none)',
        miniCartQuantity: '.minicart-quantity',
        addToCartSuccess: '.add-to-cart-messages .alert-success',
        addToCartFailure: '.add-to-cart-messages .alert-danger',
        filterColor: '.swatch-circle-',
        filterSize: 'span.null',
        filterPrice: 'span',
        productTotals: '.result-count.text-center',
        qv_ProductBtn: '.quickview.hidden-sm-down',
        qv_ColorBtn: '.color-attribute',
        qv_SizeSelect: '.custom-select.form-control.select-size',
        qv_AddToCart: '.add-to-cart-global.btn.btn-primary',
        alertAddToCart: '.alert.alert-success.add-to-basket-alert'
    },
    selectSize(size) {
        I.waitForElement(this.locators.selectSize);
        I.selectOption(this.locators.selectSize, size);
    },
    selectQuantity(quantity) {
        I.wait(1);
        I.waitForElement(this.locators.selectQuantity);
        I.selectOption(this.locators.selectQuantity, quantity);
    },
    addToCart() {
        I.scrollTo(this.locators.addToCartButton);
        I.waitForEnabled(this.locators.addToCartButton);
        I.click(this.locators.addToCartButton);
    },
    viewCart() {
        I.scrollPageToTop();
        I.wait(1);
        I.click(this.locators.miniCartIcon);
        I.waitForElement(this.locators.cartHeader);
    },
    clickCopyLink() {
        I.waitForEnabled(this.locators.copyLink);
        I.click(this.locators.copyLink);
    },
    filterProductColor(color) {
        I.waitForElement(this.locators.filterColor + color);
        I.click(this.locators.filterColor + color);
        I.wait(1);
    },
    filterProductSize(filterSizeTotal) {
        let locator = locate(this.locators.filterSize)
            .withAttr({ 'aria-hidden': 'true' })
            .withText(filterSizeTotal);
        I.waitForElement(locator);
        I.click(locator);
        I.wait(1);
    },
    filterProductPrice(filterPriceTotal) {
        let locator = locate(this.locators.filterPrice)
            .withAttr({ 'aria-hidden': 'true' })
            .withText(filterPriceTotal);
        I.waitForElement(locator);
        I.click(locator);
        I.wait(1);
    },
    verifyProductTotals(totalItems) {
        let locator = locate(this.locators.productTotals)
            .find(this.locators.filterPrice);
        I.waitForElement(locator);
        I.see(totalItems, locator);
    },
    openProductQuickView(pdpQuickViewLink) {
        let locator = locate(this.locators.qv_ProductBtn)
            .withAttr({ href: pdpQuickViewLink });
        I.waitForElement(locator);
        I.scrollTo(locator);
        I.click(locator);
    },
    selectQuickViewColor(color) {
        let locator = locate(this.locators.qv_ColorBtn)
            .withAttr({ 'aria-label': 'Select Color ' + color });
        I.waitForElement(locator);
        I.click(locator);
    },
    selectQuickViewSize(size) {
        I.waitForElement(this.locators.qv_SizeSelect);
        I.selectOption(this.locators.qv_SizeSelect, size);
    },
    addToCartQuickView() {
        I.waitForElement(this.locators.qv_AddToCart);
        I.click(this.locators.qv_AddToCart);
    }
};
