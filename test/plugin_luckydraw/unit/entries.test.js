'use strict';

var assert = require('chai').assert;
var harness = require('./harness');
var fixtures = require('./fixtures');

var HOUR = fixtures.HOUR;

describe('plugin_luckydraw entries', function () {
    var h;
    var entries;
    var campaignHelpers;
    var r;
    beforeEach(function () {
        h = harness();
        entries = h.require('scripts/helpers/luckyDrawEntryHelpers');
        campaignHelpers = h.require('scripts/helpers/luckyDrawCampaignHelpers');
        r = fixtures.campaign(h, 'daily-draw');
    });

    describe('order eligibility', function () {
        it('accepts only registered, paid, open US orders above the minimum, inside the campaign', function () {
            var ok = entries.evaluateOrder(r, fixtures.order(h, { orderNo: 'O1' }));
            assert.isTrue(ok.eligible);
            assert.equal(ok.entryCount, 1);
            assert.equal(ok.eligibleCents, 3000);
            var reasons = [
                fixtures.order(h, { orderNo: 'O2', customerNo: null }),
                fixtures.order(h, { orderNo: 'O3', paid: false }),
                fixtures.order(h, { orderNo: 'O4', status: 6 }),
                fixtures.order(h, { orderNo: 'O5', country: 'CA' }),
                fixtures.order(h, { orderNo: 'O6', state: 'RI' }),
                fixtures.order(h, { orderNo: 'O7', cents: 2499 }),
                fixtures.order(h, { orderNo: 'O8', createdMs: Date.now() - 100 * HOUR })
            ].map(function (o) { return entries.evaluateOrder(r, o).reason; });
            assert.deepEqual(reasons, ['guest', 'not-paid', 'order-status', 'country', 'region', 'amount', 'outside-campaign']);
        });

        it('uses prorated prices of eligible products only, and caps entries per order', function () {
            var campaign = h.get('LuckyDrawCampaign', 'daily-draw');
            campaign.custom.entryMethod = 'PER_INCREMENT';
            campaign.custom.incrementCents = 1000;
            campaign.custom.eligibleCategoryIds = ['shoes'];
            campaign.custom.excludedProductIds = ['GIFT'];
            campaign.custom.bonusCategoryIds = ['new'];
            campaign.custom.bonusEntries = 2;
            var rules = campaignHelpers.getCampaignRules(campaign);
            fixtures.product(h, 'SHOE', ['shoes']);
            fixtures.product(h, 'NEW-SHOE', ['shoes', 'new']);
            fixtures.product(h, 'HAT', ['hats']);
            fixtures.product(h, 'GIFT', ['shoes']);
            var result = entries.evaluateOrder(rules, fixtures.order(h, { orderNo: 'O1', lines: [{ productID: 'SHOE', cents: 2550 }, { productID: 'NEW-SHOE', cents: 1000 }, { productID: 'HAT', cents: 9000 }, { productID: 'GIFT', cents: 5000 }, { productID: 'SHOE', cents: 900, bonus: true }] }));
            assert.equal(result.eligibleCents, 3550);
            assert.equal(result.entryCount, 5, '3 increments + 2 bonus, capped at 5 per order');
        });

        it('adds loyalty or referral entries from the hook only when the campaign enables it', function () {
            h.state.hooks['app.plugin.luckydraw.bonus'] = { bonusEntries: function () { return 2; } };
            var order = fixtures.order(h, { orderNo: 'O1' });
            assert.equal(entries.evaluateOrder(r, order).entryCount, 1);
            r.externalBonusEnabled = true;
            assert.equal(entries.evaluateOrder(r, order).entryCount, 3);
            h.state.hooks['app.plugin.luckydraw.bonus'] = { bonusEntries: function () { return 1e9; } };
            assert.equal(entries.evaluateOrder(r, order).entryCount, 1, 'out-of-range answers are ignored');
        });
    });

    describe('entry creation', function () {
        it('creates one entry per order, however often the job sees it', function () {
            var order = fixtures.order(h, { orderNo: 'O1' });
            assert.equal(entries.createEntryFromOrder(r, order, Date.now()), 'created');
            assert.equal(entries.createEntryFromOrder(r, order, Date.now()), 'duplicate');
            var e = h.rows('LuckyDrawEntry')[0].custom;
            assert.equal(e.status, 'PENDING');
            assert.notInclude(e.entryId, 'O1', 'the key does not reveal the order number');
            assert.equal(entries.getParticipant('daily-draw', 'C1').custom.entryCount, 1);
            assert.isTrue(h.rows('LuckyDrawNotification').some(function (n) { return n.custom.type === 'ENTRY_CREATED'; }));
        });

        it('walks paid orders of the lookback period with a cursor in the job', function () {
            for (var i = 0; i < 5; i++) fixtures.order(h, { orderNo: 'J' + i, customerNo: 'C' + i, createdMs: Date.now() - (40 - i) * HOUR });
            fixtures.order(h, { orderNo: 'UNPAID', paid: false });
            var first = entries.processOrders(3);
            assert.equal(first.created, 3);
            var second = entries.processOrders(3);
            assert.equal(second.created, 2);
            assert.equal(entries.processOrders(10).created, 0, 'end of the period: the cursor restarts');
            var again = entries.processOrders(10);
            assert.equal(again.orders, 5, 'the whole period is walked again, for late payments');
            assert.equal(again.duplicate, 5);
            assert.lengthOf(h.rows('LuckyDrawEntry'), 5);
        });

        it('enforces the customer maximum and records the refused order once', function () {
            h.get('LuckyDrawCampaign', 'daily-draw').custom.maxEntriesPerCustomer = 2;
            r = campaignHelpers.getCampaignRules(h.get('LuckyDrawCampaign', 'daily-draw'));
            ['A', 'B', 'C'].forEach(function (n) { entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: n }), Date.now()); });
            var statuses = h.rows('LuckyDrawEntry').map(function (e) { return e.custom.status + ':' + (e.custom.reason || ''); }).sort();
            assert.deepEqual(statuses, ['INELIGIBLE:customer-limit', 'PENDING:', 'PENDING:']);
            assert.equal(entries.getParticipant('daily-draw', 'C1').custom.entryCount, 2);
        });

        it('flags unusually many entries for review instead of counting them silently', function () {
            h.preferences.luckyDrawVelocityMaxEntriesPerDay = 2;
            ['A', 'B', 'C'].forEach(function (n) { entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: n, createdMs: Date.now() - 2 * HOUR }), Date.now()); });
            assert.deepEqual(h.rows('LuckyDrawEntry').map(function (e) { return e.custom.flagged; }).sort(), [false, false, true]);
            assert.isTrue(h.rows('LuckyDrawCase').some(function (c) { return c.custom.caseType === 'SUSPICIOUS_VELOCITY'; }));
        });

        it('puts an entry that arrives after its window was drawn into the current window', function () {
            var created = Date.now() - 30 * HOUR;
            var past = campaignHelpers.getWindowAt(r, created);
            h.require('scripts/helpers/luckyDrawDrawHelpers').scheduleDraws(r, Date.now());
            h.get('LuckyDrawExecution', 'daily-draw_' + past.key).custom.status = 'FINALIZED';
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'LATE', createdMs: created }), Date.now());
            assert.equal(h.rows('LuckyDrawEntry')[0].custom.windowKey, campaignHelpers.getWindowAt(r, Date.now()).key);
        });
    });

    describe('free alternative method of entry', function () {
        var input = { acceptTerms: 'true', termsVersion: 'v1', ageConfirmed: 'true', region: 'ny' };

        it('needs the current rules accepted, the age confirmed and an eligible state', function () {
            var me = h.customer('C9');
            assert.equal(entries.createFreeEntry('daily-draw', me, Object.assign({}, input, { termsVersion: 'v0' })).fields.acceptTerms, 'required');
            assert.equal(entries.createFreeEntry('daily-draw', me, Object.assign({}, input, { ageConfirmed: 'false' })).fields.ageConfirmed, 'required');
            assert.equal(entries.createFreeEntry('daily-draw', me, Object.assign({}, input, { region: 'RI' })).fields.reason, 'region');
            assert.equal(entries.createFreeEntry('daily-draw', { authenticated: false }, input).errorCode, 'unauthenticated');
            var view = entries.createFreeEntry('daily-draw', me, input).entryView;
            assert.equal(view.status, 'ACTIVE');
            assert.equal(view.sourceType, 'FREE');
            assert.equal(h.rows('LuckyDrawEntry')[0].custom.region, 'NY');
        });

        it('allows the configured number of free entries per local day', function () {
            var me = h.customer('C9');
            assert.isFalse(entries.createFreeEntry('daily-draw', me, input).error);
            var second = entries.createFreeEntry('daily-draw', me, input);
            assert.equal(second.errorCode, 'limit-reached');
            assert.equal(second.fields.limit, 'free-entries-per-day');
            assert.lengthOf(h.rows('LuckyDrawEntry'), 1, 'the refused entry rolled back');
        });

        it('records a mail-in entry once per reference', function () {
            var id = entries.recordMailInEntry('daily-draw', { customerNo: 'C7', reference: 'ENV-2026-0001', region: 'TX' }, fixtures.ADMIN).entryId;
            assert.equal(h.get('LuckyDrawEntry', id).custom.sourceType, 'MAIL_IN');
            assert.equal(entries.recordMailInEntry('daily-draw', { customerNo: 'C7', reference: 'ENV-2026-0001', region: 'TX' }, fixtures.ADMIN).errorCode, 'conflict');
            assert.equal(entries.recordMailInEntry('daily-draw', { customerNo: 'C7', reference: '!', region: 'TX' }, fixtures.ADMIN).fields.reference, 'invalid');
        });

        it('is closed while the campaign is paused', function () {
            campaignHelpers.changeCampaignStatus('daily-draw', 'pause', 'Pausing for review', fixtures.ADMIN);
            assert.equal(entries.createFreeEntry('daily-draw', h.customer('C9'), input).errorCode, 'not-eligible');
        });
    });

    describe('cancellations', function () {
        it('reconciliation cancels entries of cancelled orders and activates entries after the hold', function () {
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'KEEP' }), Date.now());
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'GONE', customerNo: 'C2' }), Date.now());
            h.state.orders.GONE.status.value = 6;
            var counts = entries.reconcileEntries(100);
            assert.deepEqual(counts, { checked: 2, activated: 1, cancelled: 1 });
            assert.equal(entries.getParticipant('daily-draw', 'C2').custom.entryCount, 0);
        });

        it('applies refunds and chargebacks from the order management system', function () {
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'R1' }), Date.now());
            assert.deepEqual(entries.applyOrderEvent('R1', 'REFUNDED', { type: 'INTEGRATION', ref: 'oms' }), { cancelled: 1, disqualified: 0 });
            assert.equal(h.rows('LuckyDrawEntry')[0].custom.reason, 'order-refunded');
        });

        it('lets a customer leave the campaign: open entries end and no new ones arrive', function () {
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'A' }), Date.now());
            assert.equal(entries.optOut('daily-draw', h.customer('C1')).cancelledEntries, 1);
            assert.equal(entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'B' }), Date.now()), 'opted-out');
            assert.equal(entries.createFreeEntry('daily-draw', h.customer('C1'), { acceptTerms: 'true', termsVersion: 'v1', ageConfirmed: 'true', region: 'NY' }).errorCode, 'forbidden');
        });

        it('shows customers only their own entries', function () {
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'A', customerNo: 'C1' }), Date.now());
            entries.createEntryFromOrder(r, fixtures.order(h, { orderNo: 'B', customerNo: 'C2' }), Date.now());
            var mine = entries.getCustomerEntries('C1', 'daily-draw', 0, 10);
            assert.equal(mine.total, 1);
            assert.equal(mine.items[0].orderNo, 'A');
        });
    });
});
