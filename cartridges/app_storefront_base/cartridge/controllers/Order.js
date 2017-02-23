'use strict';

var server = require('server');

var CustomerMgr = require('dw/customer/CustomerMgr');
var HashMap = require('dw/util/HashMap');
var Mail = require('dw/net/Mail');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Template = require('dw/util/Template');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');

var orderHelpers = require('~/cartridge/scripts/placeOrderHelpers');

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
                orderModel = orderHelpers.buildOrderModel(customerOrder, config);
                orders.push(orderModel);
            }
        } else if (querystring.orderFilter
            && YEAR_AGO < orderTime
            && querystring.orderFilter === '12') {
            orderModel = orderHelpers.buildOrderModel(customerOrder, config);
            orders.push(orderModel);
        } else if (SIX_MONTHS_AGO < orderTime) {
            orderModel = orderHelpers.buildOrderModel(customerOrder, config);
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

server.get('Confirm', function (req, res, next) {
    var order = OrderMgr.getOrder(req.querystring.ID);
    var config = {
        numberOfLineItems: '*'
    };
    var orderModel = orderHelpers.buildOrderModel(order, config);
    var passwordForm;

    if (!req.currentCustomer.profile) {
        passwordForm = server.forms.getForm('newpasswords');
        passwordForm.clear();
        res.render('checkout/confirmation/confirmation', {
            order: orderModel,
            returningCustomer: false,
            passwordForm: passwordForm
        });
    } else {
        res.render('checkout/confirmation/confirmation', {
            order: orderModel,
            returningCustomer: true
        });
    }

    next();
});

server.post('Track', server.middleware.https, function (req, res, next) {
    var order;
    var validForm = true;

    var profileForm = server.forms.getForm('profile');
    profileForm.clear();

    if (req.form.trackOrderEmail && req.form.trackOrderPostal && req.form.trackOrderNumber) {
        order = OrderMgr.getOrder(req.form.trackOrderNumber);
    } else {
        validForm = false;
    }

    if (!order) {
        res.render('/account/login', {
            navTabValue: 'login',
            orderTrackFormError: validForm,
            profileForm: profileForm,
            userName: ''
        });
        next();
    } else {
        var config = {
            numberOfLineItems: '*'
        };
        var orderModel = orderHelpers.buildOrderModel(order, config);

        // check the email and postal code of the form
        if (req.form.trackOrderEmail !== orderModel.orderEmail) {
            validForm = false;
        }

        if (req.form.trackOrderPostal
            !== orderModel.billing.billingAddress.address.postalCode) {
            validForm = false;
        }

        if (validForm) {
            var exitLinkText;
            var exitLinkUrl;

            exitLinkText = !req.currentCustomer.profile
                ? Resource.msg('link.continue.shop', 'order', null)
                : Resource.msg('link.orderdetails.myaccount', 'account', null);

            exitLinkUrl = !req.currentCustomer.profile
                ? URLUtils.https('Home-Show')
                : URLUtils.https('Account-Show');

            res.render('account/orderdetails', {
                order: orderModel,
                exitLinkText: exitLinkText,
                exitLinkUrl: exitLinkUrl
            });
        } else {
            res.render('/account/login', {
                navTabValue: 'login',
                profileForm: profileForm,
                orderTrackFormError: !validForm,
                userName: ''
            });
        }

        next();
    }
});

server.get('History', server.middleware.https, function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    } else {
        var ordersResult = getOrders(req.currentCustomer, req.querystring);
        var orders = ordersResult.orders;
        var filterValues = ordersResult.filterValues;

        res.render('account/order/history', {
            orders: orders,
            filterValues: filterValues,
            orderFilter: req.querystring.orderFilter,
            accountlanding: false
        });
    }
    next();
});

server.get('Details', server.middleware.https, function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    } else {
        var order = OrderMgr.getOrder(req.querystring.orderID);
        var orderCustomerNo = req.currentCustomer.profile.customerNo;
        var currentCustomerNo = order.customer.profile.customerNo;

        if (order && orderCustomerNo === currentCustomerNo) {
            var config = {
                numberOfLineItems: '*'
            };

            var orderModel = orderHelpers.buildOrderModel(order, config);
            var exitLinkText = Resource.msg('link.orderdetails.orderhistory', 'account', null);
            var exitLinkUrl =
                URLUtils.https('Order-History', 'orderFilter', req.querystring.orderFilter);
            res.render('account/orderdetails', {
                order: orderModel,
                exitLinkText: exitLinkText,
                exitLinkUrl: exitLinkUrl
            });
        } else {
            res.redirect(URLUtils.url('Account-Show'));
        }
    }
    next();
});

server.get('Filtered', server.middleware.https, function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    } else {
        var ordersResult = getOrders(req.currentCustomer, req.querystring);
        var orders = ordersResult.orders;
        var filterValues = ordersResult.filterValues;

        res.render('account/order/orderlist', {
            orders: orders,
            filterValues: filterValues,
            orderFilter: req.querystring.orderFilter,
            accountlanding: false
        });
    }
    next();
});

server.post('CreateAccount', server.middleware.https, function (req, res, next) {
    var formErrors = require('~/cartridge/scripts/formErrors');

    var passwordForm = server.forms.getForm('newpasswords');
    var newPassword = passwordForm.newpassword.htmlValue;
    var confirmPassword = passwordForm.newpasswordconfirm.htmlValue;
    if (newPassword !== confirmPassword) {
        passwordForm.valid = false;
        passwordForm.newpasswordconfirm.valid = false;
        passwordForm.newpasswordconfirm.error =
            Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    var order = OrderMgr.getOrder(req.querystring.ID);

    var registrationObj = {
        firstName: order.billingAddress.firstName,
        lastName: order.billingAddress.lastName,
        phone: order.billingAddress.phone,
        email: order.customerEmail,
        password: newPassword
    };

    if (passwordForm.valid) {
        res.setViewData(registrationObj);

        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var registrationData = res.getViewData();

            var login = registrationData.email;
            var password = registrationData.password;
            var newCustomer;
            var authenticatedCustomer;
            var newCustomerProfile;
            var registeredUser;

            // attempt to create a new user and log that user in.
            try {
                Transaction.wrap(function () {
                    newCustomer = CustomerMgr.createCustomer(login, password);
                    authenticatedCustomer =
                        CustomerMgr.loginCustomer(login, password, false);
                    if (newCustomer && authenticatedCustomer.authenticated) {
                        // assign values to the profile
                        newCustomerProfile = newCustomer.getProfile();
                        newCustomerProfile.firstName = registrationData.firstName;
                        newCustomerProfile.lastName = registrationData.lastName;
                        newCustomerProfile.phoneHome = registrationData.phone;
                        newCustomerProfile.email = registrationData.email;
                        order.setCustomer(newCustomer);
                        registeredUser = {
                            email: login,
                            firstName: registrationData.firstName,
                            lastName: registrationData.lastName
                        };
                        sendConfirmationEmail(registeredUser);
                        res.json({
                            success: true,
                            redirectUrl: URLUtils.url('Account-Show').toString()
                        });
                    }
                });
            } catch (e) {
                res.json({
                    error: [Resource.msg('error.account.exists', 'checkout', null)]
                }); // Show error if the login email already exists
            }
        });
    } else {
        res.json({
            fields: formErrors(passwordForm)
        });
    }
    next();
});

module.exports = server.exports();
