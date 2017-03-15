'use strict';

var SimpleCache = require('./simpleCache');

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
 * Retrieves session locale info
 *
 * @param {string} locale - Session locale code, xx_XX
 * @param {dw.util.Currency} currency - Session currency
 * @return {Object} - Session locale info
 */
function getCurrentLocale(locale, currency) {
    return {
        id: locale,
        currency: {
            currencyCode: currency.currencyCode,
            defaultFractionDigits: currency.defaultFractionDigits,
            name: currency.name,
            symbol: currency.symbol
        }
    };
}

/**
 * Translates global customer object into local object
 * @param {dw.customer.Customer} customer - Global customer object
 * @returns {Object} local instance of customer object
 */
function getCustomerObject(customer) {
    if (!customer || !customer.profile) {
        return {
            raw: customer
        };
    }
    if (!customer.authenticated) {
        return {
            raw: customer,
            credentials: {
                username: customer.profile.credentials.login
            }
        };
    }
    var preferredAddress = customer.addressBook.preferredAddress;
    var result;
    result = {
        raw: customer,
        profile: {
            lastName: customer.profile.lastName,
            firstName: customer.profile.firstName,
            email: customer.profile.email,
            phone: customer.profile.phoneHome,
            customerNo: customer.profile.customerNo
        },
        addressBook: {
            preferredAddress: null
        },
        wallet: {
            paymentInstruments: customer.profile.wallet.paymentInstruments
        }
    };
    if (preferredAddress) {
        result.addressBook.preferredAddress = {
            address1: preferredAddress.address1,
            address2: preferredAddress.address2,
            city: preferredAddress.city,
            countryCode: {
                displayValue: preferredAddress.countryCode.displayValue,
                value: preferredAddress.countryCode.value
            },
            firstName: preferredAddress.firstName,
            lastName: preferredAddress.lastName,
            ID: preferredAddress.ID,
            phone: preferredAddress.phone,
            postalCode: preferredAddress.postalCode,
            stateCode: preferredAddress.stateCode
        };
    }
    return result;
}

/**
 * @constructor
 * @classdesc Local instance of request object with customer object in it
 *
 * Translates global request and customer object to local one
 * @param {Object} request - Global request object
 * @param {dw.customer.Customer} customer - Global customer object
 * @param {dw.system.Session} session - Global session object
 */
function Request(request, customer, session) {
    this.httpMethod = request.httpMethod;
    this.host = request.httpHost;
    this.path = request.httpPath;
    this.httpHeaders = request.httpHeaders;
    this.querystring = parseQueryString(request.httpQueryString);
    this.form = getFormData(request.httpParameterMap, this.querystring);
    this.https = request.isHttpSecure();
    this.locale = getCurrentLocale(request.locale, session.currency);
    this.includeRequest = request.includeRequest;
    if (request.geolocation) {
        this.geolocation = {
            countryCode: request.geolocation.countryCode,
            latitude: request.geolocation.latitude,
            longitude: request.geolocation.longitude
        };
    }
    this.currentCustomer = getCustomerObject(customer);
    this.privacyCache = new SimpleCache(session.privacy);
}

module.exports = Request;
