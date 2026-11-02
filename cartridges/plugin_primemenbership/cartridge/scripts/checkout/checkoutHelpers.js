'use strict';

var base = module.superModule;

/**
 * @returns {Object} the benefit helpers
 */
function benefits() {
    return require('*/cartridge/scripts/helpers/membershipBenefitHelpers');
}

module.exports = Object.assign({}, base, {
    createOrder: function (basket) {
        var order = base.createOrder(basket);
        if (!order || benefits().reserveOrderBenefits(order)) return order;
        // Allowance used up elsewhere since the basket was priced: the shopper must not get the savings.
        require('dw/system/Transaction').wrap(function () { require('dw/order/OrderMgr').failOrder(order, true); });
        return null;
    },
    handlePayments: function (order, orderNumber) {
        var result = base.handlePayments(order, orderNumber);
        if (result.error) benefits().settleOrderBenefits(order, false);
        return result;
    },
    placeOrder: function (order, fraudDetectionStatus) {
        var result = base.placeOrder(order, fraudDetectionStatus);
        try {
            benefits().settleOrderBenefits(order, !result.error);
        } catch (e) {
            // The order outcome stands; the reconciliation job settles the reservation by the order's status.
            require('dw/system/Logger').getLogger('prime-membership', 'membership-benefit').error('Benefit usage not settled for order {0}: {1}', order.orderNo, e.message);
        }
        return result;
    }
});
