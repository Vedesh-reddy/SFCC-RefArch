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
        I.waitForElement(this.locators.lineItemQuantity);
        I.waitForText(totalQuantity, this.locators.lineItemQuantity);
        I.waitForElement(this.locators.lineItemPriceTotal);
        I.waitForText(itemPrice, this.locators.lineItemPriceTotal);
        I.waitForElement(this.locators.totalItemPrice);
        I.waitForText(totalItemPrice, this.locators.totalItemPrice);
        I.waitForElement(this.locators.shippingCost);
        I.waitForText(shipping, this.locators.shippingCost);
        I.waitForElement(this.locators.taxTotal);
        I.waitForText(tax, this.locators.taxTotal);
        I.waitForElement(this.locators.estimatedTotal);
        I.waitForText(estimatedTotal, this.locators.estimatedTotal);
    },
    verifyCartQuantity(totalQuantity) {
        I.waitForElement(this.locators.totalItemQuantity);
        I.waitForText(totalQuantity + ' Items', this.locators.totalItemQuantity);
    },
    removeProduct(productName) {
        // Click x to remove product
        let locator = locate(this.locators.removeProductBox)
            .find(this.locators.removeProductBtn)
            .withAttr({ 'data-name': productName });
        I.waitForElement(locator);
        I.click(locator);
        // Confirm remove product
        I.waitForElement(this.locators.removeProductModal);
        within(this.locators.removeProductModal, () => {
            I.waitForElement(this.locators.removeProductModalConfirm);
            I.wait(1);
            I.click(this.locators.removeProductModalConfirm);
        });
    },
    editQuantity(quantity) {
        I.wait(1);
        I.waitForElement(this.locators.editQuantitySelector);
        I.selectOption(this.locators.editQuantitySelector, quantity);
    }
};
