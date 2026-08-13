'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

var pageMetaHelper = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/scripts/helpers/pageMetaHelper', {});

describe('pageMetaHelper', function () {
    var pageMetaData;

    beforeEach(function () {
        pageMetaData = {
            setTitle: sinon.stub(),
            setDescription: sinon.stub(),
            setKeywords: sinon.stub(),
            addPageMetaTags: sinon.stub()
        };
    });

    describe('setPageMetaTags', function () {
        it('should add the page meta tags when the object carries a populated collection', function () {
            var tags = [{ ID: 'og:title', content: 'Resolved Title' }];

            pageMetaHelper.setPageMetaTags(pageMetaData, { pageMetaTags: tags });

            assert.isTrue(pageMetaData.addPageMetaTags.calledOnceWithExactly(tags));
        });

        it('should still call addPageMetaTags with an empty collection (CFT off / no rule resolved)', function () {
            var emptyTags = [];

            pageMetaHelper.setPageMetaTags(pageMetaData, { pageMetaTags: emptyTags });

            // The empty array is forwarded verbatim; downstream addPageMetaTags is a no-op for [].
            assert.isTrue(pageMetaData.addPageMetaTags.calledOnceWithExactly(emptyTags));
        });

        it('should not call addPageMetaTags when the object has no pageMetaTags property', function () {
            pageMetaHelper.setPageMetaTags(pageMetaData, { some: 'other-object' });

            assert.isTrue(pageMetaData.addPageMetaTags.notCalled);
        });

        it('should be a no-op when the object is null', function () {
            assert.doesNotThrow(function () {
                pageMetaHelper.setPageMetaTags(pageMetaData, null);
            });

            assert.isTrue(pageMetaData.addPageMetaTags.notCalled);
        });
    });

    describe('setPageMetaData', function () {
        it('should set the title from pageTitle when present', function () {
            pageMetaHelper.setPageMetaData(pageMetaData, { pageTitle: 'My Page' });

            assert.isTrue(pageMetaData.setTitle.calledOnceWithExactly('My Page'));
        });

        it('should fall back to name when pageTitle is absent', function () {
            pageMetaHelper.setPageMetaData(pageMetaData, { name: 'Category Name' });

            assert.isTrue(pageMetaData.setTitle.calledOnceWithExactly('Category Name'));
        });

        it('should fall back to productName when pageTitle and name are absent', function () {
            pageMetaHelper.setPageMetaData(pageMetaData, { productName: 'Product Name' });

            assert.isTrue(pageMetaData.setTitle.calledOnceWithExactly('Product Name'));
        });

        it('should set description and keywords only when non-empty', function () {
            pageMetaHelper.setPageMetaData(pageMetaData, {
                pageTitle: 'T',
                pageDescription: 'A description',
                pageKeywords: 'k1, k2'
            });

            assert.isTrue(pageMetaData.setDescription.calledOnceWithExactly('A description'));
            assert.isTrue(pageMetaData.setKeywords.calledOnceWithExactly('k1, k2'));
        });

        it('should not set description or keywords when they are empty', function () {
            pageMetaHelper.setPageMetaData(pageMetaData, {
                pageTitle: 'T',
                pageDescription: '',
                pageKeywords: ''
            });

            assert.isTrue(pageMetaData.setDescription.notCalled);
            assert.isTrue(pageMetaData.setKeywords.notCalled);
        });

        it('should be a no-op when the object is null', function () {
            assert.doesNotThrow(function () {
                pageMetaHelper.setPageMetaData(pageMetaData, null);
            });

            assert.isTrue(pageMetaData.setTitle.notCalled);
        });
    });
});
