'use strict';

var assert = require('chai').assert;
var Content = require('../../../../cartridges/app_storefront_base/cartridge/models/content');

describe('Content', function () {
    it('should return converted content model', function () {
        var contentValue = {
            custom: {
                body: 'Hello'
            },
            template: 'templateName',
            UUID: 22,
            online: true
        };

        var content = new Content(contentValue);

        assert.deepEqual(content, { body: 'Hello', template: 'templateName', UUID: 22 });
    });

    it('should return converted content model without a body', function () {
        var contentValue = {
            template: 'templateName',
            UUID: 22,
            online: true
        };

        var content = new Content(contentValue);

        assert.isNull(content.body);
    });

    it('should return converted content model with null for a body', function () {
        var contentValue = {
            custom: {},
            template: 'templateName',
            UUID: 22,
            online: true
        };

        var content = new Content(contentValue);

        assert.isNull(content.body);
    });

    it('should return converted content model with default template', function () {
        var contentValue = {
            custom: { body: 'Hello' },
            UUID: 22,
            online: true
        };

        var content = new Content(contentValue);

        assert.equal(content.template, 'components/content/contentassetinc');
    });

    it('should return undefined for the body if online flag is false', function () {
        var contentValue = {
            custom: { body: 'Hello' },
            UUID: 22,
            online: false
        };

        var content = new Content(contentValue);

        assert.isUndefined(content.body);
    });
});
