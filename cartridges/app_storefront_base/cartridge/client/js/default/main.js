window.jQuery = window.$ = require('jquery');
var processInclude = require('./util');

$(document).ready(function () {
    processInclude(require('./components/menu'));
    processInclude(require('./components/footer'));
    processInclude(require('./components/minicart'));
    processInclude(require('./components/collapsable-item'));
    processInclude(require('./components/search'));
    processInclude(require('./components/client-side-validation'));
});

require('./thirdparty/bootstrap');
require('./components/spinner');
