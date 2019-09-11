const I = actor();

module.exports = {
    locators: {
        lineItemQuantity: '.form-control.quantity.custom-select',
        totalItemQuantity: 'h2.number-of-items',
        lineItemPriceTotal: 'span.value',
        totalItemPrice: '.line-item-total-price',
        shippingCost: '.text-right.shipping-cost',
        taxTotal: '.text-right.tax-total',
        estimatedTotal: '.text-right.grand-total',
        cartIcon: '.minicart-icon.fa.fa-shopping-bag',
        checkoutBtn: '.btn.btn-primary.btn-block.checkout-btn',
        removeProductBox: '.hidden-md-down',
        removeProductBtn: '.remove-btn-lg.remove-product.btn.btn-light',
        removeProductModal: '.modal-content',
        removeProductModalConfirm: '.btn.btn-primary.cart-delete-confirmation-btn',
        editQuantitySelector: '.form-control.quantity.custom-select'
    },
    verifyCart(totalQuantity, itemPrice, totalItemPrice, shipping, tax, estimatedTotal) {
        I.see(totalQuantity, this.locators.lineItemQuantity);
        I.see(itemPrice, this.locators.lineItemPriceTotal);
        I.see(totalItemPrice, this.locators.totalItemPrice);
        I.see(shipping, this.locators.shippingCost);
        I.see(tax, this.locators.taxTotal);
        I.see(estimatedTotal, this.locators.estimatedTotal);
    },
    verifyCartQuantity(totalQuantity) {
        I.see(totalQuantity + ' Items', this.locators.totalItemQuantity);
    },
    removeProduct(productName) {
        // Click x to remove product
        let locator = locate(this.locators.removeProductBox)
            .find(this.locators.removeProductBtn)
            .withAttr({ 'data-name': productName });
        I.click(locator);
        // Confirm remove product
        within(this.locators.removeProductModal, () => {
            I.click(this.locators.removeProductModalConfirm);
        });
    },
    editQuantity(quantity) {
        I.selectOption(this.locators.editQuantitySelector, quantity);
    }
};
