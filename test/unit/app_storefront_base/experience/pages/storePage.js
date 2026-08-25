'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

describe('storePage page', function () {
    var renderStub = sinon.stub();
    var templateStub = sinon.stub();
    var hookManagerStub = { callHook: sinon.stub() };
    var pageRenderHelper = {
        getRegionModelRegistry: sinon.stub(),
        isInEditMode: sinon.stub(),
        getPageMetaData: sinon.stub()
    };
    var pageMetaHelper = {
        setPageMetaTags: sinon.stub()
    };

    var storePage = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/experience/pages/storePage.js', {
        'dw/util/Template': templateStub,
        'dw/util/HashMap': function () {
            return {};
        },
        'dw/system/HookMgr': hookManagerStub,
        '*/cartridge/experience/utilities/PageRenderHelper.js': pageRenderHelper,
        '*/cartridge/scripts/helpers/pageMetaHelper': pageMetaHelper
    });

    var regions = { main: {} };
    var pageMetaData = { title: 'a page' };
    var requestPageMetaData = { pageMetaTags: [] };

    function buildContext() {
        return {
            page: { ID: 'storePage', pageMetaTags: [] },
            content: { foo: 'bar' }
        };
    }

    beforeEach(function () {
        renderStub.reset();
        templateStub.reset();
        hookManagerStub.callHook.reset();
        pageRenderHelper.getRegionModelRegistry.reset();
        pageRenderHelper.isInEditMode.reset();
        pageRenderHelper.getPageMetaData.reset();
        pageMetaHelper.setPageMetaTags.reset();

        pageRenderHelper.getRegionModelRegistry.returns(regions);
        pageRenderHelper.getPageMetaData.returns(pageMetaData);
        pageRenderHelper.isInEditMode.returns(false);
        renderStub.returns({ text: 'rendered html' });
        templateStub.returns({ render: renderStub });

        // eslint-disable-next-line no-global-assign
        global.request = { pageMetaData: requestPageMetaData };
    });

    afterEach(function () {
        delete global.request;
    });

    it('should render the storePage template and return its text', function () {
        var result = storePage.render(buildContext());

        assert.equal(result, 'rendered html');
        assert.isTrue(templateStub.calledWith('experience/pages/storePage'));
    });

    it('should populate the model with page, content, regions and metadata', function () {
        var context = buildContext();
        storePage.render(context);

        var renderedModel = renderStub.firstCall.args[0];

        assert.equal(renderedModel.action, '.');
        assert.strictEqual(renderedModel.page, context.page);
        assert.strictEqual(renderedModel.content, context.content);
        assert.strictEqual(renderedModel.regions, regions);
        assert.strictEqual(renderedModel.CurrentPageMetaData, pageMetaData);
    });

    it('should use the provided model when one is passed in', function () {
        var modelIn = { existing: 'value' };
        storePage.render(buildContext(), modelIn);

        var renderedModel = renderStub.firstCall.args[0];
        assert.strictEqual(renderedModel, modelIn);
        assert.equal(renderedModel.existing, 'value');
    });

    it('should not invoke the edit-mode hook when not in edit mode', function () {
        var context = buildContext();
        storePage.render(context);

        assert.isTrue(hookManagerStub.callHook.notCalled);
    });

    it('should invoke the edit-mode hook when in edit mode', function () {
        pageRenderHelper.isInEditMode.returns(true);
        var context = buildContext();
        storePage.render(context);

        assert.isTrue(hookManagerStub.callHook.calledOnceWith('app.experience.editmode', 'editmode'));
    });

    it('should call pageMetaHelper.setPageMetaTags with request.pageMetaData and the page when a rule resolved tags', function () {
        var context = buildContext();
        context.page.pageMetaTags = [{ ID: 'og:title', content: 'Resolved Title' }];

        storePage.render(context);

        assert.isTrue(pageMetaHelper.setPageMetaTags.calledOnceWith(requestPageMetaData, context.page));
    });

    // storePage always delegates to pageMetaHelper.setPageMetaTags, passing the page, regardless of
    // whether a rule resolved any tags. The empty-vs-populated distinction (CFT off / no rule) is a
    // property of setPageMetaTags itself and is covered in the pageMetaHelper unit test, not here —
    // pageMetaHelper is stubbed in this suite, so context.page.pageMetaTags never reaches real code.
    it('should delegate to pageMetaHelper.setPageMetaTags without throwing when the page carries no resolved tags', function () {
        var context = buildContext();
        delete context.page.pageMetaTags;

        assert.doesNotThrow(function () {
            storePage.render(context);
        });

        assert.isTrue(pageMetaHelper.setPageMetaTags.calledOnceWith(requestPageMetaData, context.page));
    });

    it('should call setPageMetaTags before getPageMetaData', function () {
        var context = buildContext();
        storePage.render(context);

        assert.isTrue(pageMetaHelper.setPageMetaTags.calledBefore(pageRenderHelper.getPageMetaData));
    });
});
