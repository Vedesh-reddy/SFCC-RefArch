'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

describe('plugin_luckydraw campaigns', function () {
    var h;
    var campaignHelpers;
    beforeEach(function () {
        h = harness();
        campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
        fixtures.coupon(h, 'ld-200');
    });

    /**
     * @param {Object} [overrides] - input overrides
     * @returns {Object} save result
     */
    function save(overrides) {
        return campaignHelpers.saveCampaign(null, fixtures.input(Object.assign({ campaignId: 'summer-draw' }, overrides || {})), null, fixtures.ADMIN);
    }

    /**
     * @param {Object} [overrides] - input overrides
     * @returns {Object} rules of a saved draft
     */
    function draft(overrides) {
        assert.isFalse(save(overrides).error);
        return campaignHelpers.getCampaignRules(campaignHelpers.getCampaign('summer-draw'));
    }

    /**
     * @param {string} id - campaign
     * @param {string} action - status action
     * @param {string} reason - reason
     * @returns {Object} result
     */
    function change(id, action, reason) {
        return campaignHelpers.changeCampaignStatus(id, action, reason, fixtures.ADMIN);
    }

    it('validates every rule on save and stores amounts as cents', function () {
        assert.equal(save({ campaignId: 'Bad ID' }).fields.campaignId, 'invalid');
        assert.equal(save({ timeZone: 'Europe/Berlin' }).fields.timeZone, 'not-allowed');
        assert.equal(save({ endLocal: '2020-01-01 00:00' }).fields.endLocal, 'before-start');
        assert.equal(save({ prizes: '[{"tier":"x"}]' }).fields.prizes, 'invalid-tier');
        assert.equal(save({ minOrder: '-5' }).fields.minOrder, 'invalid');
        assert.equal(save({ maxEntriesPerOrder: '0' }).fields.maxEntriesPerOrder, 'out-of-range');
        assert.equal(save({ mode: 'LOTTERY' }).fields.mode, 'invalid');
        var r = draft();
        assert.equal(r.status, 'DRAFT');
        assert.equal(r.minOrderCents, 2500);
        assert.deepEqual(r.excludedRegions, ['RI']);
        assert.equal(r.prizes[0].couponId, 'ld-200');
        assert.equal(save().errorCode, 'conflict');
    });

    it('lists every readiness problem, including the legal gate and the free entry method', function () {
        var r = draft({ legalApprovalRef: '', freeEntryEnabled: 'false', termsContentAssetId: 'missing', selectionMode: '' });
        h.state.coupons['ld-200'].limit = 0;
        var problems = campaignHelpers.getReadinessProblems(r);
        ['legal-approval-reference-missing', 'free-entry-method-required', 'selection-mode-required', 'terms-content-missing', 'coupon-ld-200-not-single-use'].forEach(function (p) {
            assert.include(problems, p);
        });
        var blocked = change('summer-draw', 'schedule', '');
        assert.equal(blocked.errorCode, 'invalid');
        assert.include(blocked.problems, 'legal-approval-reference-missing');
        h.state.instanceType = 2;
        assert.include(campaignHelpers.getReadinessProblems(r), 'instance-not-legally-approved');
    });

    it('requires a draw delay at least as long as the hold period, and one prize in guaranteed mode', function () {
        var r = draft({ holdHours: '24', drawDelayMinutes: '60', mode: 'GUARANTEED', prizes: JSON.stringify([{ tier: 'a', label: 'A', winners: 1, couponId: 'ld-200', validityDays: 5 }, { tier: 'b', label: 'B', winners: 1, couponId: 'ld-200', validityDays: 5 }]) });
        var problems = campaignHelpers.getReadinessProblems(r);
        assert.include(problems, 'draw-delay-shorter-than-hold');
        assert.include(problems, 'guaranteed-needs-one-prize');
        assert.notInclude(problems, 'free-entry-method-required');
    });

    it('freezes the rules when scheduled and starts when the start time has passed', function () {
        draft();
        assert.equal(change('summer-draw', 'schedule', '').status, 'SCHEDULED');
        assert.equal(campaignHelpers.saveCampaign('summer-draw', fixtures.input({ minOrder: '1' }), null, fixtures.ADMIN).errorCode, 'forbidden');
        assert.deepEqual(campaignHelpers.advanceCampaigns(10), { activated: 1, completed: 0 });
        assert.equal(campaignHelpers.getCampaignRules(campaignHelpers.getCampaign('summer-draw')).status, 'ACTIVE');
        assert.isTrue(change('summer-draw', 'unschedule', '').error);
    });

    it('refuses a draft change from a stale page', function () {
        draft();
        assert.equal(campaignHelpers.saveCampaign('summer-draw', fixtures.input({ name: 'Renamed draw' }), 5, fixtures.ADMIN).errorCode, 'stale');
        assert.isFalse(campaignHelpers.saveCampaign('summer-draw', fixtures.input({ name: 'Renamed draw' }), 0, fixtures.ADMIN).error);
    });

    it('pauses safely: orders during the pause do not count, earlier ones do', function () {
        fixtures.campaign(h, 'pause-draw');
        var before = Date.now() - 2 * fixtures.HOUR;
        assert.equal(change('pause-draw', 'pause', 'short').fields.reason, 'required');
        assert.isFalse(change('pause-draw', 'pause', 'Fraud investigation underway').error);
        var r = campaignHelpers.getCampaignRules(campaignHelpers.getCampaign('pause-draw'));
        assert.equal(r.status, 'PAUSED');
        assert.isTrue(campaignHelpers.isAcceptingAt(r, before));
        assert.isFalse(campaignHelpers.isAcceptingAt(r, Date.now() + 1000));
        change('pause-draw', 'resume', '');
        r = campaignHelpers.getCampaignRules(campaignHelpers.getCampaign('pause-draw'));
        assert.equal(r.status, 'ACTIVE');
        assert.isNotNull(r.pauses[0].to);
        assert.isTrue(campaignHelpers.isAcceptingAt(r, Date.now() + 1000));
        assert.isTrue(h.rows('LuckyDrawAuditEvent').some(function (a) { return a.custom.action === 'PAUSE' && a.custom.actorRef === 'ops'; }));
    });

    it('cancels with a reason, and a cancelled campaign accepts nothing', function () {
        fixtures.campaign(h, 'cancel-draw');
        assert.equal(change('cancel-draw', 'cancel', '').fields.reason, 'required');
        assert.isFalse(change('cancel-draw', 'cancel', 'Prize supplier withdrew').error);
        var r = campaignHelpers.getCampaignRules(campaignHelpers.getCampaign('cancel-draw'));
        assert.isFalse(campaignHelpers.isAcceptingAt(r, Date.now() - fixtures.HOUR));
        assert.equal(change('cancel-draw', 'resume', '').errorCode, 'not-allowed-now');
    });

    it('shows only public fields on the storefront', function () {
        var r = fixtures.campaign(h, 'view-draw');
        var view = campaignHelpers.getCampaignView(r);
        assert.notProperty(view, 'legalApprovalRef');
        assert.notProperty(view, 'fundingSource');
        assert.notInclude(JSON.stringify(view), 'ld-200');
        assert.isTrue(view.demonstration, 'labelled as a demonstration off production');
        assert.equal(view.minOrderFormatted, '$25.00');
        assert.isNull(campaignHelpers.getCampaignPage('no-such-draw', null));
    });
});
