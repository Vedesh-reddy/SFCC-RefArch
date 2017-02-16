'use strict';

var clearSelection = function (element) {
    $(element).closest('.dropdown').children('.dropdown-menu').children('.top-category')
        .detach();
    $(element).closest('.dropdown.show').children('.nav-link').attr('aria-expanded', 'false');
    $(element).closest('.dropdown.show').removeClass('show');
    $(element).closest('li').detach();
};

module.exports = function () {
    var isDesktop = function (element) {
        return $(element).parents('.menu-toggleable-left').css('position') !== 'fixed';
    };

    $('.header-banner .close').on('click', function () {
        $('.header-banner').addClass('hide');
    });

    $('.main-menu .nav-link, .main-menu .dropdown-link')
        .on('keydown', function (e) {
            var key = e.which;
            var supportedKeyCodes = [37, 38, 39, 40, 27];
            var menuItem = $(this).parent();

            if (supportedKeyCodes.indexOf(key) >= 0) {
                e.preventDefault();
            }

            switch (key) {
                case 40: // down
                    if (menuItem.hasClass('nav-item')) { // top level
                        $('.navbar-nav .show').removeClass('show');
                        menuItem.addClass('show');
                        $(this).attr('aria-expanded', 'true');
                        menuItem.children('ul').children().first().children()
                            .first()
                            .focus();
                    } else {
                        menuItem.removeClass('show');
                        $(this).attr('aria-expanded', 'false');
                        menuItem.next().children().first().focus();
                    }
                    break;
                case 39: // right
                    if (menuItem.hasClass('nav-item')) { // top level
                        menuItem.removeClass('show');
                        $(this).attr('aria-expanded', 'false');
                        menuItem.next().children().first().focus();
                    } else if (menuItem.hasClass('dropdown')) {
                        menuItem.addClass('show');
                        $(this).attr('aria-expanded', 'true');
                        menuItem.children('ul').children().first().children()
                            .first()
                            .focus();
                    }
                    break;
                case 38: // up
                    if (menuItem.hasClass('nav-item')) { // top level
                        menuItem.removeClass('show');
                        $(this).attr('aria-expanded', 'false');
                    } else if (menuItem.prev().length === 0) {
                        menuItem.parent().parent().removeClass('show')
                            .children('.nav-link')
                            .attr('aria-expanded', 'false');
                        menuItem.parent().parent().children().first()
                            .focus();
                    } else {
                        menuItem.prev().children().first().focus();
                    }
                    break;
                case 37: // left
                    if (menuItem.hasClass('nav-item')) { // top level
                        menuItem.removeClass('show');
                        $(this).attr('aria-expanded', 'false');
                        menuItem.prev().children().first().focus();
                    } else {
                        menuItem.closest('.show').removeClass('show').children()
                            .first()
                            .focus()
                            .attr('aria-expanded', 'false');
                    }
                    break;
                case 27: // escape
                    var parentMenu = menuItem.hasClass('show')
                        ? menuItem
                        : menuItem.closest('.show');
                    parentMenu.removeClass('show').children('.nav-link')
                        .attr('aria-expanded', 'false');
                    parentMenu.children().first().focus();
                    break;
                default:
                    break;
            }
        });
    $('.dropdown:not(.disabled) [data-toggle="dropdown"]')
        .on('click', function (e) {
            if (!isDesktop(this)) {
                $('.modal-background').show();
                // copy parent element into current UL
                var li = $('<li class="dropdown-item top-category" role="button"></li>');
                var link = $(this).clone().removeClass('dropdown-toggle')
                    .removeAttr('data-toggle')
                    .removeAttr('aria-expanded')
                    .attr('aria-haspopup', 'false');
                li.append(link);
                var closeMenu = $('<li class="nav-menu"></li>');
                closeMenu.append($('.close-menu').first().clone());
                $(this).parent().children('.dropdown-menu')
                    .prepend(li)
                    .prepend(closeMenu);
                // copy navigation menu into view
                $(this).parent().addClass('show');
                $(this).attr('aria-expanded', 'true');
                e.preventDefault();
            }
        })
        .on('mouseenter', function () {
            if (isDesktop(this)) {
                var eventElement = this;
                $('.navbar-nav > li').each(function () {
                    if (!$.contains(this, eventElement)) {
                        $(this).find('.show').each(function () {
                            clearSelection(this);
                        });
                        if ($(this).hasClass('show')) {
                            $(this).removeClass('show');
                            $(this).children('.nav-link').attr('aria-expanded', 'false');
                        }
                    }
                });
                // need to close all the dropdowns that are not direct parent of current dropdown
                $(this).parent().addClass('show');
                $(this).attr('aria-expanded', 'true');
            }
        })
        .parent()
        .on('mouseleave', function () {
            if (isDesktop(this)) {
                $(this).removeClass('show');
                $(this).children('.nav-link').attr('aria-expanded', 'false');
            }
        });

    $('.navbar>.close-menu>.close-button').on('click', function (e) {
        e.preventDefault();
        $('.menu-toggleable-left').removeClass('in');
        $('.modal-background').hide();
    });

    $('.navbar-nav').on('click', '.back', function (e) {
        e.preventDefault();
        clearSelection(this);
    });

    $('.navbar-nav').on('click', '.close-button', function (e) {
        e.preventDefault();
        $('.navbar-nav').find('.top-category').detach();
        $('.navbar-nav').find('.nav-menu').detach();
        $('.navbar-nav').find('.show').removeClass('show');
        $('.menu-toggleable-left').removeClass('in');
        $('.modal-background').hide();
    });

    $('.navbar-toggler').click(function (e) {
        e.preventDefault();
        $('.main-menu').toggleClass('in');
        $('.modal-background').show();
    });
};
