'use strict';

/**
 * Guest order lookup and the post-placement modification window.
 *
 * Edits never re-price the order: unchanged lines keep the prices, promotions and
 * taxes of placement, so totals can only stay equal or go down and the existing
 * payment authorization still covers them.
 * @module scripts/orderSelfService
 */

var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var ProductMgr = require('dw/catalog/ProductMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');

// Field -> base forms.properties label key; address2 is the only optional field.
var ADDRESS_LABELS = {
    firstName: 'label.input.firstname.profile',
    lastName: 'label.input.lastname.profile',
    address1: 'label.input.address1',
    address2: 'label.input.address2',
    city: 'label.input.city',
    postalCode: 'label.input.zipcode',
    phone: 'label.input.phonenumber'
};
var ADDRESS_FIELDS = Object.keys(ADDRESS_LABELS);

/**
 * @param {string} value - Phone number in any format
 * @returns {string} Last ten digits, ignoring country prefixes and punctuation
 */
function phoneKey(value) {
    return String(value || '').replace(/\D/g, '').slice(-10);
}

/**
 * Finds a placed order matching the number and the order email or billing phone.
 * @param {string} orderNo - Order number from the shopper
 * @param {string} contact - Email or phone from the shopper
 * @returns {dw.order.Order|null} Matching order
 */
function findForLookup(orderNo, contact) {
    var order = null;
    try {
        // No token yet: this is the insecure access the OTP that follows authorizes, as in base Order-Track.
        order = orderNo ? OrderMgr.getOrder(String(orderNo).trim()) : null;
    } catch (e) {
        return null;
    }
    var status = order ? order.status.value : null;
    if (!order || status === Order.ORDER_STATUS_CREATED || status === Order.ORDER_STATUS_FAILED || !order.customerEmail) {
        return null;
    }
    var value = String(contact || '').trim().toLowerCase();
    if (value.indexOf('@') > -1) {
        return order.customerEmail.toLowerCase() === value ? order : null;
    }
    var phone = order.billingAddress ? phoneKey(order.billingAddress.phone) : '';
    return phone.length >= 7 && phone === phoneKey(value) ? order : null;
}

/**
 * @param {dw.system.SessionPrivacy} privacy - session.privacy
 * @param {dw.order.Order} order - Order whose code was verified
 */
function rememberTracked(privacy, order) {
    privacy.smartTrackedOrderNo = order.orderNo; // eslint-disable-line no-param-reassign
    privacy.smartTrackedOrderToken = order.orderToken; // eslint-disable-line no-param-reassign
}

/**
 * @param {Object} req - Request
 * @returns {dw.order.Order|null} Order verified by OTP in this session
 */
function trackedOrder(req) {
    var privacy = req.session.raw.privacy;
    return privacy.smartTrackedOrderNo
        ? OrderMgr.getOrder(privacy.smartTrackedOrderNo, privacy.smartTrackedOrderToken)
        : null;
}

/**
 * Owner of a registered order, or the session that verified the order by OTP.
 * @param {Object} req - Request
 * @param {string} orderNo - Order number from the request
 * @returns {dw.order.Order|null} Order the shopper may see and edit
 */
function authorizedOrder(req, orderNo) {
    var tracked = trackedOrder(req);
    if (tracked && tracked.orderNo === orderNo) {
        return tracked;
    }
    var customer = req.currentCustomer.raw;
    if (!orderNo || !customer.authenticated || !customer.registered) {
        return null;
    }
    try {
        var order = OrderMgr.getOrder(String(orderNo));
        return order && order.customerNo === customer.profile.customerNo ? order : null;
    } catch (e) {
        return null;
    }
}

/**
 * @param {dw.order.Order} order - Order
 * @returns {Date} End of the modification window
 */
function editableUntil(order) {
    var minutes = Site.current.getCustomPreferenceValue('smartOrderEditWindowMinutes') || 15;
    return new Date(order.creationDate.getTime() + (minutes * 60000));
}

/**
 * @param {dw.order.Order} order - Order
 * @returns {boolean} Whether the order can still be changed
 */
function isEditable(order) {
    var status = order.status.value;
    return (status === Order.ORDER_STATUS_NEW || status === Order.ORDER_STATUS_OPEN)
        && order.shippingStatus.value === Order.SHIPPING_STATUS_NOTSHIPPED
        && order.exportStatus.value !== Order.EXPORT_STATUS_EXPORTED
        && Date.now() < editableUntil(order).getTime();
}

/**
 * @param {dw.order.Order} order - Order
 * @returns {Array<dw.order.ProductLineItem>} Lines the shopper bought directly
 */
function mainLines(order) {
    return order.productLineItems.toArray().filter(function (pli) {
        return !pli.bonusProductLineItem && !pli.optionProductLineItem && !pli.bundledProductLineItem;
    });
}

/**
 * Same-price, orderable siblings, so a swap never changes what was charged.
 * @param {dw.order.ProductLineItem} pli - Order line
 * @returns {Array<Object>} Variant choices: pid and label
 */
function variantChoices(pli) {
    var product = pli.product;
    if (!product || !product.variant || pli.optionProductLineItems.length || pli.bundledProductLineItems.length) {
        return [];
    }
    var model = product.masterProduct.variationModel;
    var attributes = model.productVariationAttributes.toArray();
    return product.masterProduct.variants.toArray().filter(function (variant) {
        var price = variant.priceModel.getPrice(pli.quantity);
        return variant.ID !== product.ID && variant.online
            && variant.availabilityModel.isOrderable(pli.quantityValue)
            && price.available && price.currencyCode === pli.basePrice.currencyCode
            && price.value === pli.basePrice.value;
    }).map(function (variant) {
        return {
            pid: variant.ID,
            label: attributes.map(function (attribute) {
                var value = model.getVariationValue(variant, attribute);
                return value ? value.displayValue : '';
            }).join(' / ')
        };
    });
}

/**
 * Item cancellation is offered only where removing a line cannot leave an
 * unearned order discount or bonus product behind.
 * @param {dw.order.Order} order - Order
 * @returns {boolean} Whether single items may be cancelled
 */
function canCancelItems(order) {
    return mainLines(order).length > 1 && order.priceAdjustments.empty && order.bonusLineItems.empty;
}

/**
 * @param {dw.order.Order} order - Order
 * @returns {dw.order.Shipment|null} Home-delivery shipment whose address may change
 */
function deliveryShipment(order) {
    var shipment = order.defaultShipment;
    return shipment && shipment.shippingAddress && !shipment.custom.fromStoreId ? shipment : null;
}

/**
 * @param {dw.order.Order} order - Editable order
 * @returns {Object} View model for the modification panel
 */
function toEditView(order) {
    var shipment = deliveryShipment(order);
    var address = shipment ? shipment.shippingAddress : null;
    var cancelItems = canCancelItems(order);
    return {
        orderNo: order.orderNo,
        editableUntil: editableUntil(order),
        addressFields: address ? ADDRESS_FIELDS.map(function (field) {
            return {
                name: field,
                value: address[field] || '',
                label: Resource.msg(ADDRESS_LABELS[field], 'forms', null),
                required: field !== 'address2'
            };
        }) : null,
        items: mainLines(order).map(function (pli) {
            return {
                uuid: pli.UUID,
                name: pli.productName,
                quantity: pli.quantityValue.toFixed(0),
                canCancel: cancelItems,
                variants: variantChoices(pli)
            };
        })
    };
}

/**
 * @param {dw.order.Order} order - Order
 * @param {string} uuid - Line UUID from the request
 * @returns {dw.order.ProductLineItem|null} Line of this order
 */
function findLine(order, uuid) {
    return mainLines(order).filter(function (pli) {
        return pli.UUID === uuid;
    })[0] || null;
}

/**
 * Country and state stay as placed: they decide the taxes already charged.
 * @param {dw.order.Order} order - Editable order
 * @param {Object} form - Request form
 * @returns {string|null} Error message
 */
function updateAddress(order, form) {
    var shipment = deliveryShipment(order);
    var values = {};
    ADDRESS_FIELDS.forEach(function (field) {
        values[field] = String(form[field] || '').trim().substring(0, 50);
    });
    var invalid = !shipment || ADDRESS_FIELDS.some(function (field) {
        return field !== 'address2' && !values[field];
    });
    if (invalid) {
        return Resource.msg('error.edit.address', 'smartcommerce', null);
    }
    Transaction.wrap(function () {
        var address = shipment.shippingAddress;
        address.setFirstName(values.firstName);
        address.setLastName(values.lastName);
        address.setAddress1(values.address1);
        address.setAddress2(values.address2 || null);
        address.setCity(values.city);
        address.setPostalCode(values.postalCode);
        address.setPhone(values.phone);
    });
    return null;
}

/**
 * @param {dw.order.Order} order - Editable order
 * @returns {string|null} Error message
 */
function cancelOrder(order) {
    var failed = false;
    Transaction.wrap(function () {
        // ponytail: payment void/refund is left to the payment back office | upgrade path: call the gateway void when a live processor is integrated
        failed = OrderMgr.cancelOrder(order).error;
        if (!failed) {
            order.setCancelCode('customer');
            order.setCancelDescription('Cancelled by the customer within the modification window');
        }
    });
    return failed ? Resource.msg('error.edit.cancel', 'smartcommerce', null) : null;
}

/**
 * @param {dw.order.Order} order - Editable order
 * @param {string} uuid - Line UUID
 * @returns {string|null} Error message
 */
function cancelItem(order, uuid) {
    var pli = findLine(order, uuid);
    if (!pli || !canCancelItems(order)) {
        return Resource.msg('error.edit.item', 'smartcommerce', null);
    }
    Transaction.wrap(function () {
        // ponytail: the removed quantity stays allocated until the next inventory import | upgrade path: release it through OMS or an inventory adjustment feed
        order.removeProductLineItem(pli);
        order.updateTotals();
    });
    // The total only went down, so lowering the authorized amount is enough.
    // Required here, not at the top: checkoutHelpers requires this module.
    require('*/cartridge/scripts/checkout/checkoutHelpers').calculatePaymentTransaction(order);
    return null;
}

/**
 * Swaps to a same-price variant, carrying the line's discounts over as custom
 * adjustments because replaceProduct drops promotion adjustments.
 * @param {dw.order.Order} order - Editable order
 * @param {string} uuid - Line UUID
 * @param {string} pid - Variant chosen by the shopper
 * @returns {string|null} Error message
 */
function changeVariant(order, uuid, pid) {
    var pli = findLine(order, uuid);
    var allowed = pli && variantChoices(pli).some(function (choice) {
        return choice.pid === pid;
    });
    if (!allowed) {
        return Resource.msg('error.edit.variant', 'smartcommerce', null);
    }
    Transaction.wrap(function () {
        var unit = pli.basePrice.value;
        var taxRate = pli.taxRate;
        var discounts = pli.priceAdjustments.toArray().map(function (adjustment) {
            return { id: adjustment.promotionID, value: adjustment.priceValue, text: adjustment.lineItemText };
        });
        // ponytail: the new variant is not reserved and the old one stays allocated | upgrade path: move the allocation through OMS
        pli.replaceProduct(ProductMgr.getProduct(pid));
        pli.setPriceValue(unit);
        pli.updateTax(taxRate);
        discounts.forEach(function (discount) {
            var adjustment = pli.createPriceAdjustment('order-edit-' + discount.id);
            adjustment.setPriceValue(discount.value);
            adjustment.setLineItemText(discount.text);
            adjustment.updateTax(taxRate);
        });
        order.updateTotals();
    });
    return null;
}

module.exports = {
    editableUntil: editableUntil,
    findForLookup: findForLookup,
    rememberTracked: rememberTracked,
    trackedOrder: trackedOrder,
    authorizedOrder: authorizedOrder,
    isEditable: isEditable,
    toEditView: toEditView,
    updateAddress: updateAddress,
    cancelOrder: cancelOrder,
    cancelItem: cancelItem,
    changeVariant: changeVariant
};
