'use strict';
module.exports = function () {
    var sizes = ['xs', 'sm', 'md', 'lg', 'xl'];

    sizes.forEach(function (size) {
        var selector = '.collapsable-' + size + ' .title, .collapsable-' + size + '>.card-header';
        $('body').on('click', selector, function () {
            $(this).parents('.collapsable-' + size).toggleClass('active');
        });
    });
};
