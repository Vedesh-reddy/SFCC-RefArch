'use strict';

/* globals cat, cd, cp, echo, exec, exit, find, ls, mkdir, rm, target, test */
/* eslint no-console: off, max-len: off */

require('shelljs/make');

var browserify = require('browserify');
var fs = require('fs');
var path = require('path');

target.browserify = function () {
    var jsSource = 'app_storefront_base/cartridge/client/js';
    var jsDest = 'app_storefront_base/cartridge/static/default/js';

    var allJsFiles = ls(path.join(process.cwd(), jsSource, '/*.js'));

    allJsFiles.forEach(function (file) {
        var b = browserify();
        b.add(file);
        b.bundle(function (err, buf) {
            if (err) {
                console.log('Error bundling ' + file);
                console.log(err);
                return;
            }
            var resultFile = path.join(jsDest, '/', path.basename(file));
            fs.open(resultFile, 'w', function (fileOpenError, fd) {
                fs.write(fd, buf, 0, buf.length, null, function (error) {
                    if (error) {
                        console.log('Error writing ' + file);
                        console.log(error);
                    }
                    fs.close(fd);
                });
            });
        });
    });
};
