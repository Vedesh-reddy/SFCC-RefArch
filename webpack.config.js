/* globals cat, cd, cp, echo, exec, exit, find, ls, mkdir, rm, target, test */
'use strict';

require('shelljs/make');
var path = require('path');
var webpack = require('webpack');

var bootstrapPackages = {
    Alert: 'exports-loader?Alert!bootstrap/js/src/alert',
    // Button: 'exports-loader?Button!bootstrap/js/src/button',
    Carousel: 'exports-loader?Carousel!bootstrap/js/src/carousel',
    Collapse: 'exports-loader?Collapse!bootstrap/js/src/collapse',
    // Dropdown: 'exports-loader?Dropdown!bootstrap/js/src/dropdown',
    Modal: 'exports-loader?Modal!bootstrap/js/src/modal',
    // Popover: 'exports-loader?Popover!bootstrap/js/src/popover',
    Scrollspy: 'exports-loader?Scrollspy!bootstrap/js/src/scrollspy',
    Tab: 'exports-loader?Tab!bootstrap/js/src/tab',
    // Tooltip: 'exports-loader?Tooltip!bootstrap/js/src/tooltip',
    Util: 'exports-loader?Util!bootstrap/js/src/util'
};

var createJSPath = function () {
    var result = {};

    var jsFiles = ls('./cartridges/app_storefront_base/cartridge/client/default/js/*.js');

    jsFiles.forEach(function (filePath) {
        var name = path.basename(filePath, '.js');
        result[name] = filePath;
    });

    return result;
};

module.exports = [{
    name: 'js',
    entry: createJSPath(),
    output: {
        path: path.resolve('./cartridges/app_storefront_base/cartridge/static/default/js/'),
        filename: '[name].js'
    },
    module: {
        loaders: [
            {
                test: /bootstrap(.)*\.js$/,
                loader: 'babel-loader',
                options: {
                    babelrc: true
                }
            }
        ]
    },
    plugins: [new webpack.optimize.UglifyJsPlugin({
        minimize: true,
        sourceMap: false,
        compress: {
            drop_console: true
        },
        mangle: {
            except: ['$', 'exports', 'require']
        }
    }),
        new webpack.ProvidePlugin(bootstrapPackages)]
}];
