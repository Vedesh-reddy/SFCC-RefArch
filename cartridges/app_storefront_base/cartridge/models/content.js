'use strict';

/**
 * Represents content model
 * @param  {dw.content.Content} contentValue - result of ContentMgr.getContent call
 * @param  {string} renderingTemplate - rendering template for the given content
 * @return {void}
 * @constructor
 */
function content(contentValue, renderingTemplate) {
    if (!contentValue.online) {
        return null;
    }

    var usedRenderingTemplate = renderingTemplate || 'components/content/contentassetinc';

    this.body = (contentValue && contentValue.custom && contentValue.custom.body) || null;
    this.UUID = contentValue.UUID;
    this.name = contentValue.name;
    this.template = contentValue.template || usedRenderingTemplate;

    return this;
}

module.exports = content;
