'use strict';

module.exports = {
    url: function (action) {
        // handle params
        var params = [];
        if (arguments.length > 1) {
            if (arguments.length % 2 === 1) {
                var param = '';
                for (var i = 1; i < arguments.length; i++) {
                    // key
                    if (i % 2 === 1) {
                        param = arguments[i];
                    // value
                    } else {
                        param += '=' + arguments[i];
                        params.push(param);
                    }
                }
            }
        }
        params = params.length ? '?' + params.join('&') : '';

        return 'http://example.demandware.net/' + action + params;
    }
};
