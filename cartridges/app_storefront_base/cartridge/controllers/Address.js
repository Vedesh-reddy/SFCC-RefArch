'use strict';

var server = require('server');
var CustomerMgr = require('dw/customer/CustomerMgr');
var AddressModel = require('~/cartridge/models/address');
var helper = require('~/cartridge/scripts/dwHelpers');
var URLUtils = require('dw/web/URLUtils');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');

/**
 * Creates a list of address model for the logged in user
 * @param {string} customerNo - customer number of the current customer
 * @returns {List} a plain list of objects of the current customer's addresses
 */
function getList(customerNo) {
    var customer = CustomerMgr.getCustomerByCustomerNumber(customerNo);
    var rawAddressBook = customer.addressBook.getAddresses();
    var addressBook = helper.map(rawAddressBook, function (rawAddress) {
        var addressModel = new AddressModel(rawAddress);
        addressModel.address.UUID = rawAddress.UUID;
        return addressModel;
    });
    return addressBook;
}

/**
 * Creates an object from form values
 * @param {Object} addressForm - form object
 * @returns {Object} a plain object of address
 */
function getDetailsObject(addressForm) {
    return {
        address1: addressForm.address1.value,
        address2: addressForm.address2.value,
        addressId: addressForm.addressId.value,
        city: addressForm.city.value,
        countryCode: addressForm.country.value,
        firstName: addressForm.firstName.value,
        lastName: addressForm.lastName.value,
        phone: addressForm.phone.value,
        postalCode: addressForm.postalCode.value,
        stateCode: addressForm.states.state.value,
        addressForm: addressForm
    };
}

server.get('List', function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show'));
    } else {
        var actionUrls = {
            deleteActionUrl: URLUtils.url('Address-DeleteAddress').toString(),
            listActionUrl: URLUtils.url('Address-List').toString()
        };
        res.render('account/addressbook', {
            addressBook: getList(req.currentCustomer.profile.customerNo),
            actionUrls: actionUrls
        });
    }
    next();
});

server.get('AddAddress', function (req, res, next) {
    var addressForm = server.forms.getForm('address');
    addressForm.address1.value = '';
    addressForm.address2.value = '';
    addressForm.addressId.value = '';
    addressForm.city.value = '';
    addressForm.country.value = '';
    addressForm.firstName.value = '';
    addressForm.lastName.value = '';
    addressForm.phone.value = '';
    addressForm.postalCode.value = '';
    var states = addressForm.states.state.options;
    for (var i = 0, j = states.length; i < j; i++) {
        states[i].selected = false;
    }
    res.render('account/editaddaddress', { addressForm: addressForm });
    next();
});

server.get('EditAddress', function (req, res, next) {
    var addressForm = server.forms.getForm('address');
    var addressId = req.querystring.addressId;
    var customer = CustomerMgr.getCustomerByCustomerNumber(
        req.currentCustomer.profile.customerNo
    );
    var addressBook = customer.getProfile().getAddressBook();
    var rawAddress = addressBook.getAddress(addressId);
    var addressModel = new AddressModel(rawAddress);
    addressForm.address1.value = addressModel.address.address1;
    addressForm.address2.value = addressModel.address.address2;
    addressForm.addressId.value = addressModel.address.ID;
    addressForm.city.value = addressModel.address.city;
    addressForm.country.value = addressModel.address.countryCode.displayValue;
    addressForm.firstName.value = addressModel.address.firstName;
    addressForm.lastName.value = addressModel.address.lastName;
    addressForm.phone.value = addressModel.address.phone;
    addressForm.postalCode.value = addressModel.address.postalCode;
    var states = addressForm.states.state.options;
    for (var i = 0, j = states.length; i < j; i++) {
        states[i].selected = false;
        if (states[i].htmlValue === addressModel.address.stateCode) {
            states[i].selected = true;
        }
    }
    res.render('account/editaddaddress', { addressForm: addressForm, addressId: addressId });
    next();
});

server.post('SaveAddress', function (req, res, next) {
    var addressForm = server.forms.getForm('address');
    var result = getDetailsObject(addressForm);
    var customer = CustomerMgr.getCustomerByCustomerNumber(
        req.currentCustomer.profile.customerNo
    );
    var addressBook = customer.getProfile().getAddressBook();
    if (addressForm.valid) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            Transaction.wrap(function () {
                if (req.querystring.addressId) {
                    var address = addressBook.getAddress(req.querystring.addressId);
                    address.setID(formInfo.addressId);
                    address.setAddress1(formInfo.address1);
                    address.setAddress2(formInfo.address2);
                    address.setCity(formInfo.city);
                    address.setCountryCode(formInfo.countryCode);
                    address.setFirstName(formInfo.firstName);
                    address.setLastName(formInfo.lastName);
                    address.setPhone(formInfo.phone);
                    address.setPostalCode(formInfo.postalCode);
                    address.setStateCode(formInfo.stateCode);
                } else {
                    var newAddress = addressBook.createAddress(formInfo.addressId);
                    if (newAddress) {
                        newAddress.setAddress1(formInfo.address1);
                        newAddress.setAddress2(formInfo.address2);
                        newAddress.setCity(formInfo.city);
                        newAddress.setCountryCode(formInfo.countryCode);
                        newAddress.setFirstName(formInfo.firstName);
                        newAddress.setLastName(formInfo.lastName);
                        newAddress.setPhone(formInfo.phone);
                        newAddress.setPostalCode(formInfo.postalCode);
                        newAddress.setStateCode(formInfo.stateCode);
                    } else {
                        formInfo.addressForm.addressId.error =
                            Resource.msg('error.message.idalreadyexists', 'forms', null);
                        res.render('account/editaddaddress', { addressForm: formInfo.addressForm });
                    }
                }
            });
            res.redirect(URLUtils.url('Address-List'));
        });
    }
    next();
});

server.get('DeleteAddress', function (req, res, next) {
    var addressId = req.querystring.addressId;
    var isDefault = req.querystring.isDefault;
    var customer = CustomerMgr.getCustomerByCustomerNumber(
        req.currentCustomer.profile.customerNo
    );
    var addressBook = customer.getProfile().getAddressBook();
    var address = addressBook.getAddress(addressId);
    var UUID = address.getUUID();
    this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
        var length;
        Transaction.wrap(function () {
            addressBook.removeAddress(address);
            length = addressBook.getAddresses().length;
            if (isDefault && length > 0) {
                var newDefaultAddress = addressBook.getAddresses()[0];
                addressBook.setPreferredAddress(newDefaultAddress);
            }
        });
        if (length === 0) {
            res.json({
                UUID: UUID,
                defaultMsg: Resource.msg('label.addressbook.defaultaddress', 'account', null),
                message: Resource.msg('msg.no.saved.addresses', 'address', null)
            });
        } else {
            res.json({ UUID: UUID,
                defaultMsg: Resource.msg('label.addressbook.defaultaddress', 'account', null)
            });
        }
    });
    next();
});

server.get('SetDefault', function (req, res, next) {
    var addressId = req.querystring.addressId;
    var customer = CustomerMgr.getCustomerByCustomerNumber(
        req.currentCustomer.profile.customerNo
    );
    var addressBook = customer.getProfile().getAddressBook();
    var address = addressBook.getAddress(addressId);
    this.on('route:BeforeComplete', function () { // eslint-disable-line no-shadow
        Transaction.wrap(function () {
            addressBook.setPreferredAddress(address);
        });
        res.redirect(URLUtils.url('Address-List'));
    });
    next();
});

server.get('Header', server.middleware.include, function (req, res, next) {
    if (!req.currentCustomer.profile) {
        res.render('account/header-anon', {});
    } else {
        res.render('account/header-logged', { name: req.currentCustomer.profile.firstName });
    }
    next();
});

module.exports = server.exports();
