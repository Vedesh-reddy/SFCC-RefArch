'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');
var mockDwHelpers = require('../../../../mocks/dwHelpers');


describe('ProductSearch model', function () {
    var endpointSearchShow = 'Search-Show';
    var endpointShowMore = 'Search-UpdateGrid';
    var pluckValue = 'plucked';
    var spySetPageSize = sinon.spy();
    var spySetStart = sinon.spy();
    var stubAppendPageSize = sinon.stub();
    var stubGetPageSize = sinon.stub();
    var defaultPageSize = 12;
    var pagingModelInstance = {
        appendPageSize: stubAppendPageSize,
        getPageSize: stubGetPageSize,
        setPageSize: spySetPageSize,
        setStart: spySetStart
    };
    var stubPagingModel = sinon.stub();
    var refinementValues = [{
        value: 1,
        selected: false
    }, {
        value: 2,
        selected: true
    }, {
        value: 3,
        selected: false
    }];
    var ProductSearch = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/models/search/productSearch.js', {
        '~/cartridge/scripts/dwHelpers': {
            map: mockDwHelpers.map,
            pluck: function () { return pluckValue; }
        },
        '~/cartridge/scripts/factories/searchRefinements': {
            get: function () { return refinementValues; }
        },
        'dw/web/URLUtils': {
            url: function (endpoint, param, value) { return [endpoint, param, value].join(' '); }
        },
        'dw/web/PagingModel': stubPagingModel
    });

    var apiProductSearch;
    var httpParams = {};
    var result = '';

    stubPagingModel.returns(pagingModelInstance);
    stubGetPageSize.returns(defaultPageSize);

    afterEach(function () {
        spySetStart.reset();
        spySetPageSize.reset();
    });

    describe('.getRefinements()', function () {
        var displayName = 'zodiac sign';
        var categoryRefinement = { cat: 'catRefinement' };
        var attrRefinement = { attr: 'attrRefinement' };

        beforeEach(function () {
            apiProductSearch = {
                isCategorySearch: false,
                refinements: {
                    refinementDefinitions: [{
                        displayName: displayName,
                        categoryRefinement: categoryRefinement,
                        attributeRefinement: attrRefinement,
                        values: refinementValues
                    }],
                    getAllRefinementValues: function () {}
                },
                url: function () { return 'http://some.url'; }
            };
        });

        it('should return refinements with a display name', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.deepEqual(result.refinements[0].displayName, displayName);
        });

        it('should return refinements with a categoryRefinement value', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.deepEqual(result.refinements[0].isCategoryRefinement, categoryRefinement);
        });

        it('should return refinements with an attribute refinement value', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.deepEqual(result.refinements[0].isAttributeRefinement, attrRefinement);
        });

        it('should return an object with refinement values', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.deepEqual(result.refinements[0].values, refinementValues);
        });
    });

    describe('.getSelectedFilters()', function () {
        beforeEach(function () {
            apiProductSearch = {
                isCategorySearch: false,
                refinements: {
                    refinementDefinitions: [{}],
                    getAllRefinementValues: function () {}
                },
                url: function () { return 'http://some.url'; }
            };
        });

        it('should retrieve filter values that have been selected', function () {
            var selectedFilter = refinementValues.find(function (value) { return value.selected === true; });
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.selectedFilters[0], selectedFilter);
        });

        it('should retrieve filter values that have been selected', function () {
            var selectedFilter = refinementValues.find(function (value) { return value.selected === true; });
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.selectedFilters[0], selectedFilter);
        });
    });

    describe('.getResetLink()', function () {
        var expectedLink = '';

        beforeEach(function () {
            apiProductSearch = {
                categorySearch: false,
                refinements: {
                    refinementDefinitions: []
                },
                url: function () { return 'http://some.url'; }
            };

            httpParams = {
                cgid: 'cat123',
                q: 'keyword'
            };
        });

        it('should return a reset link for keyword searches', function () {
            expectedLink = [endpointSearchShow, 'q', httpParams.q].join(' ');
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.resetLink, expectedLink);
        });

        it('should return a reset link for category searches', function () {
            apiProductSearch.categorySearch = true;
            expectedLink = [endpointSearchShow, 'cgid', httpParams.cgid].join(' ');
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.resetLink, expectedLink);
        });
    });

    describe('.getBannerImageUrl()', function () {
        var slotImageUrl = 'http://slot.banner.image.url';
        var nonSlotImageUrl = 'http://image.url';

        beforeEach(function () {
            apiProductSearch = {
                refinements: {
                    refinementDefinitions: []
                },
                url: function () { return 'http://some.url'; },
                category: {
                    custom: {
                        slotBannerImage: {
                            getURL: function () {
                                return slotImageUrl;
                            }
                        }
                    },
                    image: {
                        getURL: function () {
                            return nonSlotImageUrl;
                        }
                    }
                }
            };
        });

        it('should use a slot image for a category banner if specified', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.bannerImageUrl, slotImageUrl);
        });

        it('should use a regular image for its banner image if no slot image specified', function () {
            apiProductSearch.category.custom = null;
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.equal(result.bannerImageUrl, nonSlotImageUrl);
        });
    });

    describe('.getPagingModel()', function () {
        beforeEach(function () {
            apiProductSearch = {
                isCategorySearch: false,
                refinements: {
                    refinementDefinitions: []
                },
                url: function () { return 'http://some.url'; }
            };
        });

        it('should call the PagingModel.setStart() method', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.isTrue(spySetStart.called);
        });

        it('should call the PagingModel.setPageSize() method', function () {
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.isTrue(spySetPageSize.called);
        });
    });

    describe('.getShowMoreUrl', function () {
        var currentPageSize = 12;
        var expectedUrl = 'some url';

        beforeEach(function () {
            apiProductSearch = {
                isCategorySearch: false,
                refinements: {
                    refinementDefinitions: []
                },
                url: function () { return endpointShowMore; }
            };

            stubGetPageSize.returns(currentPageSize);
            stubAppendPageSize.returns(expectedUrl);
        });

        afterEach(function () {
            stubGetPageSize.reset();
        });

        it('should increment the page size parameter in the url', function () {
            var expectedMorePageSize = currentPageSize + defaultPageSize;
            apiProductSearch.count = 14;
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.isTrue(stubAppendPageSize.calledWith(endpointShowMore, expectedMorePageSize));
        });

        it('should page size parameter to the current page size in the url', function () {
            var expectedMorePageSize = currentPageSize;
            apiProductSearch.count = 10;
            result = new ProductSearch(apiProductSearch, httpParams);
            assert.isTrue(stubAppendPageSize.calledWith(endpointShowMore, expectedMorePageSize));
        });
    });
});
