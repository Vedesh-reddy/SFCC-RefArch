'use strict';

var assert = require('chai').assert;

/**
 * The shim is authored as an ES module, so it is read as source rather than required: the unit
 * suite runs plain CommonJS without the babel transform the webpack build applies.
 */
var fs = require('fs');
var path = require('path');

var shimPath = path.join(
    __dirname,
    '../../../../../cartridges/app_storefront_base/cartridge/client/default/js/thirdParty/bootstrap-v5.js'
);

describe('bootstrap-v5 shim', function () {
    var source = fs.readFileSync(shimPath, 'utf8');

    it('does not import Dropdown, whose data-API crashes without a data-bs-toggle toggle', function () {
        assert.notMatch(
            source,
            /^import .*[Dd]ropdown/m,
            'importing Dropdown registers document keydown listeners that resolve a null toggle'
        );
        assert.notMatch(source, /\bDropdown\s*:/, 'Dropdown must not be exposed on window.bootstrap');
    });

    it('does not import the whole bootstrap barrel, which would pull Dropdown back in', function () {
        assert.notMatch(source, /from\s+'bootstrap'/);
    });

    it('still exposes the components the cartridge builds on', function () {
        ['Modal', 'Carousel', 'Tab', 'Alert', 'Collapse', 'Tooltip', 'Popover'].forEach(function (name) {
            assert.match(
                source,
                new RegExp('^import ' + name + ' from', 'm'),
                name + ' must stay imported'
            );
            assert.match(source, new RegExp('\\b' + name + ':'), name + ' must stay on window.bootstrap');
        });
    });
});
