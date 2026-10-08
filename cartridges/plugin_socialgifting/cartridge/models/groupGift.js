'use strict';

var store = require('../scripts/helpers/store');
var registryHelper = require('../scripts/helpers/registryHelper');
var permissions = require('../scripts/helpers/registryPermissionHelper');
var money = require('../scripts/util/money');
var v = require('../scripts/util/validation');
/**
 * GroupGift the groupGift domain operation.
 * @param {*} gift - gift input
 * @param {*} actor - actor input
 */
function GroupGift(gift, actor) {
    if (!gift) v.fail('NOT_FOUND', 404);
    var registry = registryHelper.get(gift.custom.registryKey);
    permissions.view(registry, actor);
    var role = permissions.role(registry, actor);
    if (['OWNER', 'CO_OWNER'].indexOf(role) !== -1 && registry.custom.secretGiftMode && registry.custom.revealAt.getTime() > Date.now()) v.fail('SECRET_GIFT', 404);
    this.key = gift.custom.publicKey;
    this.registryKey = gift.custom.registryKey;
    this.status = gift.custom.status;
    this.target = gift.custom.target;
    this.collected = gift.custom.paid;
    this.remaining = money.sub(gift.custom.target, money.add(gift.custom.paid, gift.custom.held));
    this.currency = gift.custom.currency;
    this.allowAnonymous = registry.custom.allowAnonymousGifts && require('../scripts/util/preferences').enabled('AnonymousGiftingEnabled');
    this.canContribute = registry.custom.status === 'ACTIVE' && gift.custom.status === 'OPEN' && gift.custom.expiresAt.getTime() > Date.now();
    this.contributors = store.query('Contribution', 'custom.giftKey = {0} AND custom.status = {1}', [this.key, 'PAID'], 20, 'creationDate desc')
        .map(function (contribution) { return { name: contribution.custom.anonymous || !registry.custom.showContributorNames ? 'Anonymous Guest' : (contribution.custom.displayName || 'A contributor') }; });
}
module.exports = GroupGift;
