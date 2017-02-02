'use strict';

function map() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list ? list.map(callback) : null;
}

function find() {
    var args = Array.from(arguments);
    var list = args[0];
    var callback = args[1];
    return list ? list.find(callback) : null;
}

module.exports = {
    find: find,
    map: map
};
