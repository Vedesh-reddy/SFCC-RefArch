'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var serverMock = require('../../../mocks/modules/serverMock');

// Identity stubs — the controller wires these references into the route chain;
// the assertions check that the state-changing routes reference the CSRF
// middleware, so the stubs need identity, not behaviour.
var csrf = {
    validateRequest: function validateRequest() {},
    validateAjaxRequest: function validateAjaxRequest() {},
    generateToken: function generateToken() {}
};

var passthrough = function (req, res, next) { if (next) { next(); } };

function loadController(server) {
    return proxyquire('../../../../cartridges/app_storefront_base/cartridge/controllers/PaymentInstruments', {
        server: server,
        'dw/web/URLUtils': {},
        'dw/web/Resource': {},
        '*/cartridge/scripts/util/collections': {},
        '*/cartridge/scripts/util/array': {},
        '*/cartridge/scripts/middleware/csrf': csrf,
        '*/cartridge/scripts/middleware/userLoggedIn': {
            validateLoggedIn: passthrough,
            validateLoggedInAjax: passthrough
        },
        '*/cartridge/scripts/middleware/consentTracking': { consent: passthrough }
    });
}

describe('PaymentInstruments controller CSRF wiring', function () {
    var routes;

    beforeEach(function () {
        var server = serverMock.create();
        loadController(server);
        routes = server.registrations;
    });

    it('guards DeletePayment with validateAjaxRequest', function () {
        assert.include(routes.DeletePayment.chain, csrf.validateAjaxRequest);
    });

    it('emits a CSRF token on the List render that carries the delete form', function () {
        assert.equal(routes.List.method, 'get');
        assert.include(routes.List.chain, csrf.generateToken);
    });
});
