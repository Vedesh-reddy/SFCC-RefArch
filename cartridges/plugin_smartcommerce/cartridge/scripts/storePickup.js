'use strict';

/**
 * Click & collect on SFRA's in-store pickup data model, which base checkout and
 * basket validation already honour: Store.custom.inventoryListId,
 * ShippingMethod.custom.storePickupEnabled, Shipment/ProductLineItem.custom.fromStoreId.
 * Pickup lines reserve stock from the store's inventory list at order creation.
 * @module scripts/storePickup
 */

var StoreMgr = require('dw/catalog/StoreMgr');
var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
var ShippingMgr = require('dw/order/ShippingMgr');
var Order = require('dw/order/Order');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var otp = require('*/cartridge/scripts/otp');

/**
 * @returns {dw.order.ShippingMethod|null} Configured pickup method
 */
function pickupMethod() {
    var id = Site.current.getCustomPreferenceValue('smartPickupShippingMethodID');
    return id ? ShippingMgr.getAllShippingMethods().toArray().filter(function (method) {
        return method.ID === id;
    })[0] || null : null;
}

/**
 * @param {dw.catalog.Store} store - Store
 * @param {string} pid - Product ID
 * @returns {number} Available-to-sell quantity at the store
 */
function availableAt(store, pid) {
    var listID = store && store.custom.inventoryListId;
    var list = listID ? ProductInventoryMgr.getInventoryList(listID) : null;
    var record = list ? list.getRecord(pid) : null;
    return record ? record.ATS.value : 0;
}

/**
 * @param {Array<Object>} stores - Stores from the base store locator model
 * @param {string} pid - Product ID
 * @returns {Array<Object>} Stores with stock, with their available quantity
 */
function withStock(stores, pid) {
    return stores.map(function (store) {
        return Object.assign({ available: availableAt(StoreMgr.getStore(store.ID), pid) }, store);
    }).filter(function (store) {
        return store.available > 0;
    });
}

/**
 * Pickup shipments always carry the store's address and the pickup method, whatever
 * the shipping form submitted. Caller owns the transaction.
 * @param {dw.order.Shipment} shipment - Pickup shipment
 * @param {dw.catalog.Store} store - Pickup store
 * @param {dw.order.ShippingMethod} method - Pickup method
 */
function applyStore(shipment, store, method) {
    var address = shipment.shippingAddress || shipment.createShippingAddress();
    address.setFirstName(store.name);
    address.setLastName('');
    address.setAddress1(store.address1);
    address.setAddress2(store.address2 || null);
    address.setCity(store.city);
    address.setPostalCode(store.postalCode);
    address.setStateCode(store.stateCode);
    address.setCountryCode(store.countryCode.value);
    address.setPhone(store.phone);
    shipment.setShippingMethod(method);
    shipment.custom.fromStoreId = store.ID; // eslint-disable-line no-param-reassign
    shipment.custom.shipmentType = 'instore'; // eslint-disable-line no-param-reassign
}

/**
 * Adds the product to a dedicated shipment for the store, reserving from the store's inventory.
 * @param {dw.order.Basket} basket - Current basket
 * @param {dw.catalog.Product} product - Variant or simple product
 * @param {dw.catalog.Store} store - Chosen store
 * @param {number} quantity - Quantity to add
 * @returns {string|null} smartcommerce resource key of the error
 */
function reserve(basket, product, store, quantity) {
    var method = pickupMethod();
    if (!method || !store || !product || !product.online || product.master || product.variationGroup || product.productSet) {
        return 'error.pickup.unavailable';
    }
    var shipment = basket.shipments.toArray().filter(function (candidate) {
        return candidate.custom.fromStoreId === store.ID;
    })[0];
    var line = shipment ? shipment.productLineItems.toArray().filter(function (pli) {
        return pli.productID === product.ID;
    })[0] : null;
    var total = quantity + (line ? line.quantityValue : 0);
    if (availableAt(store, product.ID) < total) {
        return 'error.pickup.stock';
    }
    Transaction.wrap(function () {
        shipment = shipment || basket.createShipment('pickup-' + store.ID);
        applyStore(shipment, store, method);
        line = line || basket.createProductLineItem(product.ID, shipment);
        line.setQuantityValue(total);
        line.custom.fromStoreId = store.ID;
        line.setProductInventoryListID(store.custom.inventoryListId);
    });
    return null;
}

/**
 * Re-applies store address and method, and store inventory to every line in a pickup
 * shipment (base checkout may merge shipments). Caller owns the transaction.
 * @param {dw.order.Basket} basket - Basket about to become an order
 */
function enforce(basket) {
    var method = pickupMethod();
    basket.shipments.toArray().forEach(function (shipment) {
        var store = shipment.custom.fromStoreId ? StoreMgr.getStore(shipment.custom.fromStoreId) : null;
        if (!store || !method) {
            return;
        }
        applyStore(shipment, store, method);
        shipment.productLineItems.toArray().forEach(function (pli) {
            pli.custom.fromStoreId = store.ID; // eslint-disable-line no-param-reassign
            pli.setProductInventoryListID(store.custom.inventoryListId);
        });
    });
}

/**
 * Stores a hash of a new pickup code on orders with a pickup shipment. Caller owns the transaction.
 * @param {dw.order.Order} order - Placed order
 * @returns {string|null} Code to send to the customer
 */
function issueCode(order) {
    var pickup = order.shipments.toArray().some(function (shipment) {
        return !!shipment.custom.fromStoreId;
    });
    if (!pickup) {
        return null;
    }
    var code = otp.generateCode();
    var salt = otp.generateSalt();
    order.custom.smartPickupCodeSalt = salt; // eslint-disable-line no-param-reassign
    order.custom.smartPickupCodeHash = otp.hash(code, salt); // eslint-disable-line no-param-reassign
    order.custom.smartPickupAttempts = 0; // eslint-disable-line no-param-reassign
    return code;
}

/**
 * Employee check at the pickup desk. Five wrong codes lock the order for handover.
 * @param {dw.order.Order} order - Order presented at the desk
 * @param {string} code - Code the customer shows
 * @returns {string} collected, invalid, locked, already or not-pickup
 */
function verifyCode(order, code) {
    if (!order.custom.smartPickupCodeHash) {
        return 'not-pickup';
    }
    if (order.custom.smartPickupCollectedAt) {
        return 'already';
    }
    var status = order.status.value;
    if ((order.custom.smartPickupAttempts || 0) >= otp.MAX_ATTEMPTS
        || (status !== Order.ORDER_STATUS_NEW && status !== Order.ORDER_STATUS_OPEN)) {
        return 'locked';
    }
    var valid = otp.hash(code, order.custom.smartPickupCodeSalt) === order.custom.smartPickupCodeHash;
    Transaction.wrap(function () {
        if (valid) {
            order.custom.smartPickupCollectedAt = new Date(); // eslint-disable-line no-param-reassign
            order.setShippingStatus(Order.SHIPPING_STATUS_SHIPPED);
        } else {
            order.custom.smartPickupAttempts = (order.custom.smartPickupAttempts || 0) + 1; // eslint-disable-line no-param-reassign
        }
    });
    return valid ? 'collected' : 'invalid';
}

module.exports = {
    pickupMethod: pickupMethod,
    withStock: withStock,
    reserve: reserve,
    enforce: enforce,
    issueCode: issueCode,
    verifyCode: verifyCode
};
