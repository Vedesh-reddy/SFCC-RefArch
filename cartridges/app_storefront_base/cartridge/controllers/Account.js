'use strict';

var server = require('server');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var ShippingMgr = require('dw/order/ShippingMgr');
var AccountModel = require('~/cartridge/models/account');
var AddressModel = require('~/cartridge/models/address');
var OrderModel = require('~/cartridge/models/order');
var ShippingModel = require('~/cartridge/models/shipping');
var Totals = require('~/cartridge/models/totals');
var Transaction = require('dw/system/Transaction');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');

/**
 * Creates an account model for the current customer
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object of the current customer's account
 */
function getModel(req) {
    var orderModel;
    var preferredAddressModel;

    if (!req.currentCustomer.profile) {
        return null;
    }

    var customerNo = req.currentCustomer.profile.customerNo;
    var customerOrders = OrderMgr.searchOrders(
        'customerNo={0} AND status!={1}',
        'creationDate desc',
        customerNo,
        Order.ORDER_STATUS_REPLACED
	);

    var order = customerOrders.first();

    if (order) {
        var defaultShipment = order.defaultShipment;
        var ordershippingAdress = defaultShipment.shippingAddress;
        var shippingAddressModel = new AddressModel(ordershippingAdress);
        var shipmentShippingModel = ShippingMgr.getShipmentShippingModel(defaultShipment);
        var shippingModel = new ShippingModel(
            defaultShipment,
            shipmentShippingModel,
            shippingAddressModel
        );
        var allProducts = order.allProductLineItems;
        var orderTotals = new Totals(order);
        orderModel = new OrderModel(order, shippingModel, null, orderTotals, allProducts);
    } else {
        orderModel = null;
    }

    if (req.currentCustomer.addressBook.preferredAddress) {
        preferredAddressModel = new AddressModel(req.currentCustomer.addressBook.preferredAddress);
    } else {
        preferredAddressModel = null;
    }

    return new AccountModel(req.currentCustomer, preferredAddressModel, orderModel);
}

server.get('Show', function (req, res, next) {
    var accountModel = getModel(req);

    if (accountModel) {
        res.render('account/accountdashboard', getModel(req));
    } else {
        res.redirect(URLUtils.url('Login-Show'));
    }
    next();
});

server.post('Login', server.middleware.https, function (req, res, next) {
    var email = req.form.loginEmail;
    var password = req.form.loginPassword;
    var rememberMe = req.form.loginRememberMe
        ? req.form.loginRememberMe
        : false;

    var authenticatedCustomer;
    Transaction.wrap(function () {
        authenticatedCustomer = CustomerMgr.loginCustomer(email, password, rememberMe);
    });
    if (authenticatedCustomer && authenticatedCustomer.authenticated) {
        // TODO clear form elements?
        res.redirect(URLUtils.url('Account-Show'));
    } else {
        res.render('/account/login', {
            navTabValue: 'login',
            loginFormError: true
        });
    }
    next();
});

server.get('Registration', server.middleware.https, function (req, res, next) {
    var profileForm = server.forms.getForm('profile');

    // TODO clear form
    res.render('/account/register', {
        profileForm: profileForm,
        navTabValue: 'register'
    });
    next();
});

server.post('SubmitRegistration', server.middleware.https, function (req, res, next) {
    var registrationForm = server.forms.getForm('profile');

    // form validation
    if (registrationForm.customer.email.value !== registrationForm.customer.emailconfirm.value) {
        registrationForm.customer.email.valid = false;
        registrationForm.customer.emailconfirm.valid = false;
        registrationForm.customer.emailconfirm.error =
            Resource.msg('error.message.mismatch.email', 'forms', null);
        registrationForm.valid = false;
    }

    if (registrationForm.login.password.value !== registrationForm.login.passwordconfirm.value) {
        registrationForm.login.password.valid = false;
        registrationForm.login.passwordconfirm.valid = false;
        registrationForm.login.passwordconfirm.error =
            Resource.msg('error.message.mismatch.password', 'forms', null);
        registrationForm.valid = false;
    }

    // setting variables for the BeforeComplete function
    var registrationFormObj = {
        firstName: registrationForm.customer.firstname.value,
        lastName: registrationForm.customer.lastname.value,
        phone: registrationForm.customer.phone.value,
        email: registrationForm.customer.email.value,
        emailConfirm: registrationForm.customer.emailconfirm.value,
        password: registrationForm.login.password.value,
        passwordConfirm: registrationForm.login.passwordconfirm.value,
        validForm: registrationForm.valid,
        form: registrationForm
    };

    if (registrationForm.valid) {
        res.setViewData(registrationFormObj);

        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            // getting variables for the BeforeComplete function
            var registrationForm = res.getViewData(); // eslint-disable-line

            if (registrationForm.validForm) {
                var login = registrationForm.email;
                var password = registrationForm.password;
                var authenticatedCustomer;

                // attempt to create a new user and log that user in.
                try {
                    Transaction.wrap(function () {
                        var newCustomer = CustomerMgr.createCustomer(login, password);

                        if (newCustomer) {
                            // assign values to the profile
                            var newCustomerProfile = newCustomer.getProfile();
                            authenticatedCustomer =
                                CustomerMgr.loginCustomer(login, password, false);
                            newCustomerProfile.firstName = registrationForm.firstName;
                            newCustomerProfile.lastName = registrationForm.lastName;
                            newCustomerProfile.phoneHome = registrationForm.phone;
                            newCustomerProfile.email = registrationForm.email;
                        }

                        if (authenticatedCustomer === undefined) {
                            registrationForm.validForm = false;
                            registrationForm.form.customer.email.valid = false;
                            registrationForm.form.customer.emailconfirm.valid = false;
                        }
                    });
                } catch (e) {
                    registrationForm.validForm = false;
                    registrationForm.form.customer.email.valid = false;
                    registrationForm.form.customer.emailconfirm.valid = false;
                    registrationForm.form.customer.emailconfirm.error =
                        Resource.msg('error.message.username.taken', 'forms', null);
                }
            }

            if (registrationForm.validForm) {
                res.redirect(URLUtils.url('Account-Show'));
            } else {
                res.render('/account/register', {
                    profileForm: registrationForm.form,
                    navTabValue: 'register',
                    registrationFormError: !registrationForm.validForm
                });
            }
        });
    } else {
        res.render('/account/register', {
            profileForm: registrationForm,
            navTabValue: 'register',
            registrationFormError: !registrationForm.validForm
        });
    }
    next();
});

server.get('EditProfile', function (req, res, next) {
    var accountModel = getModel(req);
    if (accountModel) {
        var profileForm = server.forms.getForm('profile');
        profileForm.clear();
        profileForm.customer.firstname.value = accountModel.profile.firstName;
        profileForm.customer.lastname.value = accountModel.profile.lastName;
        profileForm.customer.phone.value = accountModel.profile.phone;
        profileForm.customer.email.value = accountModel.profile.email;
        res.render('account/profile', { profileForm: profileForm });
    } else {
        res.redirect(URLUtils.url('Login-Show'));
    }
    next();
});

server.post('SaveProfile', function (req, res, next) {
    var profileForm = server.forms.getForm('profile');

    // form validation
    if (profileForm.customer.email.value !== profileForm.customer.emailconfirm.value) {
        profileForm.valid = false;
        profileForm.customer.email.valid = false;
        profileForm.customer.emailconfirm.valid = false;
        profileForm.customer.emailconfirm.error =
            Resource.msg('error.message.mismatch.email', 'forms', null);
    }

    var result = {
        firstName: profileForm.customer.firstname.value,
        lastName: profileForm.customer.lastname.value,
        phone: profileForm.customer.phone.value,
        email: profileForm.customer.email.value,
        confirmEmail: profileForm.customer.emailconfirm.value,
        password: profileForm.login.password.value,
        profileForm: profileForm
    };
    if (profileForm.valid) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            var customer = CustomerMgr.getCustomerByCustomerNumber(
                req.currentCustomer.profile.customerNo
            );
            var profile = customer.getProfile();
            var customerLogin;
            var status;
            Transaction.wrap(function () {
                status = customer.profile.credentials.setPassword(
                    formInfo.password,
                    formInfo.password,
                    true
                );
                if (!status.error) {
                    customerLogin = profile.credentials.setLogin(formInfo.email, formInfo.password);
                } else {
                    customerLogin = false;
                    formInfo.profileForm.login.password.valid = false;
                    formInfo.profileForm.login.password.error =
                        Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                }
            });
            if (customerLogin) {
                Transaction.wrap(function () {
                    profile.setFirstName(formInfo.firstName);
                    profile.setLastName(formInfo.lastName);
                    profile.setEmail(formInfo.email);
                    profile.setPhoneHome(formInfo.phone);
                });
                res.redirect(URLUtils.url('Account-Show'));
            } else {
                res.render(
                    'account/profile',
                    { profileForm: profileForm }
                );
            }
        });
    } else {
        res.render('account/profile', { profileForm: profileForm });
    }
    next();
});

server.get('EditPassword', function (req, res, next) {
    var accountModel = getModel(req);
    if (accountModel) {
        var profileForm = server.forms.getForm('profile');
        res.render('account/password', { profileForm: profileForm });
    } else {
        res.redirect(URLUtils.url('Login-Show'));
    }
    next();
});

server.post('SavePassword', function (req, res, next) {
    var profileForm = server.forms.getForm('profile');

    // form validation
    if (profileForm.login.newpassword.value !== profileForm.login.newpasswordconfirm.value) {
        profileForm.valid = false;
        profileForm.login.newpassword.valid = false;
        profileForm.login.newpasswordconfirm.valid = false;
        profileForm.login.newpasswordconfirm.error =
            Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    var result = {
        currentPassword: profileForm.login.currentpassword.value,
        newPassword: profileForm.login.newpassword.value,
        newPasswordConfirm: profileForm.login.newpasswordconfirm.value,
        profileForm: profileForm
    };

    if (profileForm.valid) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            var customer = CustomerMgr.getCustomerByCustomerNumber(
                req.currentCustomer.profile.customerNo
            );
            var status;
            Transaction.wrap(function () {
                status = customer.profile.credentials.setPassword(
                    formInfo.newPassword,
                    formInfo.currentPassword,
                    true
                );
            });
            if (status.error) {
                formInfo.profileForm.login.currentpassword.valid = false;
                formInfo.profileForm.login.currentpassword.error =
                    Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                res.render(
                    'account/password',
                    { profileForm: profileForm }
                );
            } else {
                res.redirect(URLUtils.url('Account-Show'));
            }
        });
    } else {
        res.render('account/password', { profileForm: profileForm });
    }
    next();
});

server.get('Header', server.middleware.include, function (req, res, next) {
    res.render('account/header', { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

server.get('Menu', server.middleware.include, function (req, res, next) {
    res.render('account/menu', { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

module.exports = server.exports();
