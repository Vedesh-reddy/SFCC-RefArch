'use strict';

var ACTION_ENDPOINT = 'Search-Show';


/**
 * Sets the relevant search model properties, depending on the parameters provided
 *
 * @param {dw.content.ProductSearchModel|dw.content.ContentSearchModel} search
 * @param {Object} httpParams
 * @return {dw.content.ProductSearchModel|dw.content.ContentSearchModel} - Processed search model
 */
function setBaseProperties(search, httpParams) {
    if (httpParams.q) {
        search.setSearchPhrase(httpParams.q);
    }
    if (httpParams.psortb1 && httpParams.psortd1) {
        search.setSortingCondition(httpParams.psortb1, parseInt(httpParams.psortd1, 10));
    }
    if (httpParams.psortb2 && httpParams.psortd2) {
        search.setSortingCondition(httpParams.psortb2, parseInt(httpParams.psortd2, 10));
    }
    if (httpParams.psortb3 && httpParams.psortd3) {
        search.setSortingCondition(httpParams.psortb3, parseInt(httpParams.psortd3, 10));
    }
}

/**
 * Extracts the pref[n|v] http query params
 *
 * The Platform allows the use of multiple preference names and values to filter search results,
 * i.e.:   http://<sandbox>.com/../Search-Show?prefn1=refinementColor&prefv1=Blue&prefn2=size&prefv2=16
 *
 * @param {Object} httpParams - Query params map
 * @param {String} httpParams.<key> - Query param key
 * @param {String} httpParams.<value> - Query param value
 * @param {String} key - Preference key to extract
 * @return {String[]}
 */
function getPreferenceParams(httpParams, key) {
    var queryValues = [];

    Object.keys(httpParams).forEach(function (paramKey) {
        if (paramKey.indexOf(key) === 0) {
            queryValues.push(httpParams[paramKey]);
        }
    });

    return queryValues;
}

/**
 * Updates the search model with the preference refinement values
 *
 * @param {dw.catalog.SearchModel} search - SearchModel instance
 * @param {Object} httpParams - Query params map
 * @param {String} httpParams.<key> - Query param key
 * @param {String} httpParams.<value> - Query param value
 * @returns {undefined}
 */
function addRefinementValues(search, httpParams) {
    var nameMap = getPreferenceParams(httpParams, 'prefn');
    var valueMap = getPreferenceParams(httpParams, 'prefv');

    // TODO: Re-implement w/ try..catch when Error framework is in place
    if (nameMap.length !== valueMap.length) {
        throw new Error('Number of query param preference keys and values do not match');
    }

    for (var i = 0; i < nameMap.length; i++) {
        if (valueMap[i]) {
            search.addRefinementValues(nameMap[i], valueMap[i]);
        }
    }
}

/**
 * @constructor
 * @classdesc Common class for product and content searches
 * @property {dw.catalog.ProductSearchModel|dw.catalog.ContentSearchModel} search
 * @property {Object} httpParams - HTTP query parameters
 */
function BaseSearch(search, httpParams) {
    this.search = search;
    this.httpParams = httpParams;

    this.initialize();
}

BaseSearch.prototype = {
    initialize: function () {
        setBaseProperties(this.search, this.httpParams);
        addRefinementValues(this.search, this.httpParams);
    }
};

module.exports = BaseSearch;
module.exports.actionEndpoint = ACTION_ENDPOINT;
