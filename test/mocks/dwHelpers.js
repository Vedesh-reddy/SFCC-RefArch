'use strict';

function map() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list.map(callback);
}

module.exports = {
    map: map
};
