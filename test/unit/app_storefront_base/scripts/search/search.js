'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');

var search = require('../../../../../cartridges/app_storefront_base/cartridge/scripts/search/search');

describe('search script', function () {
    describe('addRefinementValues', function () {
        var mockProductSearch = {
            addRefinementValues: function () {}
        };
        var spyAddRefinementValues = sinon.spy(mockProductSearch, 'addRefinementValues');
        var mockPreferences = {
            prefn1: 'pref1Value',
            prefn2: 'pref2Value'
        };

        search.addRefinementValues(mockProductSearch, mockPreferences);

        it('should set selected refinement values', function () {
            assert.isTrue(spyAddRefinementValues.calledWith('prefn1', 'pref1Value'));
            assert.isTrue(spyAddRefinementValues.calledWith('prefn2', 'pref2Value'));
        });
    });

    describe('setProductProperties', function () {
        var mockProductSearch = {
            setSearchPhrase: function () {},
            setCategoryID: function () {},
            setProductIDs: function () {},
            setPriceMin: function () {},
            setPriceMax: function () {},
            setSortingRule: function () {},
            setRecursiveCategorySearch: function () {},
            setPromotionID: function () {}
        };
        var mockParams = {
            q: 'toasters galore',
            cgid: { ID: 'abc' },
            pid: 'Product123',
            pmin: '15',
            pmax: '37',
            pmid: 'Buy5for50'
        };
        var mockSelectedCategory = {
            ID: 123
        };
        var mockSortingRule = 'rule3';

        var mockParameterMap = {
            pmin: { doubleValue: 10, submitted: true },
            pmax: { doubleValue: 100, submitted: true }
        };

        var spySetSearchPhrase = sinon.spy(mockProductSearch, 'setSearchPhrase');
        var spySetCategoryID = sinon.spy(mockProductSearch, 'setCategoryID');
        var spySetProductIDs = sinon.spy(mockProductSearch, 'setProductIDs');
        var spySetPriceMin = sinon.spy(mockProductSearch, 'setPriceMin');
        var spySetPriceMax = sinon.spy(mockProductSearch, 'setPriceMax');
        var spySetSortingRule = sinon.spy(mockProductSearch, 'setSortingRule');
        var spySetPromotionID = sinon.spy(mockProductSearch, 'setPromotionID');
        var spySetRecursiveCategorySearch = sinon.spy(
            mockProductSearch,
            'setRecursiveCategorySearch'
        );

        search.setProductProperties(
            mockProductSearch,
            mockParams,
            mockSelectedCategory,
            mockSortingRule,
            mockParameterMap
        );

        it('should set the search phrase with spaces decoded', function () {
            assert.isTrue(spySetSearchPhrase.calledWith('toasters galore'));
        });

        it('should set the category ID', function () {
            assert.isTrue(spySetCategoryID.calledWith(mockSelectedCategory.ID));
        });

        it('should set the product ID', function () {
            assert.isTrue(spySetProductIDs.calledWith([mockParams.pid]));
        });

        it('should set the minimum price', function () {
            assert.isTrue(spySetPriceMin.calledWith(mockParameterMap.pmin.doubleValue));
        });

        it('should set the maximum price', function () {
            assert.isTrue(spySetPriceMax.calledWith(mockParameterMap.pmax.doubleValue));
        });

        it('should set min price and not set max price when pmin is submitted and pmax is not', function () {
            var mockSearchForPmaxTest = {
                setPriceMin: function () {},
                setPriceMax: function () {},
                setRecursiveCategorySearch: function () {}
            };
            var pminSpy = sinon.spy(mockSearchForPmaxTest, 'setPriceMin');
            var pmaxSpy = sinon.spy(mockSearchForPmaxTest, 'setPriceMax');

            search.setProductProperties(
                mockSearchForPmaxTest,
                {},
                null,
                null,
                {
                    pmin: { doubleValue: 10, submitted: true },
                    pmax: { doubleValue: 100, submitted: false }
                }
            );

            assert.isTrue(pminSpy.calledWith(10));
            assert.isFalse(pmaxSpy.called);
        });

        it('should not set min price and set max price when pmin is not submitted and pmax is submitted', function () {
            var mockSearchForPmaxOnlyTest = {
                setPriceMin: function () {},
                setPriceMax: function () {},
                setRecursiveCategorySearch: function () {}
            };
            var pminSpy = sinon.spy(mockSearchForPmaxOnlyTest, 'setPriceMin');
            var pmaxSpy = sinon.spy(mockSearchForPmaxOnlyTest, 'setPriceMax');

            search.setProductProperties(
                mockSearchForPmaxOnlyTest,
                {},
                null,
                null,
                {
                    pmin: { doubleValue: 10, submitted: false },
                    pmax: { doubleValue: 100, submitted: true }
                }
            );

            assert.isFalse(pminSpy.called);
            assert.isTrue(pmaxSpy.calledWith(100));
        });

        it('should not set min price or max price when neither pmin nor pmax is submitted', function () {
            var mockSearchForNoPriceSubmissionsTest = {
                setPriceMin: function () {},
                setPriceMax: function () {},
                setRecursiveCategorySearch: function () {}
            };
            var pminSpy = sinon.spy(mockSearchForNoPriceSubmissionsTest, 'setPriceMin');
            var pmaxSpy = sinon.spy(mockSearchForNoPriceSubmissionsTest, 'setPriceMax');

            search.setProductProperties(
                mockSearchForNoPriceSubmissionsTest,
                {},
                null,
                null,
                {
                    pmin: { doubleValue: 10, submitted: false },
                    pmax: { doubleValue: 100, submitted: false }
                }
            );

            assert.isFalse(pminSpy.called);
            assert.isFalse(pmaxSpy.called);
        });

        it('should set the sort rule', function () {
            assert.isTrue(spySetSortingRule.calledWith(mockSortingRule));
        });

        it('should set category search to be recursive', function () {
            assert.isTrue(spySetRecursiveCategorySearch.calledWith(true));
        });

        it('should set the promotion refinement', function () {
            assert.isTrue(spySetPromotionID.calledWith(mockParams.pmid));
        });
    });
});
