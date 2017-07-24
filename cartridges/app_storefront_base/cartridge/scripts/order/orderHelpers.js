'use strict';

var Calendar = require('dw/util/Calendar');
var HashMap = require('dw/util/HashMap');
var Mail = require('dw/net/Mail');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Site = require('dw/system/Site');
var StringUtils = require('dw/util/StringUtils');
var Template = require('dw/util/Template');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');

var OrderModel = require('*/cartridge/models/order');
var formatHelpers = require('*/cartridge/scripts/helpers/formatHelpers');
var collections = require('*/cartridge/scripts/util/collections');

/**
* Returns a list of orders for the current customer
* @param {Object} currentCustomer - object with customer properties
* @param {Object} querystring - querystring properties
* @returns {Object} - orderModel of the current dw order object
* */
function getOrders(currentCustomer, querystring) {
    // get all orders for this user
    var customerNo = currentCustomer.profile.customerNo;
    var customerOrders = OrderMgr.searchOrders(
        'customerNo={0} AND status!={1}',
        'creationDate desc',
        customerNo,
        Order.ORDER_STATUS_REPLACED
    );

    var orders = [];

    var filterValues = [
        {
            displayValue: Resource.msg('orderhistory.sixmonths.option', 'order', null),
            optionValue: URLUtils.url('Order-Filtered', 'orderFilter', '6').abs().toString()
        },
        {
            displayValue: Resource.msg('orderhistory.twelvemonths.option', 'order', null),
            optionValue: URLUtils.url('Order-Filtered', 'orderFilter', '12').abs().toString()
        }
    ];
    var orderYear;
    var years = [];
    var customerOrder;
    var SIX_MONTHS_AGO = Date.now() - 15778476000;
    var YEAR_AGO = Date.now() - 31556952000;
    var orderModel;

    while (customerOrders.hasNext()) {
        customerOrder = customerOrders.next();
        var config = {
            numberOfLineItems: 'single'
        };

        orderYear = customerOrder.getCreationDate().getFullYear().toString();
        var orderTime = customerOrder.getCreationDate().getTime();

        if (years.indexOf(orderYear) === -1) {
            var optionURL =
                URLUtils.url('Order-Filtered', 'orderFilter', orderYear).abs().toString();
            filterValues.push({
                displayValue: orderYear,
                optionValue: optionURL
            });
            years.push(orderYear);
        }

        if (querystring.orderFilter
            && querystring.orderFilter !== '12'
            && querystring.orderFilter !== '6') {
            if (orderYear === querystring.orderFilter) {
                orderModel = new OrderModel(customerOrder, { config: config });
                orders.push(orderModel);
            }
        } else if (querystring.orderFilter
            && YEAR_AGO < orderTime
            && querystring.orderFilter === '12') {
            orderModel = new OrderModel(customerOrder, { config: config });
            orders.push(orderModel);
        } else if (SIX_MONTHS_AGO < orderTime) {
            orderModel = new OrderModel(customerOrder, { config: config });
            orders.push(orderModel);
        }
    }

    return {
        orders: orders,
        filterValues: filterValues
    };
}

/**
 * Sends a confirmation email to the newly registered user
 * @param {Object} registeredUser - The newly registered user
 * @returns {void}
 */
function sendConfirmationEmail(registeredUser) {
    var confirmationEmail = new Mail();
    var context = new HashMap();
    var template;
    var content;

    var userObject = {
        email: registeredUser.email,
        firstName: registeredUser.firstName,
        lastName: registeredUser.lastName,
        url: URLUtils.https('Login-Show')
    };

    confirmationEmail.addTo(userObject.email);
    confirmationEmail.setSubject(
        Resource.msg('email.subject.new.registration', 'registration', null)
    );
    confirmationEmail.setFrom(Site.current.getCustomPreferenceValue('customerServiceEmail')
        || 'no-reply@salesforce.com');

    Object.keys(userObject).forEach(function (key) {
        context.put(key, userObject[key]);
    });

    template = new Template('checkout/confirmation/accountRegisteredEmail');
    content = template.render(context).text;
    confirmationEmail.setContent(content, 'text/html', 'UTF-8');
    confirmationEmail.send();
}

/**
 * Build the urls that report on the order
 * @param {dw.order.Order} order - the order object
 * @returns {Array} - an array of urls that are used to report on the current order
 */
function getReportingUrls(order) {
    var reportingURLs = [];

    // Report the general information about the order
    var orderEvent = URLUtils.url('ReportingEvent-Start',
        'ID', 'Order',
        'CurrencyCode', order.currencyCode,
        'CreationDate', StringUtils.formatCalendar(
            new Calendar(order.creationDate), 'yyyyMMdd\'T\'HH:mm:ss.SSSZ'
        ),
        'CreatedBy', order.createdBy,
        'MerchandizeTotalNet', formatHelpers.formatPrice(order.merchandizeTotalNetPrice.value),
        'MerchandizeTotalTax', formatHelpers.formatPrice(order.merchandizeTotalTax.value),
        'MerchandizeTotalGross', formatHelpers.formatPrice(order.merchandizeTotalGrossPrice.value),
        'ShippingNet', formatHelpers.formatPrice(order.shippingTotalNetPrice.value),
        'ShippingTax', formatHelpers.formatPrice(order.shippingTotalTax.value),
        'ShippingGross', formatHelpers.formatPrice(order.shippingTotalGrossPrice.value),
        'AdjMerchandizeTotalNet', formatHelpers.formatPrice(
            order.adjustedMerchandizeTotalNetPrice.value
        ),
        'AdjMerchandizeTotalTax', formatHelpers.formatPrice(
            order.adjustedMerchandizeTotalTax.value
        ),
        'AdjMerchandizeTotalGross', formatHelpers.formatPrice(
            order.adjustedMerchandizeTotalGrossPrice.value
        ),
        'AdjShippingNet', formatHelpers.formatPrice(order.adjustedShippingTotalNetPrice.value),
        'AdjShippingTax', formatHelpers.formatPrice(order.adjustedShippingTotalTax.value),
        'AdjShippingGross', formatHelpers.formatPrice(order.adjustedShippingTotalGrossPrice.value),
        'Net', formatHelpers.formatPrice(order.totalNetPrice.value),
        'Tax', formatHelpers.formatPrice(order.totalTax.value),
        'Gross', formatHelpers.formatPrice(order.totalGrossPrice.value)
    );

    reportingURLs.push(orderEvent);

    // Report all price adjustments for the entire order, such as 25% of entire order.
    collections.forEach(order.priceAdjustments, function (priceAdjustment) {
        var OrderPromoUrl = URLUtils.url('ReportingEvent-Start',
            'ID', 'OrderPromo',
            'campID', priceAdjustment.campaignID ? priceAdjustment.campaignID : 'N/A',
            'promoID', priceAdjustment.promotionID,
            'value', formatHelpers.formatPrice(priceAdjustment.price.value),
            'campaign', !priceAdjustment.isCustom(),
            'coupon', priceAdjustment.basedOnCoupon
        );

        reportingURLs.push(OrderPromoUrl);
    });

    // Check all shipments for shipping promotions, lineitems and their promotions
    collections.forEach(order.shipments, function (shipment) {
        // The shipment might have one or more price adjustments
        collections.forEach(shipment.shippingPriceAdjustments, function (shippingPriceAdjustment) {
            var shippingPromoUrl = URLUtils.url('ReportingEvent-Start',
                'ID', 'ShippingPromo',
                'campID', shippingPriceAdjustment.campaignID
                    ? shippingPriceAdjustment.campaignID
                    : 'N/A',
                'promoID', shippingPriceAdjustment.promotionID,
                'value', formatHelpers.formatPrice(shippingPriceAdjustment.price.value),
                'campaign', !shippingPriceAdjustment.isCustom(),
                'coupon', shippingPriceAdjustment.basedOnCoupon
            );

            reportingURLs.push(shippingPromoUrl);
        });
        // Log event for each product line item
        collections.forEach(shipment.productLineItems, function (productLineItem) {
            var itemUrl = URLUtils.url('ReportingEvent-Start',
                'ID', 'Item',
                'SKU', productLineItem.productID,
                'Name', productLineItem.productName,
                'UUID', productLineItem.UUID,
                'Quantity', formatHelpers.formatNumber(productLineItem.quantity.value),
                'CurrencyCode', order.currencyCode,
                'Base', formatHelpers.formatPrice(productLineItem.basePrice.value),
                'Net', formatHelpers.formatPrice(productLineItem.netPrice.value),
                'Tax', formatHelpers.formatPrice(productLineItem.tax.value),
                'Gross', formatHelpers.formatPrice(productLineItem.grossPrice.value),
                'AdjNet', formatHelpers.formatPrice(productLineItem.adjustedNetPrice.value),
                'AdjTax', formatHelpers.formatPrice(productLineItem.adjustedTax.value),
                'AdjGross', formatHelpers.formatPrice(productLineItem.adjustedGrossPrice.value),
                'Mfg', productLineItem.manufacturerName,
                'Bonus', productLineItem.bonusProductLineItem
            );

            reportingURLs.push(itemUrl);

            // Each item can have multiple price adjustments
            collections.forEach(productLineItem.priceAdjustments, function (PLIPriceAdjustments) {
                var ItemPromo = URLUtils.url('ReportingEvent-Start',
                    'ID', 'ItemPromo',
                    'ItemUUID', productLineItem.UUID,
                    'campID', PLIPriceAdjustments.campaignID
                        ? PLIPriceAdjustments.campaignID
                        : 'N/A',
                    'promoID', PLIPriceAdjustments.promotionID,
                    'value', formatHelpers.formatPrice(PLIPriceAdjustments.price.value),
                    'campaign', !PLIPriceAdjustments.isCustom(),
                    'coupon', PLIPriceAdjustments.basedOnCoupon
                );

                reportingURLs.push(ItemPromo);
            });
        });
    });

    return reportingURLs;
}

module.exports = {
    getOrders: getOrders,
    sendConfirmationEmail: sendConfirmationEmail,
    getReportingUrls: getReportingUrls
};
