'use strict';

var BasketMgr = require('dw/order/BasketMgr');
var ShippingMgr = require('dw/order/ShippingMgr');
var store = require('./store');
var registryHelper = require('./registryHelper');
var items = require('./registryItemHelper');
var permission = require('./registryPermissionHelper');
var reservations = require('./reservationHelper');
var prefs = require('../util/preferences');
var v = require('../util/validation');
/**
 * Add the registryCheckoutHelper domain operation.
 * @param {*} actor - actor input
 * @param {*} input - input input
 * @returns {*} Domain result
 */
function add(actor, input) {
    prefs.requireFeature('RegistryPurchaseEnabled');
    return store.transaction(function () {
        var basket = BasketMgr.getCurrentOrNewBasket();
        if (basket.productLineItems.length || basket.giftCertificateLineItems.length) v.fail('EMPTY_BASKET_REQUIRED', 409);
        var registry = registryHelper.get(input.registryKey);
        permission.active(registry, actor);
        var pair = items.resolve(registry, input.itemKey);
        var product = pair.item.product;
        if (!product || !product.online || !product.availabilityModel.orderable) v.fail('PRODUCT_UNAVAILABLE', 409);
        var anonymous = v.bool(input.anonymous);
        if (anonymous && !(registry.custom.allowAnonymousGifts && prefs.enabled('AnonymousGiftingEnabled'))) v.fail('ANONYMOUS_DISABLED');
        var address = registryHelper.list(registry).currentShippingAddress;
        if (!address) v.fail('DELIVERY_NOT_CONFIGURED', 409);
        var email = actor.customer ? actor.customer.profile.email : v.text(input.email, 254, true);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) v.fail('INVALID_EMAIL');
        var reservation;
        if (input.reservationKey) {
            reservation = store.get('RegistryReservation', input.reservationKey);
            if (!reservation || reservation.custom.actorHash !== actor.actorHash || reservation.custom.itemKey !== input.itemKey
                || reservation.custom.status !== 'ACTIVE' || reservation.custom.expiresAt.getTime() <= Date.now()) v.fail('RESERVATION_EXPIRED', 409);
        } else {
            var result = reservations.create(actor, input);
            reservation = store.get('RegistryReservation', result.reservationKey);
        }
        var pli = basket.createProductLineItem(product, product.optionModel, basket.defaultShipment);
        pli.setQuantityValue(reservation.custom.quantity);
        pli.custom.sgRegistryKey = input.registryKey;
        pli.custom.sgRegistryItemKey = input.itemKey;
        pli.custom.sgReservationKey = reservation.custom.publicKey;
        pli.custom.sgAnonymousGift = anonymous;
        basket.custom.sgRegistryKey = input.registryKey;
        basket.custom.sgActorHash = actor.actorHash;
        basket.customerEmail = email;
        var shipment = basket.defaultShipment;
        shipment.custom.fromStoreId = null;
        require('*/cartridge/scripts/checkout/checkoutHelpers').copyCustomerAddressToShipment(address, shipment);
        shipment.custom.sgPrivateRegistryDelivery = true;
        shipment.shippingAddress.custom.sgPrivateDelivery = true;
        // Registry gifts ship to the recipient, so store-pickup methods never apply; prefer the site default.
        var methods = ShippingMgr.getShipmentShippingModel(shipment).applicableShippingMethods.toArray().filter(function (method) {
            return !method.custom.storePickupEnabled;
        });
        if (!methods.length) v.fail('DELIVERY_UNAVAILABLE', 409);
        var preferred = ShippingMgr.defaultShippingMethod;
        shipment.setShippingMethod(methods.filter(function (method) { return preferred && method.ID === preferred.ID; })[0] || methods[0]);
        require('*/cartridge/scripts/helpers/basketCalculationHelpers').calculateTotals(basket);
        return reservation.custom.publicKey;
    });
}
/**
 * Recheck the server-owned basket context before creating an order.
 * @param {*} basket - basket input
 */
function validate(basket) {
    if (!basket.custom.sgRegistryKey) return;
    var lines = basket.productLineItems.toArray();
    if (lines.length !== 1 || basket.shipments.length !== 1 || basket.giftCertificateLineItems.length) v.fail('INVALID_REGISTRY_BASKET', 409);
    lines.forEach(function (line) {
        var registry = registryHelper.get(basket.custom.sgRegistryKey);
        var pair = items.resolve(registry, line.custom.sgRegistryItemKey);
        var reservation = store.get('RegistryReservation', line.custom.sgReservationKey);
        if (!reservation || reservation.custom.registryKey !== registry.custom.publicKey || line.custom.sgRegistryKey !== registry.custom.publicKey
            || reservation.custom.itemKey !== line.custom.sgRegistryItemKey || reservation.custom.actorHash !== basket.custom.sgActorHash
            || reservation.custom.quantity !== line.quantityValue || pair.item.productID !== line.productID
            || registry.custom.status !== 'ACTIVE' || pair.item.custom.sgStatus !== 'ACTIVE'
            || reservation.custom.status !== 'ACTIVE' || reservation.custom.expiresAt.getTime() <= Date.now()) v.fail('RESERVATION_EXPIRED', 409);
        if (!basket.defaultShipment.custom.sgPrivateRegistryDelivery || !basket.defaultShipment.shippingAddress.custom.sgPrivateDelivery) v.fail('PRIVATE_DELIVERY_REQUIRED', 409);
        store.mutate('item:' + line.custom.sgRegistryItemKey, pair.state);
    });
}
/**
 * Bind an existing capacity hold to the newly created order.
 * @param {*} order - order input
 */
function attach(order) {
    var lines = order.productLineItems.toArray();
    lines.forEach(function (line) {
        if (!line.custom.sgRegistryKey) return;
        var reservation = store.get('RegistryReservation', line.custom.sgReservationKey);
        if (!reservation || reservation.custom.status !== 'ACTIVE' || reservation.custom.quantity !== line.quantityValue) v.fail('RESERVATION_EXPIRED', 409);
        reservation.custom.status = 'ORDER_PENDING';
        reservation.custom.orderNo = order.orderNo;
        order.custom.sgHasRegistryGifts = true;
        order.defaultShipment.custom.sgPrivateRegistryDelivery = true;
        order.defaultShipment.shippingAddress.custom.sgPrivateDelivery = true;
    });
}
/**
 * Cancel the registryCheckoutHelper domain operation.
 */
function cancel() {
    var basket = BasketMgr.getCurrentBasket();
    if (!basket || (!basket.custom.sgRegistryKey && !basket.custom.sgContributionKey)) return;
    store.transaction(function () {
        if (basket.custom.sgRegistryKey) {
            basket.productLineItems.toArray().forEach(function (line) {
                var reservation = store.get('RegistryReservation', line.custom.sgReservationKey);
                if (reservation) reservations.release(reservation, 'CANCELLED');
            });
        }
        if (basket.custom.sgContributionKey) {
            var contribution = require('./contributionHelper').get(basket.custom.sgContributionKey);
            if (contribution.custom.status === 'CREATED') require('./contributionHelper').fail(contribution);
        }
        BasketMgr.deleteBasket(basket);
    });
}
module.exports = { add: add, validate: validate, attach: attach, cancel: cancel };
