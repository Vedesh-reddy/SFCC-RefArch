'use strict';

/**
 * Modification window on the order details page: change the delivery address,
 * cancel an item, swap a variant or cancel the order until the configured cutoff.
 * Every post re-checks ownership and the window server-side.
 * @module controllers/OrderEdit
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var orderSelfService = require('*/cartridge/scripts/orderSelfService');

var customLogger = Logger.getLogger('smart-commerce', 'order-edit');

server.get('Panel', server.middleware.include, csrfProtection.generateToken, function (req, res, next) {
    var message = req.session.privacyCache.get('smartEditMessage');
    req.session.privacyCache.set('smartEditMessage', null);
    var order = orderSelfService.authorizedOrder(req, String(req.querystring.orderNo || ''));
    var edit = order && orderSelfService.isEditable(order) ? orderSelfService.toEditView(order) : null;
    if (edit || message) {
        res.render('smart/order/edit-panel', { edit: edit, message: message });
    } else {
        res.print('');
    }
    next();
});

/**
 * @param {string} name - Route name
 * @param {Function} action - (order, form) => error message or null
 */
function editRoute(name, action) {
    server.post(name, server.middleware.https, csrfProtection.validateRequest, function (req, res, next) {
        if (res.redirectUrl) {
            return next(); // CSRF failure already redirected and logged out
        }
        var orderNo = String(req.form.orderNo || '');
        var order = orderSelfService.authorizedOrder(req, orderNo);
        var error;
        if (!order || !orderSelfService.isEditable(order)) {
            error = Resource.msg('error.edit.closed', 'smartcommerce', null);
        } else {
            try {
                error = action(order, req.form);
            } catch (e) {
                customLogger.error('Order {0} {1} failed: {2}', orderNo, name, e.message);
                error = Resource.msg('error.edit.failed', 'smartcommerce', null);
            }
        }
        req.session.privacyCache.set('smartEditMessage', error || Resource.msg('edit.saved', 'smartcommerce', null));
        var tracked = orderSelfService.trackedOrder(req);
        res.redirect(tracked && tracked.orderNo === orderNo
            ? URLUtils.https('OrderLookup-Details')
            : URLUtils.https('Order-Details', 'orderID', orderNo));
        return next();
    });
}

editRoute('Address', orderSelfService.updateAddress);
editRoute('Cancel', orderSelfService.cancelOrder);
editRoute('CancelItem', function (order, form) {
    return orderSelfService.cancelItem(order, String(form.uuid || ''));
});
editRoute('ChangeVariant', function (order, form) {
    return orderSelfService.changeVariant(order, String(form.uuid || ''), String(form.pid || ''));
});

module.exports = server.exports();
