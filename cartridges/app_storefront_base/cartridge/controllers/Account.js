'use strict';

var server = require('server');

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

/**
 * Creates an account model for the current customer
 * @param {Object} req - local instance of request object
 * @returns {Object} a plain object of the current customer's account
 */
function getModel(req) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Order = require('dw/order/Order');
    var AccountModel = require('*/cartridge/models/account');
    var AddressModel = require('*/cartridge/models/address');
    var OrderModel = require('*/cartridge/models/order');
    var Locale = require('dw/util/Locale');

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
        var currentLocale = Locale.getLocale(req.locale.id);

        var config = {
            numberOfLineItems: 'single'
        };

        orderModel = new OrderModel(order, { config: config, countryCode: currentLocale.country });
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

/**
 * Checks if the email value entered is correct format
 * @param {string} email - email string to check if valid
 * @returns {boolean} Whether email is valid
 */
function validateEmail(email) {
    var regex = /^[\w.%+-]+@[\w.-]+\.[\w]{2,6}$/;
    return regex.test(email);
}

/**
 * Gets the password reset token of a customer
 * @param {Object} customer - the customer requesting password reset token
 * @returns {string} password reset token string
 */
function getPasswordResetToken(customer) {
    var Transaction = require('dw/system/Transaction');

    var passwordResetToken;
    Transaction.wrap(function () {
        passwordResetToken = customer.profile.credentials.createResetPasswordToken();
    });
    return passwordResetToken;
}

/**
 * Sends the email with password reset instructions
 * @param {string} email - email for password reset
 * @param {Object} resettingCustomer - the customer requesting password reset
 */
function sendPasswordResetEmail(email, resettingCustomer) {
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var Mail = require('dw/net/Mail');
    var Template = require('dw/util/Template');
    var Site = require('dw/system/Site');
    var HashMap = require('dw/util/HashMap');

    var template;
    var content;
    var passwordResetToken = getPasswordResetToken(resettingCustomer);
    var url = URLUtils.https('Account-SetNewPassword', 'token', passwordResetToken);
    var objectForEmail = {
        passwordResetToken: passwordResetToken,
        firstName: resettingCustomer.profile.firstName,
        lastName: resettingCustomer.profile.lastName,
        url: url
    };
    var resetPasswordEmail = new Mail();
    var context = new HashMap();
    Object.keys(objectForEmail).forEach(function (key) {
        context.put(key, objectForEmail[key]);
    });

    resetPasswordEmail.addTo(email);
    resetPasswordEmail.setSubject(
        Resource.msg('subject.profile.resetpassword.email', 'login', null));
    resetPasswordEmail.setFrom(Site.current.getCustomPreferenceValue('customerServiceEmail')
        || 'no-reply@salesforce.com');

    template = new Template('account/password/passwordResetEmail');
    content = template.render(context).text;
    resetPasswordEmail.setContent(content, 'text/html', 'UTF-8');
    resetPasswordEmail.send();
}

server.get(
    'Show',
    server.middleware.https,
    userLoggedIn.validateLoggedIn,
    consentTracking.consent,
    function (req, res, next) {
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');
        var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
        var reportingURLs;

        // Get reporting event Account Open url
        if (req.querystring.registration && req.querystring.registration === 'submitted') {
            reportingURLs = reportingUrlsHelper.getAccountOpenReportingURLs(
                CustomerMgr.registeredCustomerCount
            );
        }

        var accountModel = getModel(req);
        res.render('account/accountDashboard', {
            account: accountModel,
            accountlanding: true,
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                }
            ],
            reportingURLs: reportingURLs
        });
        next();
    }
);

server.post(
    'Login',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var Transaction = require('dw/system/Transaction');
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');

        var email = req.form.loginEmail;
        var password = req.form.loginPassword;
        var rememberMe = req.form.loginRememberMe
            ? (!!req.form.loginRememberMe)
            : false;
        var authenticatedCustomer;
        var checkoutLogin = req.querystring.checkoutLogin;

        Transaction.wrap(function () {
            authenticatedCustomer = CustomerMgr.loginCustomer(email, password, rememberMe);
        });
        if (authenticatedCustomer && authenticatedCustomer.authenticated) {
            res.setViewData({ authenticatedCustomer: authenticatedCustomer });
            res.json({
                success: true,
                redirectUrl: checkoutLogin
                    ? URLUtils.url('Checkout-Begin').toString()
                    : URLUtils.url('Account-Show').toString()
            });
        } else {
            res.json({ error: [Resource.msg('error.message.login.form', 'login', null)] });
        }

        return next();
    }
);

server.post(
    'SubmitRegistration',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');

        var formErrors = require('*/cartridge/scripts/formErrors');

        var registrationForm = server.forms.getForm('profile');

        // form validation
        if (registrationForm.customer.email.value.toLowerCase()
            !== registrationForm.customer.emailconfirm.value.toLowerCase()
        ) {
            registrationForm.customer.email.valid = false;
            registrationForm.customer.emailconfirm.valid = false;
            registrationForm.customer.emailconfirm.error =
                Resource.msg('error.message.mismatch.email', 'forms', null);
            registrationForm.valid = false;
        }

        if (registrationForm.login.password.value
            !== registrationForm.login.passwordconfirm.value
        ) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error =
                Resource.msg('error.message.mismatch.password', 'forms', null);
            registrationForm.valid = false;
        }

        if (!CustomerMgr.isAcceptablePassword(registrationForm.login.password.value)) {
            registrationForm.login.password.valid = false;
            registrationForm.login.passwordconfirm.valid = false;
            registrationForm.login.passwordconfirm.error =
                Resource.msg('error.message.password.constraints.not.matched', 'forms', null);
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
                var Transaction = require('dw/system/Transaction');
                var URLUtils = require('dw/web/URLUtils');

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
                        registrationForm.form.customer.email.error =
                            Resource.msg('error.message.username.invalid', 'forms', null);
                    }
                }

                delete registrationForm.password;
                delete registrationForm.passwordConfirm;
                formErrors.removeFormValues(registrationForm.form);

                if (registrationForm.validForm) {
                    res.setViewData({ authenticatedCustomer: authenticatedCustomer }); // eslint-disable-line block-scoped-var
                    res.json({
                        success: true,
                        redirectUrl: URLUtils.url('Account-Show',
                            'registration', 'submitted'
                        ).toString()
                    });
                } else {
                    res.json({
                        fields: formErrors.getFormErrors(registrationForm)
                    });
                }
            });
        } else {
            res.json({
                fields: formErrors.getFormErrors(registrationForm)
            });
        }

        return next();
    }
);

server.get(
    'EditProfile',
    server.middleware.https,
    csrfProtection.generateToken,
    userLoggedIn.validateLoggedIn,
    consentTracking.consent,
    function (req, res, next) {
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');

        var accountModel = getModel(req);
        var profileForm = server.forms.getForm('profile');
        profileForm.clear();
        profileForm.customer.firstname.value = accountModel.profile.firstName;
        profileForm.customer.lastname.value = accountModel.profile.lastName;
        profileForm.customer.phone.value = accountModel.profile.phone;
        profileForm.customer.email.value = accountModel.profile.email;
        res.render('account/profile', {
            profileForm: profileForm,
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                }
            ]
        });
        next();
    }
);

server.post(
    'SaveProfile',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var Transaction = require('dw/system/Transaction');
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');

        var formErrors = require('*/cartridge/scripts/formErrors');

        var profileForm = server.forms.getForm('profile');

        // form validation
        if (profileForm.customer.email.value.toLowerCase()
            !== profileForm.customer.emailconfirm.value.toLowerCase()) {
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
                    status = profile.credentials.setPassword(
                            formInfo.password,
                            formInfo.password,
                            true
                    );
                    if (status.error) {
                        formInfo.profileForm.login.password.valid = false;
                        formInfo.profileForm.login.password.error =
                            Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                    } else {
                        customerLogin = profile.credentials.setLogin(
                                formInfo.email,
                                formInfo.password
                        );
                    }
                });

                delete formInfo.password;
                delete formInfo.confirmEmail;

                if (customerLogin) {
                    Transaction.wrap(function () {
                        profile.setFirstName(formInfo.firstName);
                        profile.setLastName(formInfo.lastName);
                        profile.setEmail(formInfo.email);
                        profile.setPhoneHome(formInfo.phone);
                    });

                    delete formInfo.profileForm;
                    delete formInfo.email;

                    res.json({
                        success: true,
                        redirectUrl: URLUtils.url('Account-Show').toString()
                    });
                } else {
                    if (!status.error) {
                        formInfo.profileForm.customer.email.valid = false;
                        formInfo.profileForm.customer.email.error =
                            Resource.msg('error.message.username.invalid', 'forms', null);
                    }

                    delete formInfo.profileForm;
                    delete formInfo.email;

                    res.json({
                        success: false,
                        fields: formErrors.getFormErrors(profileForm)
                    });
                }
            });
        } else {
            res.json({
                success: false,
                fields: formErrors.getFormErrors(profileForm)
            });
        }
        return next();
    }
);

server.get(
    'EditPassword',
    server.middleware.https,
    csrfProtection.generateToken,
    userLoggedIn.validateLoggedIn,
    consentTracking.consent,
    function (req, res, next) {
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');

        var profileForm = server.forms.getForm('profile');
        profileForm.clear();
        res.render('account/password', {
            profileForm: profileForm,
            breadcrumbs: [
                {
                    htmlValue: Resource.msg('global.home', 'common', null),
                    url: URLUtils.home().toString()
                },
                {
                    htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                    url: URLUtils.url('Account-Show').toString()
                }
            ]
        });
        next();
    }
);

server.post(
    'SavePassword',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var Transaction = require('dw/system/Transaction');
        var CustomerMgr = require('dw/customer/CustomerMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');

        var formErrors = require('*/cartridge/scripts/formErrors');

        var profileForm = server.forms.getForm('profile');
        var newPasswords = profileForm.login.newpasswords;
        // form validation
        if (newPasswords.newpassword.value !== newPasswords.newpasswordconfirm.value) {
            profileForm.valid = false;
            newPasswords.newpassword.valid = false;
            newPasswords.newpasswordconfirm.valid = false;
            newPasswords.newpasswordconfirm.error =
                Resource.msg('error.message.mismatch.newpassword', 'forms', null);
        }

        var result = {
            currentPassword: profileForm.login.currentpassword.value,
            newPassword: newPasswords.newpassword.value,
            newPasswordConfirm: newPasswords.newpasswordconfirm.value,
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

                    delete formInfo.currentPassword;
                    delete formInfo.newPassword;
                    delete formInfo.newPasswordConfirm;
                    delete formInfo.profileForm;

                    res.json({
                        success: false,
                        fields: formErrors.getFormErrors(profileForm)
                    });
                } else {
                    delete formInfo.currentPassword;
                    delete formInfo.newPassword;
                    delete formInfo.newPasswordConfirm;
                    delete formInfo.profileForm;

                    res.json({
                        success: true,
                        redirectUrl: URLUtils.url('Account-Show').toString()
                    });
                }
            });
        } else {
            res.json({
                success: false,
                fields: formErrors.getFormErrors(profileForm)
            });
        }
        return next();
    }
);

server.post('PasswordResetDialogForm', server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');

    var email = req.form.loginEmail;
    var errorMsg;
    var isValid;
    var resettingCustomer;
    var mobile = req.querystring.mobile;
    var receivedMsgHeading = Resource.msg('label.resetpasswordreceived', 'login', null);
    var receivedMsgBody = Resource.msg('msg.requestedpasswordreset', 'login', null);
    var buttonText = Resource.msg('button.text.loginform', 'login', null);
    var returnUrl = URLUtils.url('Login-Show').toString();
    if (email) {
        isValid = validateEmail(email);
        if (isValid) {
            resettingCustomer = CustomerMgr.getCustomerByLogin(email);
            if (resettingCustomer) {
                sendPasswordResetEmail(email, resettingCustomer);
            }
            res.json({
                success: true,
                receivedMsgHeading: receivedMsgHeading,
                receivedMsgBody: receivedMsgBody,
                buttonText: buttonText,
                mobile: mobile,
                returnUrl: returnUrl
            });
        } else {
            errorMsg = Resource.msg('error.message.passwordreset', 'login', null);
            res.json({
                fields: {
                    loginEmail: errorMsg
                }
            });
        }
    } else {
        errorMsg = Resource.msg('error.message.required', 'login', null);
        res.json({
            fields: {
                loginEmail: errorMsg
            }
        });
    }
    next();
});

server.get('PasswordReset', server.middleware.https, function (req, res, next) {
    res.render('account/password/requestPasswordReset', { mobile: true });
    next();
});

server.get('SetNewPassword', server.middleware.https, consentTracking.consent, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var URLUtils = require('dw/web/URLUtils');

    var passwordForm = server.forms.getForm('newPasswords');
    passwordForm.clear();
    var token = req.querystring.token;
    var resettingCustomer = CustomerMgr.getCustomerByToken(token);
    if (!resettingCustomer) {
        res.redirect(URLUtils.url('Account-PasswordReset'));
    } else {
        res.render('account/password/newPassword', { passwordForm: passwordForm, token: token });
    }
    next();
});

server.post('SaveNewPassword', server.middleware.https, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var Resource = require('dw/web/Resource');

    var passwordForm = server.forms.getForm('newPasswords');
    var token = req.querystring.token;

    if (passwordForm.newpassword.value !== passwordForm.newpasswordconfirm.value) {
        passwordForm.valid = false;
        passwordForm.newpassword.valid = false;
        passwordForm.newpasswordconfirm.valid = false;
        passwordForm.newpasswordconfirm.error =
            Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    if (passwordForm.valid) {
        var result = {
            newPassword: passwordForm.newpassword.value,
            newPasswordConfirm: passwordForm.newpasswordconfirm.value,
            token: token,
            passwordForm: passwordForm
        };
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var CustomerMgr = require('dw/customer/CustomerMgr');
            var URLUtils = require('dw/web/URLUtils');
            var Mail = require('dw/net/Mail');
            var Template = require('dw/util/Template');
            var Site = require('dw/system/Site');
            var HashMap = require('dw/util/HashMap');

            var formInfo = res.getViewData();
            var status;
            var resettingCustomer;
            Transaction.wrap(function () {
                resettingCustomer = CustomerMgr.getCustomerByToken(formInfo.token);
                status = resettingCustomer.profile.credentials.setPasswordWithToken(
                    formInfo.token,
                    formInfo.newPassword
                );
            });
            if (status.error) {
                passwordForm.newpassword.valid = false;
                passwordForm.newpasswordconfirm.valid = false;
                passwordForm.newpasswordconfirm.error =
                    Resource.msg('error.message.resetpassword.invalidformentry', 'forms', null);
                res.render('account/password/newPassword', {
                    passwordForm: passwordForm,
                    token: token
                });
            } else {
                var email = resettingCustomer.profile.email;
                var url = URLUtils.https('Login-Show');
                var objectForEmail = {
                    firstName: resettingCustomer.profile.firstName,
                    lastName: resettingCustomer.profile.lastName,
                    url: url
                };
                var passwordChangedEmail = new Mail();
                var context = new HashMap();
                Object.keys(objectForEmail).forEach(function (key) {
                    context.put(key, objectForEmail[key]);
                });

                passwordChangedEmail.addTo(email);
                passwordChangedEmail.setSubject(
                    Resource.msg('subject.profile.resetpassword.email', 'login', null));
                passwordChangedEmail.setFrom(
                    Site.current.getCustomPreferenceValue('customerServiceEmail')
                    || 'no-reply@salesforce.com');

                var template = new Template('account/password/passwordChangedEmail');
                var content = template.render(context).text;
                passwordChangedEmail.setContent(content, 'text/html', 'UTF-8');
                passwordChangedEmail.send();
                res.redirect(URLUtils.url('Login-Show'));
            }
        });
    } else {
        res.render('account/password/newPassword', { passwordForm: passwordForm, token: token });
    }
    next();
});

server.get('Header', server.middleware.include, function (req, res, next) {
    var template = req.querystring.mobile ? 'account/mobileHeader' : 'account/header';
    res.render(template, { name:
        req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null
    });
    next();
});

module.exports = server.exports();
