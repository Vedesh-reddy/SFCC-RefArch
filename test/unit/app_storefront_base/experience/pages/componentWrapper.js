'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

describe('componentWrapper page', function () {
    var renderStub = sinon.stub();
    var templateStub = sinon.stub();
    var hookManagerStub = { callHook: sinon.stub() };
    var pageRenderHelper = {
        getRegionModelRegistry: sinon.stub(),
        isInEditMode: sinon.stub(),
        getPageMetaData: sinon.stub()
    };

    var componentWrapper = proxyquire('../../../../../cartridges/app_storefront_base/cartridge/experience/pages/componentWrapper.js', {
        'dw/util/Template': templateStub,
        'dw/util/HashMap': function () {
            return {};
        },
        'dw/system/HookMgr': hookManagerStub,
        '*/cartridge/experience/utilities/PageRenderHelper.js': pageRenderHelper
    });

    var regions = { main: {} };
    var pageMetaData = { title: 'a page' };

    function buildContext() {
        return {
            page: { ID: 'componentWrapper' },
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

        pageRenderHelper.getRegionModelRegistry.returns(regions);
        pageRenderHelper.getPageMetaData.returns(pageMetaData);
        pageRenderHelper.isInEditMode.returns(false);
        renderStub.returns({ text: 'rendered html' });
        templateStub.returns({ render: renderStub });
    });

    it('should render the componentWrapper template and return its text', function () {
        var result = componentWrapper.render(buildContext());

        assert.equal(result, 'rendered html');
        assert.isTrue(templateStub.calledWith('experience/pages/componentWrapper'));
    });

    it('should populate the model with page, content, regions and metadata', function () {
        var context = buildContext();
        componentWrapper.render(context);

        var renderedModel = renderStub.firstCall.args[0];

        assert.equal(renderedModel.action, '.');
        assert.strictEqual(renderedModel.page, context.page);
        assert.strictEqual(renderedModel.content, context.content);
        assert.strictEqual(renderedModel.regions, regions);
        assert.strictEqual(renderedModel.CurrentPageMetaData, pageMetaData);
    });

    it('should use the provided model when one is passed in', function () {
        var modelIn = { existing: 'value' };
        componentWrapper.render(buildContext(), modelIn);

        var renderedModel = renderStub.firstCall.args[0];
        assert.strictEqual(renderedModel, modelIn);
        assert.equal(renderedModel.existing, 'value');
    });

    it('should not invoke the edit-mode hook when not in edit mode', function () {
        var context = buildContext();
        componentWrapper.render(context);

        assert.isTrue(hookManagerStub.callHook.notCalled);
    });

    it('should invoke the edit-mode hook when in edit mode', function () {
        pageRenderHelper.isInEditMode.returns(true);
        var context = buildContext();
        componentWrapper.render(context);

        assert.isTrue(hookManagerStub.callHook.calledOnceWith('app.experience.editmode', 'editmode'));
    });
});
