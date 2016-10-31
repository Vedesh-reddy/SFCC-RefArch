'use strict';


/**
 * Zips the pref[n|v] http query params
 *
 * The Platform allows the use of multiple preference names and values to filter search results,
 * eg.: http://<sandbox>.com/../Search-Show?prefn1=refinementColor&prefv1=Blue&prefn2=size&prefv2=16
 *
 * @param {Object} preferences - HTTP query parameters map specific to selected refinement values
 * @return {Object} Map of provided preference name/value pairs
 */
function parsePreferences(preferences) {
    var params = {};
    var count = Object.keys(preferences).length / 2;
    var key = '';
    var value = '';

    for (var i = 1; i < count + 1; i++) {
        key = preferences['prefn' + i];
        value = preferences['prefv' + i];
        params[key] = value;
    }

    return params;
}

/**
 * Parse the refinement query parameters
 *
 * @param {Object} httpParams - Query string map
 * @return {Object} - Parsed query params
 */
function parseParams(httpParams) {
    var params = {};
    var preferences = {};

    Object.keys(httpParams).forEach(function (key) {
        var value = httpParams[key];

        if (key.indexOf('pref') === 0) {
            preferences[key] = value;
        } else {
            params[key] = value;
        }
    });

    params.preferences = parsePreferences(preferences);

    return params;
}

/**
 * Sets the relevant product search model properties, depending on the parameters provided
 *
 * @param {dw.catalog.ProductSearchModel} productSearch - Product search object
 * @param {Object} httpParams - Query params
 * @param {dw.catalog.Category} selectedCategory - Selected category
 * @param {dw.catalog.SortingRule} sortingRule - Product grid sort rule
 */
function setProductProperties(productSearch, httpParams, selectedCategory, sortingRule) {
    if (httpParams.q) {
        productSearch.setSearchPhrase(httpParams.q);
    }
    if (httpParams.cgid) {
        productSearch.setCategoryID(selectedCategory.ID);
    }
    if (httpParams.pid) {
        productSearch.setProductID(httpParams.pid);
    }
    if (httpParams.pmin) {
        productSearch.setPriceMin(parseInt(httpParams.pmin, 10));
    }
    if (httpParams.pmax) {
        productSearch.setPriceMax(parseInt(httpParams.pmax, 10));
    }

    if (sortingRule) {
        productSearch.setSortingRule(sortingRule);
    }

    productSearch.setRecursiveCategorySearch(true);
}

/**
 * Updates the search model with the preference refinement values
 *
 * @param {dw.catalog.SearchModel} search - SearchModel instance
 * @param {Object} preferences - Query params map
 */
function addRefinementValues(search, preferences) {
    Object.keys(preferences).forEach(function (key) {
        search.addRefinementValues(key, preferences[key]);
    });
}

module.exports = {
    addRefinementValues: addRefinementValues,
    parseParams: parseParams,
    setProductProperties: setProductProperties
};
