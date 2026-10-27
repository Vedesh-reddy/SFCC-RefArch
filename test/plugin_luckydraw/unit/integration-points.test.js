'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var HOUR = fixtures.HOUR;

describe('plugin_luckydraw integration points', function () {
    var h;
    var r;
    beforeEach(function () {
        h = harness({ preferences: { luckyDrawNotificationChannels: ['INBOX', 'EMAIL'] } });
        r = fixtures.campaign(h, 'daily-draw');
    });

    /**
     * Two entrants and a finished draw of yesterday's window.
     */
    function drawn() {
        var entries = h.require('scripts/helpers/luckyDrawEntryHelpers');
        ['C1', 'C2'].forEach(function (c, i) { entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'O' + i, customerNo: c, createdMs: Date.now() - 30 * HOUR }), Date.now()); });
        h.require('scripts/helpers/luckyDrawDrawHelpers').runDraws(1000);
    }

    describe('Custom Shopper API', function () {
        it('serves campaigns to any shopper token and own records only to registered ones', function () {
            var api = h.require('rest-apis/luckydraw/script');
            h.api({});
            api.listCampaigns();
            assert.equal(h.state.responses[0].body.data[0].campaignId, 'daily-draw');
            assert.notInclude(JSON.stringify(h.state.responses[0].body), 'LEGAL-2026-001');
            h.api({ path: { campaignId: 'daily-draw' } });
            api.getCampaign();
            assert.isNotNull(h.state.responses[0].body.nextDraw);
            h.api({});
            api.listMyEntries();
            assert.equal(h.state.responses[0].status, 401);
            h.api({ path: { campaignId: 'missing-draw' } });
            api.getCampaign();
            assert.equal(h.state.responses[0].status, 404);
        });

        it('creates a free entry with the token customer and never writes on GET', function () {
            var api = h.require('rest-apis/luckydraw/script');
            h.api({ customer: h.customer('C5'), path: { campaignId: 'daily-draw' } });
            api.listWinners();
            api.listDraws();
            assert.lengthOf(h.rows('LuckyDrawParticipant'), 0, 'reads create nothing');
            h.api({ customer: h.customer('C5'), path: { campaignId: 'daily-draw' }, body: { acceptTerms: true, termsVersion: 'v1', ageConfirmed: true, region: 'CA' } });
            api.createFreeEntry();
            assert.equal(h.state.responses[0].status, 201);
            api.createFreeEntry();
            assert.equal(h.state.responses[1].status, 422, 'one free entry per day');
            assert.equal(h.state.responses[1].type, 'luckydraw-limit-reached');
            h.api({ customer: h.customer('C5'), query: { c_campaignId: 'daily-draw' } });
            api.listMyEntries();
            assert.equal(h.state.responses[0].body.total, 1);
            h.api({ customer: h.customer('C6'), query: { c_campaignId: 'daily-draw' } });
            api.listMyEntries();
            assert.equal(h.state.responses[0].body.total, 0);
        });
    });

    describe('Custom Admin API', function () {
        it('applies an order event once and reports it again on a retry', function () {
            h.require('scripts/helpers/luckyDrawEntryHelpers').createEntryFromOrder(r, fixtures.order(h, { orderNo: 'R1' }), Date.now());
            var api = h.require('rest-apis/luckydraw-admin/script');
            h.api({ body: { orderNo: 'R1', event: 'CHARGEBACK' } });
            api.postOrderEvent();
            assert.deepEqual(h.state.responses[0].body, { replayed: false, cancelled: 1, disqualified: 0 });
            h.api({ body: { orderNo: 'R1', event: 'CHARGEBACK' } });
            api.postOrderEvent();
            assert.isTrue(h.state.responses[0].body.replayed);
            h.api({ body: { orderNo: 'R1', event: 'DELETE' } });
            api.postOrderEvent();
            assert.equal(h.state.responses[0].status, 400);
            assert.equal(h.state.responses[0].type, 'luckydraw-invalid');
        });

        it('exposes draws read-only, with a verification that recomputes them', function () {
            drawn();
            var api = h.require('rest-apis/luckydraw-admin/script');
            var x = h.rows('LuckyDrawExecution').filter(function (e) { return e.custom.status === 'FINALIZED'; })[0];
            h.api({ path: { executionId: x.custom.executionId } });
            api.verifyExecution();
            assert.isTrue(h.state.responses[0].body.ok);
            h.api({ path: { executionId: x.custom.executionId } });
            api.getExecution();
            assert.lengthOf(h.state.responses[0].body.winners, 2);
            var open = h.rows('LuckyDrawExecution').filter(function (e) { return e.custom.status === 'SCHEDULED'; })[0];
            h.api({ path: { executionId: open.custom.executionId } });
            api.getExecution();
            assert.isNull(h.state.responses[0].body.seed, 'no one sees the seed before the draw');
        });
    });

    describe('jobs', function () {
        it('do nothing while the program is off', function () {
            h.preferences.luckyDrawEnabled = false;
            var jobs = h.require('scripts/jobs/luckydraw');
            ['status', 'entries', 'reconcile', 'draw', 'verify', 'rewards', 'notifications', 'cleanup', 'auditExport'].forEach(function (step) {
                assert.equal(jobs[step]({}).code, 'DISABLED', step);
            });
        });

        it('run the whole flow from paid order to issued reward and notification e-mails', function () {
            var jobs = h.require('scripts/jobs/luckydraw');
            ['C1', 'C2'].forEach(function (c, i) { fixtures.order(h, { orderNo: 'J' + i, customerNo: c, createdMs: Date.now() - 30 * HOUR }); });
            ['status', 'entries', 'reconcile', 'draw', 'verify', 'rewards', 'notifications'].forEach(function (step) {
                assert.equal(jobs[step]({ MaxItems: 100 }).code, 'OK', step);
            });
            assert.equal(h.rows('LuckyDrawReward')[0].custom.status, 'ISSUED');
            assert.isTrue(h.rows('LuckyDrawNotification').some(function (n) { return n.custom.type === 'REWARD_ISSUED' && n.custom.channel === 'EMAIL' && n.custom.status === 'SENT'; }));
            assert.isTrue(h.state.mails.every(function (m) { return m.template === 'luckydraw/email/notification' && /@example\.com$/.test(m.mail.to); }));
            assert.notInclude(JSON.stringify(h.state.mails), h.rows('LuckyDrawReward')[0].custom.couponCode, 'no code in e-mails');
        });

        it('exports new audit events once to a JSON-lines file', function () {
            var jobs = h.require('scripts/jobs/luckydraw');
            var first = JSON.parse(jobs.auditExport({}).message);
            assert.isAbove(first.exported, 0);
            var file = Object.keys(h.state.files).filter(function (p) { return /audit-\d+-\d+\.jsonl$/.test(p); })[0];
            assert.include(file, '/IMPEX/src/plugin-luckydraw/audit/');
            JSON.parse(h.state.files[file].toString('utf8').split('\n')[0]);
            assert.equal(JSON.parse(jobs.auditExport({}).message).exported, 0);
        });

        it('cleans up expired locks', function () {
            h.require('scripts/helpers/luckyDrawDrawHelpers').acquireLock('draw:x', 'holder');
            h.rows('LuckyDrawLock')[0].custom.expiresAt = new Date(Date.now() - 2 * HOUR);
            h.require('scripts/jobs/luckydraw').cleanup({});
            assert.lengthOf(h.rows('LuckyDrawLock'), 0);
        });
    });

    describe('storefront page model', function () {
        it('shows winners masked, and the visitor only their own standing', function () {
            drawn();
            var campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
            var guest = campaignHelpers.getCampaignPage('daily-draw', null);
            assert.isFalse(guest.me.signedIn);
            assert.lengthOf(guest.winners, 1);
            assert.match(guest.winners[0].displayName, /^[A-Z]\. \([A-Z]{2}\)$/);
            assert.notInclude(JSON.stringify(guest), '"C1"');
            assert.notInclude(JSON.stringify(guest), '"C2"');
            var mine = campaignHelpers.getCampaignPage('daily-draw', 'C1').me;
            assert.equal(mine.totalEntries, 1);
            assert.equal(mine.progressPercent, 10);
            assert.deepEqual(mine.badges.map(function (b) { return b.earned; }), [true, false, false]);
            assert.lengthOf(mine.entries, 1);
        });

        it('hides winners when the site does not publish them', function () {
            drawn();
            h.preferences.luckyDrawPublishWinners = false;
            assert.lengthOf(h.require('scripts/helpers/luckyDrawCampaignHelpers').getCampaignPage('daily-draw', null).winners, 0);
        });

        it('does not show drafts or cancelled campaigns', function () {
            var campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
            campaignHelpers.changeCampaignStatus('daily-draw', 'cancel', 'Withdrawn for testing', fixtures.ADMIN);
            assert.isNull(campaignHelpers.getCampaignPage('daily-draw', null));
            assert.lengthOf(campaignHelpers.getOverview(), 0);
        });
    });
});
