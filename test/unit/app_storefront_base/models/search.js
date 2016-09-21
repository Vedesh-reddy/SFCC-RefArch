'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var ArrayList = require('../../../mocks/dw.util.Collection');

function MockProductSearchModel() {
    this.count = 0;
    this.emptyQuery = true;
    this.refinedByAttribute = false;
    this.refinedSearch = false;
    this.searchPhrase = null;
    this.sortingRule = null;
    this.addRefinementValues = function () {
        this.count = 1;
        this.emptyQuery = false;
        this.refinedByAttribute = true;
        this.refinedSearch = true;
    }.bind(this);
    this.setSearchPhrase = function (searchPhrase) {
        this.searchPhrase = searchPhrase;
    }.bind(this);
    this.setSortingRule = function (sortingRule) {
        this.sortingRule = sortingRule;
    };
    this.search = function () { };
    this.getProducts = function () {
        return {
            asList: function () {
                return new ArrayList([]);
            }
        };
    };
    this.getRefinements = function () {
        return {
            getRefinementDefinitions: function () {
                return new ArrayList([]);
            }
        };
    };
}

describe('search', function () {
    var helper = proxyquire('../../../../app_storefront_base/cartridge/scripts/dwHelpers', {
        'dw/util/ArrayList': ArrayList
    });
    var SearchModel = proxyquire('../../../../app_storefront_base/cartridge/models/search', {
        '~/cartridge/scripts/dwHelpers': helper,
        'dw/catalog/CatalogMgr': {
            getSortingRule: function () {
                return 'someSortingRule';
            }
        }
    });


    it('should return search model with refinements applied', function () {
        var productSearchModel = new MockProductSearchModel();
        var dataForSearch = {
            refinements: [{
                name: 'refinementColor',
                value: 'Blue'
            },
                {
                    name: 'brand',
                    value: 'Lacy-S'
                }],
            querystring: {
                q: 'shirts',
                srule: null
            }
        };
        new SearchModel(productSearchModel, dataForSearch);
        assert.equal(productSearchModel.count, 1);
        assert.equal(productSearchModel.emptyQuery, false);
        assert.equal(productSearchModel.refinedByAttribute, true);
        assert.equal(productSearchModel.refinedSearch, true);
        assert.equal(productSearchModel.searchPhrase, dataForSearch.querystring.q);
    });
});
