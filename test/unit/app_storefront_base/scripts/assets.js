'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var urlUtilsMock = {
    staticURL: function (a) {
        return 'test' + a;
    }
};

describe('assets', function () {
    var assets = null;

    beforeEach(function () {
        assets = proxyquire('../../../../cartridges/app_storefront_base/cartridge/scripts/assets', {
            'dw/web/URLUtils': urlUtilsMock
        });
    });

    it('should add a new JavaScript file', function () {
        assert.deepEqual(assets.scripts, []);
        assets.addJs('../test.js');
        assert.equal(assets.scripts[0], 'test../test.js');
    });

    it('should add a new external JavaScript file', function () {
        assert.deepEqual(assets.scripts, []);
        assets.addJs('http://www.google.com/test.js');
        assert.equal(assets.scripts[0], 'http://www.google.com/test.js');
    });

    it('should not add a duplicate external JavaScript file', function () {
        assert.deepEqual(assets.scripts, []);
        assets.addJs('http://www.google.com/test.js');
        assets.addJs('http://www.google.com/test.js');
        assert.equal(assets.scripts[0], 'http://www.google.com/test.js');
        assert.equal(assets.scripts.length, 1);
    });

    it('should add a new CSS file', function () {
        assets.addCss('../test.css');
        assert.equal(assets.styles[0], 'test../test.css');
    });

    it('should add a new external CSS file', function () {
        assets.addCss('https://www.google.com/test.css');
        assert.equal(assets.styles[0], 'https://www.google.com/test.css');
    });

    it('should not add a duplicate external CSS file', function () {
        assets.addCss('https://www.google.com/test.css');
        assets.addCss('https://www.google.com/test.css');
        assert.equal(assets.styles[0], 'https://www.google.com/test.css');
        assert.equal(assets.styles.length, 1);
    });
});
