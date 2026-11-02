'use strict';

/**
 * Loads the storefront script. The markup holds no shopper data, so cached pages stay shareable:
 * the badge, labels and savings come from uncached routes when the page runs.
 */
function afterFooter() {
    if (!require('*/cartridge/scripts/helpers/membershipPlanHelpers').isEnabled()) return;
    var URLUtils = require('dw/web/URLUtils');
    require('dw/template/Velocity').render(
        '<div id="prime-membership-config" class="d-none" data-context-url="$context" data-labels-url="$labels"></div><script defer src="$script"></script>',
        {
            context: URLUtils.url('PrimeMembership-PageContext'),
            labels: URLUtils.url('PrimeMembership-ProductLabels'),
            script: URLUtils.staticURL('/js/prime-membership.js')
        }
    );
}

module.exports = {
    afterFooter: afterFooter
};
