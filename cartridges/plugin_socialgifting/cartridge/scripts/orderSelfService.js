'use strict';

var base = module.superModule;
/**
 * ProtectedOrder the orderSelfService domain operation.
 * @param {*} order - order input
 * @returns {*} Domain result
 */
function protectedOrder(order) { return order && (order.custom.sgHasRegistryGifts || order.custom.sgContributionKey); }
module.exports = Object.assign({}, base, {
    isEditable: function (order) { return !protectedOrder(order) && base.isEditable(order); },
    toEditView: function (order) { return protectedOrder(order) ? { orderNo: order.orderNo, addressFields: null, items: [] } : base.toEditView(order); },
    updateAddress: function (order, form) { return protectedOrder(order) ? 'Please contact customer service.' : base.updateAddress(order, form); },
    cancelOrder: function (order) { return protectedOrder(order) ? 'Please contact customer service.' : base.cancelOrder(order); },
    cancelItem: function (order, id) { return protectedOrder(order) ? 'Please contact customer service.' : base.cancelItem(order, id); },
    changeVariant: function (order, id, pid) { return protectedOrder(order) ? 'Please contact customer service.' : base.changeVariant(order, id, pid); }
});
