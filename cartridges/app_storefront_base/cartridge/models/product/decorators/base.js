'use strict';

module.exports = function (object, apiProduct, type) {
    Object.defineProperty(object, 'id', {
        enumerable: true,
        value: apiProduct.ID
    });

    Object.defineProperty(object, 'productName', {
        enumerable: true,
        value: apiProduct.name
    });

    Object.defineProperty(object, 'productType', {
        enumerable: true,
        value: type
    });
};
