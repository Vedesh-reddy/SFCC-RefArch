const I = actor();

module.exports = {
    locators: {
        selectSize: '.select-size',
        selectQuantity: '.quantity-select',
        addToCartButton: '.add-to-cart',
        addToCartButtonEnabled: '.add-to-cart:not(:disabled)',
        miniCartIcon: '.minicart',
        cartHeader: '.cart-header',
        productImage: '.carousel-item.active > img',
        navigationCrumbs: '.product-breadcrumb:not(.d-md-none) .breadcrumb-item a',
        productName: '.product-name',
        productId: '.product-id',
        ratings: '.ratings',
        quantitySelect: '.quantity-select',
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
        addToCartFailure: '.add-to-cart-messages .alert-danger'
    },
    selectSize(size) {
        I.waitForElement(this.locators.selectSize);
        I.selectOption(this.locators.selectSize, size);
    },
    selectQuantity(quantity) {
        I.waitForElement(this.locators.selectQuantity);
        I.selectOption(this.locators.selectQuantity, quantity);
    },
    addToCart() {
        I.waitForEnabled(this.locators.addToCartButton);
        I.click(this.locators.addToCartButton);
    },
    viewCart() {
        I.scrollPageToTop();
        I.wait(2);
        I.click(this.locators.miniCartIcon);
        I.waitForElement(this.locators.cartHeader);
    },
    clickCopyLink() {
        I.waitForEnabled(this.locators.copyLink);
        I.click(this.locators.copyLink);
    }
};
