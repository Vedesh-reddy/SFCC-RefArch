'use strict';

var assert = require('chai').assert;
var harness = require('../fixtures/harness');
var fixtures = require('../fixtures/fixtures');

var HOUR = 3600000;

describe('product access', function () {
    var h;
    var helpers;
    beforeEach(function () {
        h = harness();
        fixtures.plans(h);
        helpers = h.require('scripts/helpers/membershipAccessHelpers');
    });

    function sale(hoursAway) { return { primeMembershipPublicAt: new Date(Date.now() + hoursAway * HOUR) }; }

    it('leaves ordinary products open to everyone', function () {
        assert.isTrue(helpers.checkProductAccess(null, fixtures.product(h, 'P1')).allowed);
    });

    it('opens a sale 12, 24 and 48 hours early by plan', function () {
        [['prime', 12], ['ultra-prime', 24], ['ultra-prime-max', 48]].forEach(function (entry, i) {
            var no = 'C' + i;
            fixtures.member(h, no, entry[0]);
            assert.isTrue(helpers.checkProductAccess(no, fixtures.product(h, 'IN' + i, { custom: sale(entry[1] - 1) })).allowed, entry[0] + ' inside');
            assert.isFalse(helpers.checkProductAccess(no, fixtures.product(h, 'OUT' + i, { custom: sale(entry[1] + 1) })).allowed, entry[0] + ' outside');
        });
    });

    it('keeps nonmembers and guests out until the public start', function () {
        var product = fixtures.product(h, 'P1', { custom: sale(1) });
        assert.equal(helpers.checkProductAccess(null, product).reason, 'early-access');
        assert.equal(helpers.checkProductAccess('NOBODY', product).reason, 'early-access');
    });

    it('opens to everyone after the public start, with no label', function () {
        var result = helpers.checkProductAccess(null, fixtures.product(h, 'P1', { custom: sale(-1) }));
        assert.isTrue(result.allowed);
        assert.isNull(result.label);
    });

    it('limits an exclusive product to the plan rank and above', function () {
        var product = fixtures.product(h, 'P1', { custom: { primeMembershipMinRank: 2 } });
        fixtures.member(h, 'LOW', 'prime');
        fixtures.member(h, 'HIGH', 'ultra-prime');
        assert.equal(helpers.checkProductAccess('LOW', product).reason, 'members-only');
        assert.isTrue(helpers.checkProductAccess('HIGH', product).allowed);
        assert.equal(helpers.checkProductAccess(null, product).reason, 'members-only');
    });

    it('gives launch access only to plans that have it', function () {
        var product = fixtures.product(h, 'P1', { custom: { primeMembershipLaunchAt: new Date(Date.now() + 10 * HOUR) } });
        fixtures.member(h, 'MAX', 'ultra-prime-max');
        fixtures.member(h, 'ULTRA', 'ultra-prime');
        assert.isTrue(helpers.checkProductAccess('MAX', product).allowed);
        assert.equal(helpers.checkProductAccess('ULTRA', product).reason, 'not-launched');
    });

    it('reads the rule from the master for a variant', function () {
        var master = fixtures.product(h, 'M1', { custom: sale(5) });
        var variant = fixtures.product(h, 'V1', { master: master });
        assert.isFalse(helpers.checkProductAccess(null, variant).allowed);
    });

    it('takes early access away from a suspended member', function () {
        fixtures.member(h, 'C1', 'ultra-prime-max', { status: 'SUSPENDED' });
        assert.isFalse(helpers.checkProductAccess('C1', fixtures.product(h, 'P1', { custom: sale(1) })).allowed);
    });

    it('does not restrict anything while the plugin is off', function () {
        h.preferences.primeMembershipEnabled = false;
        assert.isTrue(helpers.checkProductAccess(null, fixtures.product(h, 'P1', { custom: { primeMembershipMinRank: 3 } })).allowed);
    });

    it('finds a blocked product in a basket', function () {
        var product = fixtures.product(h, 'LOCKED', { custom: { primeMembershipMinRank: 3 } });
        var basket = h.basket({ lines: [{ productID: 'LOCKED', product: product, cents: 100 }] });
        assert.equal(helpers.findBlockedProduct(basket, 'NOBODY'), 'LOCKED');
    });

    it('ignores non-catalog lines in a basket', function () {
        assert.isNull(helpers.findBlockedProduct(h.basket({ lines: [{ productID: 'x', cents: 100 }] }), null));
    });

    describe('labels', function () {
        it('labels a locked product for a guest', function () {
            fixtures.product(h, 'P1', { custom: { primeMembershipMinRank: 1 } });
            var labels = helpers.getProductLabels(null, ['P1']);
            assert.isTrue(labels.P1.locked);
            assert.equal(labels.P1.label, 'Members only');
        });

        it('shows a member the discount on eligible products only', function () {
            fixtures.member(h, 'C1', 'ultra-prime');
            fixtures.product(h, 'P1');
            assert.include(helpers.getProductLabels('C1', ['P1']).P1.offer, '10%');
        });

        it('returns nothing for ordinary products and unknown IDs', function () {
            fixtures.product(h, 'P1');
            assert.deepEqual(helpers.getProductLabels(null, ['P1', 'NOPE']), {});
        });
    });
});
