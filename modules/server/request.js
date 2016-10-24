'use strict';

/**
 * Parse querystring into an object
 * @param {string} querystring - String representing querystring
 * @returns {Object} parsed querystring object
 */
function parseQueryString(querystring) {
    var result = {};
    var pair;
    var left;
    if (querystring && querystring.length > 0) {
        var qs = querystring.substring(querystring.indexOf('?') + 1).split('&');
        for (var i = qs.length - 1; i >= 0; i--) {
            pair = qs[i].split('=');
            left = decodeURIComponent(pair[0]);
            if (left.indexOf('dwvar_') === 0) {
                var variableParts = left.split('_');
                if (variableParts.length === 3) {
                    if (!result.variables) {
                        result.variables = {};
                    }
                    result.variables[variableParts[2]] = {
                        id: variableParts[1],
                        value: decodeURIComponent(pair[1])
                    };
                    continue; // eslint-disable-line no-continue
                }
            }
            result[left] = decodeURIComponent(pair[1]);
        }
    }
    return result;
}

/**
 *
 * Retrieves and normalizes form data from httpParameterMap
 * @param {dw.web.httpParameterMap} items - original parameters
 * @param {Object} qs - Object containing querystring
 * @return {Object} Object containing key value pairs submitted from the form
 */
function getFormData(items, qs) {
    if (!items) {
        return {};
    }
    var allKeys = items.parameterNames;
    var result = {};
    if (allKeys.length > 0) {
        var iterator = allKeys.iterator();
        while (iterator.hasNext()) {
            var key = iterator.next();
            var value = items.get(key);

            if (value.rawValue && !qs[key]) {
                result[key] = value.rawValue;
            }
        }
    }

    return result;
}

/**
 * Translates global customer object into local object
 * @param {Object} request - Global request object
 * @returns {Object} local instance of customer object
 */
function getCustomerObject(customer) {
    if (!customer || !customer.profile) {
        return {
            raw: customer
        };
    }

    var result;
    var paymentInstrument = {};
    if (customer.profile.wallet.paymentInstruments) {
        paymentInstrument = customer.profile.wallet.paymentInstruments[0];
    }

    result = {
        raw: customer,
        profile: {
            lastName: customer.profile.lastName,
            firstName: customer.profile.firstName,
            email: customer.profile.email,
            customerNo: customer.profile.customerNo
        },
        addressBook: {
            preferredAddress: {
                address1: customer.addressBook.preferredAddress.address1,
                address2: customer.addressBook.preferredAddress.address2,
                city: customer.addressBook.preferredAddress.city,
                countryCode: {
                    displayValue: customer.addressBook.preferredAddress.countryCode.displayValue,
                    value: customer.addressBook.preferredAddress.countryCode.value
                },
                firstName: customer.addressBook.preferredAddress.firstName,
                lastName: customer.addressBook.preferredAddress.lastName,
                ID: customer.addressBook.preferredAddress.ID,
                phone: customer.addressBook.preferredAddress.phone,
                postalCode: customer.addressBook.preferredAddress.postalCode,
                stateCode: customer.addressBook.preferredAddress.stateCode
            }
        },
        wallet: {
            paymentInstrument: {
                maskedCreditCardNumber: paymentInstrument.maskedCreditCardNumber,
                creditCardType: paymentInstrument.creditCardType,
                creditCardExpirationMonth: paymentInstrument.creditCardExpirationMonth,
                creditCardExpirationYear: paymentInstrument.creditCardExpirationYear
            }
        }
    };
    return result;
}

/**
 * Translates global request and customer object to local one
 * @param {Object} request - Global request object
 * @param {Object} request - Global customer object
 * @returns {Object} local instance of request object with customer object in it
 */
function Request(request, customer) {
    this.httpMethod = request.httpMethod;
    this.host = request.httpHost;
    this.path = request.httpPath;
    this.httpHeaders = request.httpHeaders;
    this.querystring = parseQueryString(request.httpQueryString);
    this.form = getFormData(request.httpParameterMap, this.querystring);
    this.https = request.isHttpSecure();
    this.locale = request.locale;
    this.includeRequest = request.includeRequest;
    if (request.geolocation) {
        this.geolocation = {
            countryCode: request.geolocation.countryCode,
            latitude: request.geolocation.latitude,
            longitude: request.geolocation.longitude
        };
    }
    this.currentCustomer = getCustomerObject(customer);
}

module.exports = Request;
