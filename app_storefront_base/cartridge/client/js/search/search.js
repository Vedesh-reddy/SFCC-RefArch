module.exports = function () {
    // Display refinements bar when Menu icon clicked
    $('button.filter-results').click(function () {
        $('.refinement-bar, .modal-background').show();
    });

    // Refinements close button
    $('.refinement-bar button.close, .modal-background').click(function () {
        $('.refinement-bar, .modal-background').hide();
    });

    // Close refinement bar and hide modal background if user resizes browser
    $(window).resize(function () {
        $('.refinement-bar, .modal-background').hide();
    });

    // Expand/collapse refinement sections when clicked
    $('.collapsable-sm .title').on('click', function () {
        $(this).parents('.collapsable-sm').toggleClass('active');
    });

    // Handle sort order menu selection
    $('[name=sort-order]').on('change', function () {
        window.location.replace(this.value);
    });
};
