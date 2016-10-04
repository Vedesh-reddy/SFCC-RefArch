'use strict';

module.exports = function () {
    $('.navbar li>a').click(function (e) {
        var hasSubmenu = $(this).closest('li').children('ul').length > 0;
        var isMobile = $('.navbar').css('position') === 'fixed';

        if (isMobile && hasSubmenu) {
            e.preventDefault();
            $(this)
                .closest('li')
                .children('ul')
                .addClass('open');
            if ($(this)
                .closest('li')
                .children('ul')
                .children('.back-menu')
                .length === 0) {
                $(this)
                    .closest('li')
                    .children('ul')
                    .prepend($('<li class="back-menu">').append($('.close-menu').first().clone()));
            }
        }
    });
    $('.navbar-toggle').click(function () {
        $('.navbar-collapse>.navbar-nav').addClass('open');
        $('.navbar').addClass('active');
    });

    $('.navbar').on('click', '.close-menu .close-button a', function (e) {
        e.preventDefault();
        $('.navbar .open').removeClass('open');
        $('.navbar-collapse.in').removeClass('in');
        $('.navbar').removeClass('active');
    });

    $('.navbar').on('click', '.close-menu .back a', function (e) {
        e.preventDefault();
        $(this).closest('ul').removeClass('open');
    });
};
