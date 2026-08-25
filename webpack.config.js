'use strict';

var path = require('path');
var RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
var MiniCssExtractPlugin = require('mini-css-extract-plugin');
var CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
var jsFiles = require('sgmf-scripts').createJsPath();
var scssFiles = require('sgmf-scripts').createScssPath();

module.exports = [
    {
        mode: 'production',
        name: 'js',
        entry: jsFiles,
        output: {
            path: path.resolve(
                './cartridges/app_storefront_base/cartridge/static'
            ),
            filename: '[name].js'
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules[\\/](?!bootstrap[\\/])/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/env'],
                            plugins: [
                                '@babel/plugin-proposal-object-rest-spread'
                            ],
                            cacheDirectory: true
                        }
                    }
                }
            ]
        }
    },
    {
        mode: 'none',
        name: 'scss',
        entry: scssFiles,
        output: {
            path: path.resolve(
                './cartridges/app_storefront_base/cartridge/static'
            )
        },
        module: {
            rules: [
                {
                    test: /\.scss$/,
                    use: [
                        {
                            loader: MiniCssExtractPlugin.loader,
                            options: {
                                esModule: false
                            }
                        },
                        {
                            loader: 'css-loader',
                            options: {
                                url: false
                            }
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                postcssOptions: {
                                    plugins: [require('autoprefixer')()]
                                }
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                implementation: require('sass'),
                                sassOptions: {
                                    includePaths: [
                                        path.resolve('node_modules'),
                                        path.resolve(
                                            'node_modules/flag-icon-css/sass'
                                        )
                                    ]
                                }
                            }
                        }
                    ]
                }
            ]
        },
        plugins: [
            new RemoveEmptyScriptsPlugin(),
            new MiniCssExtractPlugin({
                filename: '[name].css',
                chunkFilename: '[name].css'
            })
        ],
        optimization: {
            minimizer: ['...', new CssMinimizerPlugin()]
        }
    }
];
