'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var sinon = require('sinon');

describe('render', function () {
    var render = null;
    var ismlRender = sinon.spy();

    beforeEach(function () {
        global.XML = function (xmlString) {
            var parseString = require('xml2js').parseString;

            return parseString(xmlString, 'text/xml', function (error) {
                if (error) {
                    throw new Error(error);
                }
            });
        };

        render = proxyquire('../../../../cartridges/modules/server/render', {
            'dw/template/ISML': {
                renderTemplate: ismlRender
            }
        });
    });

    afterEach(function () {
        ismlRender.reset();
    });

    it('should correctly render a template', function () {
        render.template('name', {}, {});

        assert.isTrue(ismlRender.calledOnce);
    });

    it('should pass data correctly to the view', function () {
        render.template('template', { name: 'value' }, {});

        assert.isTrue(ismlRender.calledWith('template', sinon.match({ name: 'value' })));
    });

    it('should render a json output', function () {
        var response = {
            print: sinon.spy(),
            setContentType: sinon.spy()
        };

        render.json({}, response);

        assert.isTrue(response.setContentType.calledWith('application/json'));
        assert.isTrue(response.print.calledOnce);
    });

    it('should render valid xml output', function () {
        var response = {
            print: sinon.spy(),
            setContentType: sinon.spy()
        };

        render.xml({
            key1: 'value1',
            key2: 'value2',
            xml: '<xmlKey></xmlKey>'
        }, response);

        assert.isTrue(response.setContentType.calledWith('application/xml'));
        assert.isTrue(response.print.calledOnce);
    });

    it('should throw an exception when invalid XML is provided', function () {
        var response = {
            print: function () { /* DUMMY FUNCTION */ },
            setContentType: function () { /* DUMMY FUNCTION */ }
        };

        try {
            render.xml({
                xml: '<x>I am not valid XML<y>'
            }, response);
        } catch (e) {
            assert.isNotNull(e);
        }
    });

    it('should render error page when template failed', function () {
        var renderMock = proxyquire('../../../../cartridges/modules/server/render', {
            'dw/template/ISML': {
                renderTemplate: function () {
                    throw new Error('hello');
                }
            }
        });
        try {
            renderMock.template('template', {});
        } catch (e) {
            assert.isNotNull(e);
        }
    });
});
