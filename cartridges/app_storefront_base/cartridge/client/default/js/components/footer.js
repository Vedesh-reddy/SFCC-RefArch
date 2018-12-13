'use strict';

var scrollAnimate = require('./scrollAnimate');

module.exports = function () {
    $('.back-to-top').click(function () {
        scrollAnimate();
    });
};
