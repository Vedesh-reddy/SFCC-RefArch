'use strict';

/**
 * Display-safe projections of SFRA models for the shopping assistant. Each
 * function returns plain data only: no card numbers, tokens or raw API objects.
 * @module scripts/helpers/chatWidgetHelpers
 */

var collections = require('*/cartridge/scripts/util/collections');

// synchronous saved-card processors proven with SFRA CheckoutServices | upgrade path: add a provider ID once its saved-card Handle/Authorize hooks run without redirects
var IN_WIDGET_CARD_PROCESSORS = ['BASIC_CREDIT'];
var RECENT_ORDER_DAYS = 180;

/**
 * Convert a markup/promotion message into plain text.
 * @param {*} value MarkupText, string or empty value
 * @returns {string} plain text
 */
function plainText(value) {
    var raw = value && value.markup !== undefined ? value.markup : value;
    return String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Format a product's single or ranged sale price.
 * @param {Object} price product price model
 * @returns {string} display price
 */
function formatProductPrice(price) {
    if (price.sales) {
        return price.sales.formatted || '';
    }
    if (price.min && price.max) {
        return price.min.sales.formatted === price.max.sales.formatted
            ? price.min.sales.formatted
            : price.min.sales.formatted + ' – ' + price.max.sales.formatted;
    }
    return '';
}

/**
 * Format a money value, or return an empty string when it is not available.
 * @param {dw.value.Money} money money value
 * @returns {string} formatted money
 */
function formatMoney(money) {
    return money && money.available ? require('dw/util/StringUtils').formatMoney(money) : '';
}

/**
 * Online catalog categories beneath a parent category.
 * @param {string} parentId category identifier, root when empty
 * @returns {Array} available categories
 */
function categoriesFor(parentId) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var parent = parentId ? CatalogMgr.getCategory(parentId) : CatalogMgr.getSiteCatalog().getRoot();
    var categories = [];

    if (!parent || (parentId && !parent.online) || !parent.hasOnlineSubCategories()) {
        return categories;
    }
    collections.forEach(parent.getOnlineSubCategories(), function (category) {
        if (category.hasOnlineProducts() || category.hasOnlineSubCategories()) {
            categories.push({ id: category.ID, name: category.displayName });
        }
    });
    return categories;
}

/**
 * Applied price adjustments, coupon states and active customer promotions.
 * @param {dw.order.Basket|null} basket current basket
 * @returns {Object} applied, coupons and active promotion lists
 */
function promotionsData(basket) {
    var PromotionMgr = require('dw/campaign/PromotionMgr');
    var applied = [];
    var coupons = [];
    var active = [];

    /**
     * Push one price adjustment.
     * @param {dw.order.PriceAdjustment} adjustment price adjustment
     * @param {string} scope order, shipping or product
     */
    function addAdjustment(adjustment, scope) {
        applied.push({
            id: adjustment.promotionID,
            scope: scope,
            message: plainText(adjustment.promotion ? adjustment.promotion.calloutMsg : '') || plainText(adjustment.lineItemText),
            amount: formatMoney(adjustment.price),
            couponCode: adjustment.basedOnCoupon && adjustment.couponLineItem ? adjustment.couponLineItem.couponCode : ''
        });
    }

    if (basket) {
        collections.forEach(basket.priceAdjustments, function (adjustment) { addAdjustment(adjustment, 'order'); });
        collections.forEach(basket.allShippingPriceAdjustments, function (adjustment) { addAdjustment(adjustment, 'shipping'); });
        collections.forEach(basket.allProductLineItems, function (lineItem) {
            collections.forEach(lineItem.priceAdjustments, function (adjustment) { addAdjustment(adjustment, 'product'); });
        });
        collections.forEach(basket.couponLineItems, function (coupon) {
            coupons.push({ uuid: coupon.UUID, code: coupon.couponCode, applied: coupon.applied, valid: coupon.valid, status: coupon.statusCode });
        });
    }
    collections.forEach(PromotionMgr.getActiveCustomerPromotions().getPromotions(), function (promotion) {
        var message = plainText(promotion.calloutMsg) || plainText(promotion.name);
        if (message && active.length < 20) {
            active.push({ id: promotion.ID, message: message, requiresCoupon: promotion.basedOnCoupons });
        }
    });
    return { applied: applied, coupons: coupons, active: active };
}

/**
 * Basket lines, totals, shipping methods and promotions built on the SFRA CartModel.
 * @param {dw.order.Basket|null} basket current basket
 * @returns {Object} cart payload
 */
function cartData(basket) {
    var CartModel = require('*/cartridge/models/cart');
    var cart = new CartModel(basket);
    var shipment = cart.shipments && cart.shipments.length ? cart.shipments[0] : null;
    var totals = cart.totals;

    return {
        items: cart.items.map(function (item) {
            return {
                uuid: item.UUID,
                id: item.id,
                name: item.productName,
                image: item.images && item.images.small && item.images.small.length ? item.images.small[0].url : '',
                quantity: item.quantity,
                minQuantity: item.quantityOptions ? item.quantityOptions.minOrderQuantity : 1,
                maxQuantity: item.quantityOptions ? item.quantityOptions.maxOrderQuantity : item.quantity,
                price: item.priceTotal ? item.priceTotal.price : '',
                options: (item.variationAttributes || []).map(function (attribute) {
                    return attribute.displayName + ': ' + attribute.displayValue;
                }).join(', '),
                promotions: (item.appliedPromotions || []).map(function (promotion) {
                    return plainText(promotion.callOutMsg) || plainText(promotion.name);
                }),
                bonus: !!item.isBonusProductLineItem
            };
        }),
        numItems: cart.numItems,
        totals: totals ? {
            subTotal: totals.subTotal,
            shipping: totals.totalShippingCost,
            tax: totals.totalTax,
            grandTotal: totals.grandTotal,
            orderDiscount: totals.orderLevelDiscountTotal.value > 0 ? totals.orderLevelDiscountTotal.formatted : '',
            shippingDiscount: totals.shippingLevelDiscountTotal.value > 0 ? totals.shippingLevelDiscountTotal.formatted : ''
        } : null,
        shippingMethods: shipment ? (shipment.shippingMethods || []).map(function (method) {
            return {
                id: method.ID,
                name: method.displayName,
                cost: method.shippingCost,
                arrival: method.estimatedArrivalTime || '',
                selected: method.ID === shipment.selectedShippingMethod
            };
        }) : [],
        valid: cart.valid ? { error: !!cart.valid.error, message: cart.valid.message || '' } : { error: false, message: '' },
        approaching: (cart.approachingDiscounts || []).map(function (discount) { return plainText(discount.discountMsg); }),
        promotions: promotionsData(basket)
    };
}

/**
 * A saved address with the fields the widget posts back to SFRA forms.
 * @param {dw.customer.CustomerAddress} address saved address
 * @param {string} preferredId preferred address ID
 * @returns {Object} address payload
 */
function addressData(address, preferredId) {
    return {
        id: address.ID,
        firstName: address.firstName || '',
        lastName: address.lastName || '',
        address1: address.address1 || '',
        address2: address.address2 || '',
        city: address.city || '',
        stateCode: address.stateCode || '',
        postalCode: address.postalCode || '',
        countryCode: address.countryCode ? address.countryCode.value : '',
        phone: address.phone || '',
        isDefault: address.ID === preferredId
    };
}

/**
 * All saved addresses of a customer, default first.
 * @param {dw.customer.Customer} customer authenticated customer
 * @returns {Array} address payloads
 */
function addressesFor(customer) {
    var addressBook = customer.addressBook;
    var preferredId = addressBook.preferredAddress ? addressBook.preferredAddress.ID : '';
    return collections.map(addressBook.addresses, function (address) {
        return addressData(address, preferredId);
    }).sort(function (a, b) { return Number(b.isDefault) - Number(a.isDefault); });
}

/**
 * Country and state options configured on the SFRA address form.
 * @returns {Object} countries and states option lists
 */
function addressOptions() {
    var addressForm = require('server').forms.getForm('address');
    /**
     * Map form options to value/label pairs.
     * @param {Object} field form field model
     * @returns {Array} options
     */
    function options(field) {
        return (field && field.options ? field.options : []).map(function (option) {
            return { value: option.htmlValue, label: option.label };
        });
    }
    return {
        countries: options(addressForm.country),
        states: addressForm.states ? options(addressForm.states.stateCode) : []
    };
}

/**
 * Masked saved cards of a customer.
 * @param {dw.customer.Customer} customer authenticated customer
 * @param {dw.util.Collection} [applicableCards] payment cards usable for the basket
 * @returns {Array} card payloads
 */
function paymentsFor(customer, applicableCards) {
    var PaymentMgr = require('dw/order/PaymentMgr');
    var now = new Date();
    return collections.map(customer.profile.wallet.paymentInstruments, function (instrument) {
        var year = instrument.creditCardExpirationYear;
        var month = instrument.creditCardExpirationMonth;
        var expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
        var card = PaymentMgr.getPaymentCard(instrument.creditCardType);
        return {
            uuid: instrument.UUID,
            type: instrument.creditCardType,
            masked: instrument.maskedCreditCardNumber,
            expiry: month + '/' + year,
            expired: expired,
            usable: !expired && (!applicableCards || (!!card && applicableCards.contains(card)))
        };
    });
}

/**
 * Whether checkout payment can be completed inside the widget for this site.
 * @param {Object} req SFRA request
 * @param {dw.order.Basket} basket current basket
 * @returns {Object} available flag, explanation and usable saved cards
 */
function paymentSupport(req, basket) {
    var HookMgr = require('dw/system/HookMgr');
    var PaymentInstrument = require('dw/order/PaymentInstrument');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var method = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
    var processor = method && method.active ? method.paymentProcessor : null;
    var customer = req.currentCustomer.raw;
    var cards;

    if (!processor) {
        return { available: false, reason: 'Card payment is not enabled for this site, so the order cannot be paid in the assistant.', cards: [] };
    }
    if (IN_WIDGET_CARD_PROCESSORS.indexOf(processor.ID) === -1 || !HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
        return {
            available: false,
            reason: 'This site\'s card processor (' + processor.ID + ') authorises cards in its own secure payment step, which cannot run inside the assistant. Your cart, delivery address and shipping method are saved; finish payment on the secure checkout page.',
            cards: []
        };
    }
    cards = paymentsFor(customer, method.getApplicablePaymentCards(
        customer,
        req.geolocation ? req.geolocation.countryCode : null,
        basket.totalGrossPrice.available ? basket.totalGrossPrice.value : null
    )).filter(function (card) { return card.usable; });
    if (!cards.length) {
        return {
            available: false,
            reason: 'None of your saved cards can be used for this order. New cards must be entered in the site\'s secure card form so the payment provider can tokenise them.',
            cards: []
        };
    }
    return { available: true, reason: '', cards: cards };
}

/**
 * Number of orders placed within the recent-order window.
 * @param {dw.customer.Customer} customer authenticated customer
 * @returns {number} recent order count
 */
function recentOrderCount(customer) {
    var since = new Date(Date.now() - (RECENT_ORDER_DAYS * 24 * 60 * 60 * 1000));
    var orders = customer.orderHistory.getOrders('creationDate >= {0} AND status != {1}', null, since, require('dw/order/Order').ORDER_STATUS_REPLACED);
    var count = orders.count;
    orders.close();
    return count;
}

/**
 * Summary of one order for list views.
 * @param {dw.order.Order} order order
 * @returns {Object} order summary
 */
function orderSummary(order) {
    return {
        orderNo: order.orderNo,
        date: order.creationDate.toISOString(),
        status: String(order.status.displayValue),
        total: formatMoney(order.totalGrossPrice),
        itemCount: order.productQuantityTotal
    };
}

/**
 * Detailed order view built on the SFRA OrderModel.
 * @param {Object} orderModel SFRA order model
 * @returns {Object} order detail payload
 */
function orderDetails(orderModel) {
    var shipping = orderModel.shipping && orderModel.shipping.length ? orderModel.shipping[0] : null;
    var address = shipping && shipping.shippingAddress ? shipping.shippingAddress : null;
    var instruments = orderModel.billing && orderModel.billing.payment ? orderModel.billing.payment.selectedPaymentInstruments || [] : [];

    return {
        orderNo: orderModel.orderNumber,
        date: orderModel.creationDate ? orderModel.creationDate.toISOString() : '',
        status: orderModel.orderStatus ? String(orderModel.orderStatus.displayValue) : '',
        items: orderModel.items.items.map(function (item) {
            return {
                name: item.productName,
                quantity: item.quantity,
                price: item.priceTotal ? item.priceTotal.price : '',
                image: item.images && item.images.small && item.images.small.length ? item.images.small[0].url : ''
            };
        }),
        totals: {
            subTotal: orderModel.totals.subTotal,
            shipping: orderModel.totals.totalShippingCost,
            tax: orderModel.totals.totalTax,
            grandTotal: orderModel.totals.grandTotal,
            orderDiscount: orderModel.totals.orderLevelDiscountTotal.value > 0 ? orderModel.totals.orderLevelDiscountTotal.formatted : '',
            shippingDiscount: orderModel.totals.shippingLevelDiscountTotal.value > 0 ? orderModel.totals.shippingLevelDiscountTotal.formatted : ''
        },
        shipTo: address ? [address.firstName, address.lastName, address.address1, address.city, address.postalCode]
            .filter(function (value) { return !!value; }).join(', ') : '',
        shippingMethod: shipping && shipping.selectedShippingMethod ? shipping.selectedShippingMethod.displayName : '',
        payments: instruments.map(function (instrument) {
            return instrument.type ? instrument.type + ' ' + instrument.maskedCreditCardNumber : instrument.paymentMethod;
        })
    };
}

/**
 * Actions available to the current shopper, session and site configuration.
 * @param {Object} req SFRA request
 * @param {string|null} reviewOrderNo confirmed order awaiting a review
 * @returns {Object} capability payload
 */
function capabilities(req, reviewOrderNo) {
    var BasketMgr = require('dw/order/BasketMgr');
    var PromotionMgr = require('dw/campaign/PromotionMgr');
    var customer = req.currentCustomer.raw;
    var basket = BasketMgr.getCurrentBasket();
    var itemCount = basket ? basket.productQuantityTotal : 0;
    var actions = [];

    if (categoriesFor(null).length) {
        actions.push('shop');
    }
    actions.push('search', 'cart');
    if (PromotionMgr.getActiveCustomerPromotions().getPromotions().length || (basket && basket.priceAdjustments.length)) {
        actions.push('promotions');
    }
    if (!customer.authenticated) {
        actions.push('login', 'register', 'reset-password');
    } else {
        if (itemCount > 0) {
            actions.push('checkout');
        }
        actions.push('account', 'profile', 'addresses');
        if (customer.profile.wallet.paymentInstruments.length) {
            actions.push('payments');
        }
        if (customer.orderHistory.orderCount) {
            actions.push('orders');
        }
        if (reviewOrderNo) {
            actions.push('review');
        }
        actions.push('logout');
    }
    return {
        authenticated: customer.authenticated,
        firstName: customer.authenticated && customer.profile ? customer.profile.firstName : '',
        itemCount: itemCount,
        reviewOrderNo: reviewOrderNo || '',
        actions: actions
    };
}

module.exports = {
    addressOptions: addressOptions,
    addressesFor: addressesFor,
    capabilities: capabilities,
    cartData: cartData,
    categoriesFor: categoriesFor,
    formatMoney: formatMoney,
    formatProductPrice: formatProductPrice,
    orderDetails: orderDetails,
    orderSummary: orderSummary,
    paymentSupport: paymentSupport,
    paymentsFor: paymentsFor,
    promotionsData: promotionsData,
    recentOrderCount: recentOrderCount
};
