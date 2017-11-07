'use strict';

module.exports = function (object, product, lineItem) {
    Object.defineProperty(object, 'isAvailableForInStorePickup', {
        enumerable: true,
        value: (
            product.custom
            && Object.prototype.hasOwnProperty.call(product.custom, 'isAvailableForInStorePickup')
            && !!product.custom.isAvailableForInStorePickup
        )
    });
    Object.defineProperty(object, 'isInStorePickup', {
        enumerable: true,
        value: (
            lineItem.custom
            && Object.prototype.hasOwnProperty.call(lineItem.custom, 'fromStoreId')
            && !!lineItem.custom.fromStoreId
        )
    });
};
