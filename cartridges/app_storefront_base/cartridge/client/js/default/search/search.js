// Initial page size set to default page size
var currentPageSize = 12;

/**
 * Update DOM elements with Ajax results
 *
 * @param {Object} $results - jQuery DOM element
 * @param {string} selector - DOM element to look up in the $results
 * @return {undefined}
 */
function updateDom($results, selector) {
    var $updates = $results.find(selector);
    $(selector).empty().html($updates.html());
}

/**
 * Update or append page size param to provided URL
 *
 * @param {string} sourceUrl - URL to update
 * @return {string} - Modified URL
 */
function updateUrlWithSize(sourceUrl) {
    return sourceUrl.indexOf('sz=') > -1
        ? sourceUrl.replace(/sz=(\d+)/, 'sz=' + currentPageSize)
        : sourceUrl + '&sz=' + currentPageSize;
}

/**
 * Replace product grid HTML with updated code
 *
 * @param {string} response - Updated HTML code
 * @return {undefined}
 */
function updateProductGrid(response) {
    $('.product-grid').empty().html(response);
    $.spinner().stop();
}

/**
 * Keep refinement panes expanded/collapsed after Ajax refresh
 *
 * @param {Object} $results - jQuery DOM element
 * @return {undefined}
 */
function handleRefinements($results) {
    $('.refinement.active').each(function () {
        $(this).removeClass('active');

        $results
            .find('.' + $(this)[0].className.replace(/ /g, '.'))
            .addClass('active');
    });

    updateDom($results, '.refinements');
}

/**
 * Parse Ajax results and updated select DOM elements
 *
 * @param {string} response - Ajax response HTML code
 * @return {undefined}
 */
function parseResults(response) {
    var $results = $(response);
    var specialHandlers = {
        '.refinements': handleRefinements
    };
    var resultsCount = 0;
    var displayedCount = 0;
    var $btnShowMore = {};

    // Update DOM elements that do not require special handling
    [
        '.grid-header',
        '.header-bar',
        '.header.page-title',
        '.product-grid',
        '.show-more'
    ].forEach(function (selector) {
        updateDom($results, selector);
    });

    Object.keys(specialHandlers).forEach(function (selector) {
        specialHandlers[selector]($results);
    });

    // Hide/show "More" button depending on how many products were returned
    resultsCount = parseInt($('.result-count')
        .eq(0)
        .text()
        .trim()
        .match(/^(\d+)/)[0], 10);
    displayedCount = $('.product-tile').length;
    $btnShowMore = $('.show-more button');

    if (resultsCount > displayedCount) {
        $btnShowMore.show();
    } else {
        $btnShowMore.hide();
    }
}

module.exports = function () {
    /* SET LISTENERS */

    // Display refinements bar when Menu icon clicked
    $('.container').on('click', 'button.filter-results', function () {
        $('.refinement-bar, .modal-background').show();
    });

    // Refinements close button
    $('.container').on('click', '.refinement-bar button.close, .modal-background', function () {
        $('.refinement-bar, .modal-background').hide();
    });

    // Close refinement bar and hide modal background if user resizes browser
    $(window).resize(function () {
        $('.refinement-bar, .modal-background').hide();
    });

    // Handle sort order menu selection
    $('.container').on('change', '[name=sort-order]', function (e) {
        e.preventDefault();

        $.spinner().start();
        $.ajax({
            url: updateUrlWithSize(this.value),
            method: 'GET',
            success: updateProductGrid,
            error: function () {
                $.spinner().stop();
            }
        });
    });

    // Show more products
    $('.container').on('click', '.show-more button', function (e) {
        e.stopPropagation();
        var showMoreUrl = $(this).data('url');
        currentPageSize = showMoreUrl.match(/sz=(\d+)/)[1];

        e.preventDefault();

        $.spinner().start();
        $.ajax({
            url: showMoreUrl,
            method: 'GET',
            success: updateProductGrid,
            error: function () {
                $.spinner().stop();
            }
        });
    });

    // Handle refinement value selection and reset click
    $('.container').on('click', '.refinements li a, .refinement-bar a.reset', function (e) {
        e.preventDefault();

        $.spinner().start();
        $.ajax({
            url: updateUrlWithSize(e.currentTarget.href),
            method: 'GET',
            success: function (response) {
                parseResults(response);
            },
            complete: function () {
                $.spinner().stop();
            }
        });
    });
};
