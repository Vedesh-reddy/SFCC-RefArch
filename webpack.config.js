/* globals cat, cd, cp, echo, exec, exit, find, ls, mkdir, rm, target, test */
'use strict';

require('shelljs/make');
var path = require('path');
var webpack = require('webpack');

var createJSPath = function () {
    var result = {};

    var jsFiles = ls('./cartridges/app_storefront_base/cartridge/client/js/default/*.js');

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
                query: {
                    presets: ['es2015']
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
    })]
}];
