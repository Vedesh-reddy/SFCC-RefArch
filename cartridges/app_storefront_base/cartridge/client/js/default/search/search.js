'use strict';

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

/**
 * This function retrieves another page of content to display in the content search grid
 * @param {JQuery} $element - the jquery element that has the click event attached
 * @param {JQuery} $target - the jquery element that will receive the response
 * @return {undefined}
 */
function getContent($element, $target) {
    var showMoreUrl = $element.data('url');
    $.spinner().start();
    $.ajax({
        url: showMoreUrl,
        method: 'GET',
        success: function (response) {
            $target.append(response);
            $.spinner().stop();
        },
        error: function () {
            $.spinner().stop();
        }
    });
}

module.exports = {
    filter: function () {
        // Display refinements bar when Menu icon clicked
        $('.container').on('click', 'button.filter-results', function () {
            $('.refinement-bar, .modal-background').show();
        });
    },

    closeRefinments: function () {
        // Refinements close button
        $('.container').on('click', '.refinement-bar button.close, .modal-background', function () {
            $('.refinement-bar, .modal-background').hide();
        });
    },

    resize: function () {
        // Close refinement bar and hide modal background if user resizes browser
        $(window).resize(function () {
            $('.refinement-bar, .modal-background').hide();
        });
    },

    sort: function () {
        // Handle sort order menu selection
        $('.container').on('change', '[name=sort-order]', function (e) {
            e.preventDefault();

            $.spinner().start();
            $(this).trigger('search:sort', this.value);
            $.ajax({
                url: updateUrlWithSize(this.value),
                method: 'GET',
                success: updateProductGrid,
                error: function () {
                    $.spinner().stop();
                }
            });
        });
    },

    showMore: function () {
        // Show more products
        $('.container').on('click', '.show-more button', function (e) {
            e.stopPropagation();
            var showMoreUrl = $(this).data('url');
            currentPageSize = showMoreUrl.match(/sz=(\d+)/)[1];

            e.preventDefault();

            $.spinner().start();
            $(this).trigger('search:showMore', e);
            $.ajax({
                url: showMoreUrl,
                method: 'GET',
                success: updateProductGrid,
                error: function () {
                    $.spinner().stop();
                }
            });
        });
    },

    applyFilter: function () {
        // Handle refinement value selection and reset click
        $('.container').on('click', '.refinements li a, .refinement-bar a.reset', function (e) {
            e.preventDefault();

            $.spinner().start();
            $(this).trigger('search:filter', e);
            $.ajax({
                url: updateUrlWithSize(e.currentTarget.href),
                method: 'GET',
                success: function (response) {
                    parseResults(response);
                    $.spinner().stop();
                },
                error: function () {
                    $.spinner().stop();
                }
            });
        });
    },

    showContentTab: function () {
        // Display content results from the search
        $('.container').on('click', '.content-search', function () {
            if ($('#content-search-results').html() === '') {
                getContent($(this), $('#content-search-results'));
            }
        });

        // Display the next page of content results from the search
        $('.container').on('click', '.show-more-content button', function () {
            getContent($(this), $('#content-search-results .result-count'));
            $('.show-more-content').remove();
        });
    }
};
