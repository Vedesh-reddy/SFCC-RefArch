'use strict';

var base = module.superModule;
module.exports = Object.assign({}, base, {
    gatherShippingAddresses: function (order) {
        if (!order.custom.sgHasRegistryGifts) return base.gatherShippingAddresses(order);
        return []; // A recipient's address must never enter the buyer's address book.
    }
});
