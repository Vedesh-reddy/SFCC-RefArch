window.jQuery = window.$ = require('jquery');

$(document).ready(function () {
	//require('./components/hover')();
    require('./components/menu')();
    require('./components/footer')();
    require('./components/minicart')();
    require('./components/collapsable-item')();
    require('./components/search')();
});

require('./thirdparty/bootstrap');
require('./components/spinner');
