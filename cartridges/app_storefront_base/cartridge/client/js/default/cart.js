'use strict';

var processInclude = require('./util');

$(document).ready(function () {
    processInclude(require('./cart/cart'));
    processInclude(require('./product/base'));
    processInclude(require('./product/quickview'));
});
