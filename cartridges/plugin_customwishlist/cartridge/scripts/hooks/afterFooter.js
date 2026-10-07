'use strict';

/**
 * Pages using this hook may be cached, so the shopper-specific price alert is
 * served through an uncached remote include instead of being rendered inline.
 */
function afterFooter() {
    var Velocity = require('dw/template/Velocity');
    Velocity.render("$velocity.remoteInclude('CustomWishlist-Alert')", { velocity: Velocity });
}

module.exports = {
    afterFooter: afterFooter
};
