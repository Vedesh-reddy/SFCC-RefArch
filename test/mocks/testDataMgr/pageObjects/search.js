'use strict';

export const SEARCH_FORM = 'form[role*=search]';
export const PDP_MAIN = '.search-results';
export const SearchResultLarge = '.search-results .hidden-xs-down';
export const SearchResultSmall = '.search-results .hidden-sm-up';
export const SearchQuerySelector1 = '.header-search .search-field';
export const SearchQuerySelector2 = '.search-row .search-field';

/**
 *
 * @param selector1: the largeScreen selector for query box
 * @param selector2: the smallScreen selector for query box
 * @returns {*|Promise.<TResult>}
 */
export function getQuerySearchSelector(selector1, selector2) {
    let mySelector;
    return browser.isVisible(selector1)
        .then(visible => {
            if (visible) {
                mySelector = selector1;
                return mySelector;
            }
            mySelector = selector2;
            return mySelector;
        });
}
/**
 *
 *per _variables.scss defines:
 *If you detect the end user's screen is smaller than 544 pixels you have to show the smartphone layout
 *If the screen is larger than 544 pixels but smaller than 769 pixels, show us the tablet layout
 *If the screen is larger than 769 show the regular desktop layout
 * @param selectorLarge
 * @param selectorSmall
 * @param screenWidth :current screen width
 * @returns {*}
 */

export function getSearchResultSelector(selectorLarge, selectorSmall, screenWidth) {
    if (screenWidth < 544) {
        return selectorSmall;
    }
    return selectorLarge;
}
