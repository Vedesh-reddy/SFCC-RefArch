'use strict';

/**
 * Loads the storefront script on every page with the endpoints and labels it needs.
 * The markup is the same for every shopper, so cached pages stay shareable; the
 * product panel itself is fetched separately per selected variant.
 */
function afterFooter() {
    var Velocity = require('dw/template/Velocity');
    var URLUtils = require('dw/web/URLUtils');
    var Resource = require('dw/web/Resource');
    Velocity.render(
        '<div id="smart-commerce-config" class="d-none" data-panel-url="$panel" data-compare-url="$compare"'
        + ' data-label-add="$add" data-label-remove="$remove" data-label-tray="$tray" data-label-go="$go" data-label-clear="$clear" data-label-limit="$limit"></div>'
        + '<script defer src="$script"></script>',
        {
            panel: URLUtils.url('SmartProduct-Panel'),
            compare: URLUtils.url('ProductCompare-Show'),
            script: URLUtils.staticURL('/js/smart-commerce.js'),
            add: Resource.msg('compare.add', 'smartcommerce', null),
            remove: Resource.msg('compare.remove', 'smartcommerce', null),
            tray: Resource.msg('compare.tray', 'smartcommerce', null),
            go: Resource.msg('compare.go', 'smartcommerce', null),
            clear: Resource.msg('compare.clear', 'smartcommerce', null),
            limit: Resource.msg('compare.limit', 'smartcommerce', null)
        }
    );
}

module.exports = {
    afterFooter: afterFooter
};
