'use strict';

require('shelljs/make');
var path = require('path');

target.upload = function (file) {
    var relativePath = path.relative('./cartridges/', file[0]);
    cp('dw.json', './cartridges/');
    exec('cd cartridges && node ../node_modules/.bin/dwupload --file ' + relativePath + ' && cd ..');
    rm('./cartridges/dw.json');
};
