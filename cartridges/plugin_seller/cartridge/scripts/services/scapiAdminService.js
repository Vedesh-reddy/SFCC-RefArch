'use strict';

/**
 * SCAPI Admin service for catalog publishing (jobs only, never in a shopper request).
 * Account Manager client credentials and the SCAPI host live in two Service Framework
 * services; the organization ID is a site preference. Request bodies follow the Products,
 * Catalogs, Price Books and Inventory Lists v1 OpenAPI contracts.
 *
 * There is no in-call retry (the platform has no sleep): a failed call fails the item,
 * and the provisioning job retries it on a later run with a delay.
 */

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('plugin-seller', 'seller-integration');
var TOKEN_SERVICE = 'plugin-seller.am.oauth';
var API_SERVICE = 'plugin-seller.scapi.admin';
var SCOPES = ['sfcc.products.rw', 'sfcc.catalogs.rw', 'sfcc.price-books.rw', 'sfcc.inventory-lists.rw'];

/**
 * @param {string} message - communication log message
 * @returns {string} message without bearer tokens, basic credentials or secrets
 */
function redact(message) {
    return String(message || '')
        .replace(/("?access_token"?\s*[:=]\s*"?)[^",&\s]+/gi, '$1***')
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1***')
        .replace(/(Basic\s+)[A-Za-z0-9+/=]+/g, '$1***')
        .replace(/(client_secret=)[^&\s]+/gi, '$1***');
}

/**
 * @param {string} organizationId - e.g. f_ecom_zyeu_002
 * @returns {string} tenant ID, e.g. zyeu_002
 */
function tenantOf(organizationId) {
    return String(organizationId).replace(/^f_ecom_/, '');
}

/**
 * @param {string} organizationId - organization
 * @returns {?string} access token, or null when the token call failed
 */
function token(organizationId) {
    var service = LocalServiceRegistry.createService(TOKEN_SERVICE, {
        createRequest: function (svc) {
            var credential = svc.getConfiguration().getCredential();
            var Encoding = require('dw/crypto/Encoding');
            var Bytes = require('dw/util/Bytes');
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            svc.addHeader('Authorization', 'Basic ' + Encoding.toBase64(new Bytes(credential.user + ':' + credential.password)));
            return 'grant_type=client_credentials&scope=' + encodeURIComponent(['SALESFORCE_COMMERCE_API:' + tenantOf(organizationId)].concat(SCOPES).join(' '));
        },
        parseResponse: function (svc, httpClient) {
            var body = JSON.parse(httpClient.text);
            return body && body.access_token ? body.access_token : null;
        },
        filterLogMessage: redact
    });
    var result = service.call();
    if (!result.ok) {
        log.error('Account Manager token request failed: status {0}', result.error);
        return null;
    }
    return result.object;
}

/**
 * @param {string} organizationId - organization
 * @returns {Object} client with request(method, path, body) and typed helpers
 */
function client(organizationId) {
    var bearer = null;
    var org = encodeURIComponent(organizationId);

    /**
     * @param {string} method - HTTP method
     * @param {string} path - path after the API base, e.g. "/product/products/v1/organizations/{org}/products/X"
     * @param {?Object} body - JSON body
     * @returns {{ok: boolean, status: number, body: ?Object, retryable: boolean}} result
     */
    function request(method, path, body) {
        if (!bearer) bearer = token(organizationId);
        if (!bearer) return { ok: false, status: 401, body: null, retryable: true };
        var service = LocalServiceRegistry.createService(API_SERVICE, {
            createRequest: function (svc) {
                svc.setRequestMethod(method);
                svc.setURL(svc.getConfiguration().getCredential().URL.replace(/\/$/, '') + path);
                svc.addHeader('Authorization', 'Bearer ' + bearer);
                svc.addHeader('Content-Type', 'application/json');
                return body ? JSON.stringify(body) : null;
            },
            parseResponse: function (svc, httpClient) {
                return { status: httpClient.statusCode, text: httpClient.text };
            },
            filterLogMessage: redact
        });
        var result = service.call();
        var status = result.ok ? result.object.status : (result.error || 0);
        var parsed = null;
        var text = result.ok ? result.object.text : result.errorMessage;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch (e) {
            parsed = null;
        }
        if (!result.ok) log.warn('SCAPI Admin {0} {1} failed with status {2}', method, path.replace(/organizations\/[^/]+/, 'organizations/*'), status);
        return { ok: result.ok, status: status, body: parsed, retryable: !status || status === 429 || status >= 500 };
    }

    return {
        request: request,
        getProduct: function (id) {
            return request('GET', '/product/products/v1/organizations/' + org + '/products/' + encodeURIComponent(id), null);
        },
        putProduct: function (product) {
            return request('PUT', '/product/products/v1/organizations/' + org + '/products/' + encodeURIComponent(product.id), product);
        },
        patchProduct: function (id, changes) {
            return request('PATCH', '/product/products/v1/organizations/' + org + '/products/' + encodeURIComponent(id), changes);
        },
        assignCategory: function (catalogId, categoryId, productId) {
            return request('PUT', '/product/catalogs/v1/organizations/' + org + '/catalogs/' + encodeURIComponent(catalogId)
                + '/categories/' + encodeURIComponent(categoryId) + '/products/' + encodeURIComponent(productId),
            { catalogId: catalogId, categoryId: categoryId, productId: productId });
        },
        putPrice: function (priceBookId, productId, cents) {
            return request('PUT', '/product/price-books/v1/organizations/' + org + '/price-books/' + encodeURIComponent(priceBookId)
                + '/price-book-entries/' + encodeURIComponent(productId), {
                productId: productId,
                priceTables: [{ tiers: [{ type: 'amount', quantity: 1, amount: { currencyMnemonic: 'USD', value: cents / 100 } }] }]
            });
        },
        putInventoryList: function (listId, description) {
            return request('PUT', '/product/inventory-lists/v1/organizations/' + org + '/inventory-lists/' + encodeURIComponent(listId),
                { id: listId, description: description, defaultInStock: false, useBundleInventoryOnly: false, onOrderInventoryEnabled: false });
        },
        putInventoryRecord: function (listId, productId, allocation, resetDate) {
            return request('PUT', '/product/inventory-lists/v1/organizations/' + org + '/inventory-lists/' + encodeURIComponent(listId)
                + '/product-inventory-records/' + encodeURIComponent(productId), {
                productId: productId,
                perpetualFlag: false,
                allocation: { amount: Math.max(0, Math.floor(allocation)), resetDate: resetDate.toISOString() },
                preOrderBackOrderHandling: 'none'
            });
        }
    };
}

module.exports = {
    SCOPES: SCOPES,
    redact: redact,
    tenantOf: tenantOf,
    client: client
};
