'use strict';

var querystring = function (raw) {
    var pair;
    var left;
    if (raw && raw.length > 0) {
        var qs = raw.substring(raw.indexOf('?') + 1).split('&');
        for (var i = qs.length - 1; i >= 0; i--) {
            pair = qs[i].split('=');
            left = decodeURIComponent(pair[0]);
            if (left.indexOf('dwvar_') === 0) {
                var variableParts = left.split('_');
                if (variableParts.length === 3) {
                    if (!this.variables) {
                        this.variables = {};
                    }
                    this.variables[variableParts[2]] = {
                        id: variableParts[1],
                        value: decodeURIComponent(pair[1])
                    };
                    continue; // eslint-disable-line no-continue
                }
            }
            this[left] = decodeURIComponent(pair[1]);
        }
    }
};

querystring.prototype.toString = function () {
    var result = [];
    Object.keys(this).forEach(function (key) {
        if (key === 'variables') {
            Object.keys(this.variables).forEach(function (variable) {
                result.push('dwvar_' +
                    this.variables[variable].id + '_' +
                    variable + '=' + this.variables[variable].value);
            }, this);
        } else {
            result.push(key + '=' + this[key]);
        }
    }, this);
    return result.sort().join('&');
};

module.exports = querystring;
