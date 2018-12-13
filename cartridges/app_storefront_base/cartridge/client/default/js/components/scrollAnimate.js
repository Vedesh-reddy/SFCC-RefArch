'use strict';

module.exports = function (element) {
    var position = element ? element.offset().top : 0;
    $('html, body').animate({
        scrollTop: position
    }, 500);
};
