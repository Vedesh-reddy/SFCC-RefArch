'use strict';

module.exports = function () {
    $('.back-to-top').click(function () {
        $('html, body').animate({
            scrollTop: 0
        }, 500);
    });

    $('.collapsable-xs .title').click(function () {
        $(this).parents('.collapsable-xs').toggleClass('active');
    });
};
