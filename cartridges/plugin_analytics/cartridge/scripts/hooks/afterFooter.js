'use strict';

/**
 * Loads the analytics script with the page's listing or product context. The markup holds no
 * shopper data, so cached pages stay shareable; the session is identified only when the
 * beacon reaches Analytics-Collect.
 * @param {Object} pdict - page model
 */
function afterFooter(pdict) {
    var analyticsHelpers = require('*/cartridge/scripts/helpers/analyticsHelpers');
    if (!analyticsHelpers.isEnabled('product')) return;
    var page = {};
    if (pdict.product && pdict.product.id && pdict.addToCartUrl) {
        page = { type: 'pdp', p: String(pdict.product.id) };
    } else if (pdict.productSearch) {
        var search = pdict.productSearch;
        if (search.searchKeywords) {
            page = { type: 'search', l: 'search', t: String(search.searchKeywords).slice(0, 100), r: search.count };
        } else if (search.category) {
            page = { type: 'plp', l: 'cat:' + search.category.id };
        }
    }
    var URLUtils = require('dw/web/URLUtils');
    require('dw/template/Velocity').render(
        '<div id="analytics-config" class="d-none" data-url="$url" data-batch-size="$size" data-page="$page"></div><script defer src="$script"></script>',
        {
            url: URLUtils.url('Analytics-Collect'),
            size: String(analyticsHelpers.getIntPreference('analyticsBatchSize', 1, 50, 20)),
            page: JSON.stringify(page).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
            script: URLUtils.staticURL('/js/analytics.js')
        }
    );
}

module.exports = {
    afterFooter: afterFooter
};
