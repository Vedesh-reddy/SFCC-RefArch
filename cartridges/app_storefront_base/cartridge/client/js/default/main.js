window.jQuery = window.$ = require('jquery');
var processInclude = require('./util');

$(document).ready(function () {
    processInclude(require('./components/menu'));
    processInclude(require('./components/footer'));
    processInclude(require('./components/minicart'));
    processInclude(require('./components/collapsable-item'));
    processInclude(require('./components/search'));
});

require('./thirdparty/bootstrap');
require('./components/spinner');
