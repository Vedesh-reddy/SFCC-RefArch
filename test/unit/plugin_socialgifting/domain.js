'use strict';

var assert = require('assert');
var harness = require('./harness');
var fs = require('fs');
var path = require('path');
describe('Social gifting domain and privacy', function () {
    var h; var owner; var guest; var registry; var key; var item; var input;
    beforeEach(function () {
        h = harness(); owner = h.actor('owner'); guest = h.actor(null);
        input = { name: 'Our celebration', description: 'Welcome', partnerName: 'Partner', slug: 'our-celebration', eventType: 'WEDDING',
            eventAt: '2026-12-12T18:00:00+05:30', visibility: 'PUBLIC', status: 'ACTIVE', showOwnerNames: true, showEventDate: true,
            showComments: true, showPolls: true, showPurchasedItems: true, allowGuestVoting: true, allowGroupGifting: true, allowAnonymousGifts: true };
        registry = h.load('scripts/helpers/registryHelper'); key = registry.save(owner, input);
        h.product('variant-14'); h.product('master', true);
        item = h.load('scripts/helpers/registryItemHelper').add(owner, { registryKey: key, pid: 'variant-14', quantity: '1', allowGroupGifting: true });
    });
    function raises(fn, code) { assert.throws(fn, function (error) { return error.code === code; }); }
    function group() { return h.load('scripts/helpers/groupGiftHelper').create(owner, { registryKey: key, itemKey: item }); }
    function contribute(gift, amount) { return h.load('scripts/helpers/contributionHelper').create(guest, { giftKey: gift, amount: amount, anonymous: true }); }
    function pending(id) { var c = h.load('scripts/helpers/contributionHelper').get(id); c.custom.status = 'PENDING'; return c; }
    it('creates a native gift registry with UTC event time and private native visibility', function () {
        assert.equal(registry.list(registry.get(key)).public, false);
        assert.equal(registry.get(key).custom.eventAt.toISOString(), '2026-12-12T12:30:00.000Z');
        assert.equal(key.length, 64);
    });
    it('rejects unauthorized edits', function () { raises(function () { registry.save(h.actor('other'), Object.assign({}, input, { registryKey: key })); }, 'NOT_FOUND'); });
    it('requires authentication for creation', function () { raises(function () { registry.save(guest, input); }, 'LOGIN_REQUIRED'); });
    it('stores exact variants and rejects masters', function () {
        assert.equal(h.load('scripts/helpers/registryItemHelper').resolve(registry.get(key), item).item.productID, 'variant-14');
        raises(function () { h.load('scripts/helpers/registryItemHelper').add(owner, { registryKey: key, pid: 'master', quantity: '1' }); }, 'EXACT_PRODUCT_REQUIRED');
    });
    it('rejects malformed quantities and clamps remaining', function () {
        var v = h.load('scripts/util/validation');
        ['1e3', '-1', '1.5', 'Infinity', ''].forEach(function (value) { raises(function () { v.integer(value, 1, 1000); }, 'INVALID_QUANTITY'); });
        assert.equal(v.remaining(1, 2, 3), 0);
    });
    it('requires explicit timezone in dates', function () { raises(function () { h.load('scripts/util/validation').date('2026-12-12'); }, 'INVALID_DATE'); });
    it('rejects forged registry IDs', function () { raises(function () { registry.get('forged'); }, 'NOT_FOUND'); });
    it('rejects items belonging to another registry', function () {
        var other = registry.save(owner, Object.assign({}, input, { slug: 'second' }));
        raises(function () { h.load('scripts/helpers/registryItemHelper').resolve(registry.get(other), item); }, 'NOT_FOUND');
    });
    it('rotates hashed share capabilities and rejects old ones', function () {
        var record = registry.get(key); record.custom.visibility = 'LINK_ONLY';
        var token = h.load('scripts/util/token'); var raw = registry.share(owner, key);
        guest.shareHash = token.hash(raw); var permission = h.load('scripts/helpers/registryPermissionHelper');
        assert(permission.canView(record, guest)); registry.share(owner, key); assert(!permission.canView(record, guest));
    });
    it('archives privately while preserving owner read access', function () {
        registry.archive(owner, key); var permission = h.load('scripts/helpers/registryPermissionHelper');
        assert(!permission.canView(registry.get(key), guest)); assert(permission.canView(registry.get(key), owner));
    });
    it('accepts a matching, unexpired invitation once', function () {
        var invited = h.actor('invited'); var token = h.load('scripts/util/token'); var digest = token.hash(token.random());
        h.load('scripts/helpers/store').create('RegistryInvitation', digest, { registryKey: key, invitedEmail: 'invited@example.test', role: 'EDITOR', status: 'PENDING', expiresAt: new Date(Date.now() + 60000) });
        var invitations = h.load('scripts/helpers/invitationHelper'); assert.equal(invitations.accept(invited, digest), key);
        raises(function () { invitations.accept(invited, digest); }, 'INVALID_INVITATION');
        assert.equal(h.load('scripts/helpers/registryPermissionHelper').role(registry.get(key), invited), 'EDITOR');
    });
    it('rejects expired invitations and mismatched email', function () {
        var digest = 'a'.repeat(64); var record = h.load('scripts/helpers/store').create('RegistryInvitation', digest, { registryKey: key, invitedEmail: 'invited@example.test', role: 'EDITOR', status: 'PENDING', expiresAt: new Date(0) });
        var accept = h.load('scripts/helpers/invitationHelper').accept;
        raises(function () { accept(h.actor('invited'), digest); }, 'INVALID_INVITATION');
        record.custom.expiresAt = new Date(Date.now() + 60000); raises(function () { accept(h.actor('other'), digest); }, 'INVALID_INVITATION');
    });
    it('keeps comments as text and explicitly encodes them in templates', function () {
        var payload = '<img src=x onerror=alert(1)>';
        var id = h.load('scripts/helpers/registryCommentHelper').add(owner, { registryKey: key, itemKey: item, text: payload });
        assert.equal(h.load('scripts/helpers/store').get('RegistryComment', id).custom.text, payload);
        assert(fs.readFileSync(path.resolve(__dirname, '../../../cartridges/plugin_socialgifting/cartridge/templates/default/registry/registryItem.isml'), 'utf8').includes('value="${comment.text}" encoding="htmlcontent"'));
    });
    it('denies unauthorized comment deletion', function () {
        var comments = h.load('scripts/helpers/registryCommentHelper'); var id = comments.add(owner, { registryKey: key, itemKey: item, text: 'Hello' });
        raises(function () { comments.remove(h.actor('stranger'), { registryKey: key, commentKey: id }); }, 'NOT_FOUND');
    });
    function poll() {
        h.product('variant-15'); var second = h.load('scripts/helpers/registryItemHelper').add(owner, { registryKey: key, pid: 'variant-15', quantity: '1' });
        return h.load('scripts/helpers/pollHelper').create(owner, { registryKey: key, title: 'Choose', options: item + ',' + second, endAt: '2099-01-01T00:00:00Z', visibility: 'REGISTRY', allowGuest: true });
    }
    it('counts authenticated and guest votes server-side and rejects duplicates', function () {
        var id = poll(); var helper = h.load('scripts/helpers/pollHelper'); var data = { registryKey: key, pollKey: id, choices: item };
        helper.vote(owner, data); helper.vote(guest, data); raises(function () { helper.vote(guest, data); }, 'ALREADY_VOTED');
        assert.equal(JSON.parse(h.load('scripts/helpers/store').get('RegistryPoll', id).custom.counts)[0], 2);
    });
    it('rejects closed polls and forged choices', function () {
        var id = poll(); var helper = h.load('scripts/helpers/pollHelper');
        raises(function () { helper.vote(guest, { registryKey: key, pollKey: id, choices: 'fake' }); }, 'INVALID_OPTIONS');
        helper.close(owner, { registryKey: key, pollKey: id }); raises(function () { helper.vote(guest, { registryKey: key, pollKey: id, choices: item }); }, 'POLL_CLOSED');
    });
    it('reserves capacity and rejects a second purchase allocation', function () {
        var helper = h.load('scripts/helpers/reservationHelper'); var data = { registryKey: key, itemKey: item, quantity: '1' };
        helper.create(guest, data); raises(function () { helper.create(h.actor('other'), data); }, 'GIFT_ALREADY_PURCHASED');
    });
    it('expires reservations once without negative counters', function () {
        var helper = h.load('scripts/helpers/reservationHelper'); var result = helper.create(guest, { registryKey: key, itemKey: item, quantity: '1' });
        var record = h.load('scripts/helpers/store').get('RegistryReservation', result.reservationKey);
        h.load('scripts/helpers/store').transaction(function () { helper.release(record, 'EXPIRED'); helper.release(record, 'EXPIRED'); });
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.reserved, 0);
    });
    it('rejects cancellation by another actor', function () {
        var helper = h.load('scripts/helpers/reservationHelper'); var result = helper.create(guest, { registryKey: key, itemKey: item, quantity: '1' });
        raises(function () { helper.cancel(h.actor('other'), result); }, 'NOT_FOUND');
    });
    it('records anonymous purchases once across duplicate order callbacks', function () {
        var result = h.load('scripts/helpers/reservationHelper').create(guest, { registryKey: key, itemKey: item, quantity: '1' });
        var record = h.load('scripts/helpers/store').get('RegistryReservation', result.reservationKey); record.custom.status = 'ORDER_PENDING'; record.custom.orderNo = 'order-1';
        var line = { UUID: 'line-1', productID: 'variant-14', quantityValue: 1, custom: { sgRegistryKey: key, sgRegistryItemKey: item, sgReservationKey: result.reservationKey, sgAnonymousGift: true } };
        var order = { orderNo: 'order-1', status: { value: 0 }, custom: {}, productLineItems: { toArray: function () { return [line]; } } };
        var helper = h.load('scripts/helpers/purchaseHelper'); helper.record(order); helper.record(order);
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.purchased, 1);
        var entries = Object.values(h.db).filter(function (row) { return row.UUID.startsWith('SGRegistryPurchase:'); }); assert.equal(entries.length, 1); assert.equal(entries[0].custom.anonymous, true);
    });
    it('uses exact decimals and currency precision', function () {
        var money = h.load('scripts/util/money'); assert.equal(money.add('0.1', '0.2'), '0.3');
        ['1e3', '-5', '0', '1.001', 'NaN'].forEach(function (value) { raises(function () { money.amount(value, 'INR'); }, 'INVALID_AMOUNT'); });
        raises(function () { money.amount('1.1', 'JPY'); }, 'INVALID_AMOUNT'); assert.equal(money.amount('1.001', 'KWD'), '1.001');
    });
    it('does not count CREATED or PENDING contributions as collected', function () {
        var gift = group(); pending(contribute(gift, '100')); assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.paid, '0');
    });
    it('rejects attempted overfunding while another contribution is held', function () {
        var gift = group(); contribute(gift, '900'); contribute(gift, '100'); raises(function () { contribute(gift, '200'); }, 'FUNDING_CAPACITY');
        assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.held, '1000');
    });
    it('counts captured payment exactly once and reaches FUNDED', function () {
        var gift = group(); var id = contribute(gift, '1000'); pending(id); var helper = h.load('scripts/helpers/contributionHelper');
        var event = { amount: '1000', currency: 'INR', provider: 'sfcc', paymentID: 'order-1' };
        helper.capture(id, event); helper.capture(id, event);
        assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.paid, '1000'); assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.status, 'FUNDED');
    });
    it('rejects mismatched capture and payment reuse', function () {
        var gift = group(); var first = contribute(gift, '500'); var second = contribute(gift, '500'); pending(first); pending(second);
        var helper = h.load('scripts/helpers/contributionHelper');
        raises(function () { helper.capture(first, { amount: '600', currency: 'INR' }); }, 'PAYMENT_MISMATCH');
        var payment = { amount: '500', currency: 'INR', provider: 'sfcc', paymentID: 'same' }; helper.capture(first, payment);
        raises(function () { helper.capture(second, payment); }, 'PAYMENT_REUSED');
    });
    it('releases definitive failures only once', function () {
        var gift = group(); var id = contribute(gift, '500'); var helper = h.load('scripts/helpers/contributionHelper');
        h.load('scripts/helpers/store').transaction(function () { helper.fail(helper.get(id)); helper.fail(helper.get(id)); });
        assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.held, '0'); assert.equal(helper.get(id).custom.status, 'FAILED');
    });
    it('deduplicates partial and full refunds', function () {
        var gift = group(); var id = contribute(gift, '1000'); pending(id); var helper = h.load('scripts/helpers/contributionHelper');
        helper.capture(id, { amount: '1000', currency: 'INR', provider: 'sfcc', paymentID: 'order-1' });
        helper.refund(id, '400', 'refund-1'); helper.refund(id, '400', 'refund-1'); assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.paid, '600');
        helper.refund(id, '1000', 'refund-2'); assert.equal(helper.get(id).custom.status, 'REFUNDED'); assert.equal(h.load('scripts/helpers/groupGiftHelper').get(gift).custom.paid, '0');
    });
    it('rejects expired campaigns and holds a campaign unit against individual purchase', function () {
        var gift = group(); h.load('scripts/helpers/groupGiftHelper').get(gift).custom.expiresAt = new Date(0);
        raises(function () { contribute(gift, '100'); }, 'GROUP_GIFT_CLOSED');
        raises(function () { h.load('scripts/helpers/reservationHelper').create(guest, { registryKey: key, itemKey: item, quantity: '1' }); }, 'ITEM_UNAVAILABLE');
    });
    it('rejects stale concurrent revision claims at the unique constraint', function () {
        var store = h.load('scripts/helpers/store'); var live = store.get('RegistryItemState', item); var stale = { custom: Object.assign({}, live.custom) };
        store.transaction(function () { store.mutate('item:' + item, live); });
        assert.throws(function () { store.transaction(function () { store.mutate('item:' + item, stale); }); }, /UNIQUE_CONSTRAINT/);
    });
    it('hides purchased item details in secret mode', function () {
        registry.get(key).custom.secretGiftMode = true; registry.get(key).custom.revealAt = new Date('2099-01-01');
        var Model = h.load('models/registry'); var model = new Model(registry.get(key), owner, true);
        assert.equal(model.items[0].purchased, null); assert.equal(model.items[0].remaining, null); assert.equal(model.activity.length, 0);
    });
    it('omits donor identity, internal ownership and address from public models', function () {
        var Model = h.load('models/registry'); var serialized = JSON.stringify(new Model(registry.get(key), guest, true));
        ['ownerNo', 'customerNo', 'shippingAddress', 'shareHash', 'listID', 'invitedEmail'].forEach(function (field) { assert(!serialized.includes('"' + field + '"')); });
    });
    it('redacts every private address field and preserves normal addresses', function () {
        var Address = h.load('models/address', function (address) { this.address = address; });
        var privateAddress = { describe: function () { return { getCustomAttributeDefinition: function () { return {}; } }; }, custom: { sgPrivateDelivery: true }, address1: 'Secret street', postalCode: 'SECRET', phone: 'SECRET' };
        assert(!JSON.stringify(new Address(privateAddress)).includes('SECRET')); assert(!JSON.stringify(new Address(privateAddress)).includes('Secret street'));
        assert.equal(new Address({ address1: 'Buyer street' }).address.address1, 'Buyer street');
    });
    it('terminates failed CSRF before actor creation and domain mutation', function () {
        h.setCSRF(false); var called = false; var response;
        var res = { base: { setExpires: function () {} }, setHttpHeader: function () {}, setStatusCode: function (code) { this.status = code; }, json: function (body) { response = body; } };
        h.load('scripts/middleware/socialGifting').post('test', function () { called = true; })({}, res, function () {});
        assert.equal(called, false); assert.equal(res.status, 403); assert.equal(response.error.code, 'CSRF');
    });
    it('closes custom object iterators', function () { registry.dashboard(owner); assert(h.closed() > 0); });
    it('does not treat an authorized but unpaid order as a captured contribution', function () {
        var adapter = h.load('scripts/services/paymentAdapter'); assert.equal(adapter.captured({ paymentStatus: { value: 0 }, status: { value: 0 } }, {}), null);
    });
    it('copies registry line context explicitly before the basket becomes invalid', function () {
        var line = { productID: 'variant-14', quantityValue: 1, custom: { sgRegistryKey: key, sgRegistryItemKey: item, sgReservationKey: 'hold', sgAnonymousGift: true } };
        var basket = { custom: { sgRegistryKey: key }, productLineItems: Object.assign([line], { toArray: function () { return [line]; } }) };
        var order = { custom: {}, productLineItems: [{ productID: 'variant-14', quantityValue: 1, custom: {} }] };
        var attached = false;
        h.platform['../helpers/registryCheckoutHelper'] = { validate: function () {}, attach: function (value) { attached = value.productLineItems[0].custom.sgReservationKey === 'hold'; } };
        h.platform['../helpers/contributionCheckoutHelper'] = { validate: function () { return null; } };
        var helpers = h.load('scripts/checkout/checkoutHelpers', { createOrder: function () { basket.custom = null; return order; } });
        assert.strictEqual(helpers.createOrder(basket), order);
        assert(attached); assert.strictEqual(order.productLineItems[0].custom.sgAnonymousGift, true);
    });
    it('flags a second different payment for an already paid contribution', function () {
        var gift = group(); var id = contribute(gift, '1000'); pending(id); var helper = h.load('scripts/helpers/contributionHelper');
        helper.capture(id, { amount: '1000', currency: 'INR', provider: 'sfcc', paymentID: 'order-1' });
        raises(function () { helper.capture(id, { amount: '1000', currency: 'INR', provider: 'sfcc', paymentID: 'order-2' }); }, 'PAYMENT_RECONCILIATION_REQUIRED');
    });
    it('completes a funded gift only against an exact paid fulfillment order', function () {
        var gift = group(); var id = contribute(gift, '1000'); pending(id);
        h.load('scripts/helpers/contributionHelper').capture(id, { amount: '1000', currency: 'INR', provider: 'sfcc', paymentID: 'funding' });
        var order = { orderNo: 'fulfillment', custom: { sgGroupGiftKey: gift }, status: { value: 0 }, paymentStatus: { value: 2 }, currencyCode: 'INR',
            totalGrossPrice: { decimalValue: new h.Decimal('1000') }, productLineItems: { toArray: function () { return [{ UUID: 'f-line', productID: 'variant-14', quantityValue: 1 }]; } } };
        var helper = h.load('scripts/helpers/groupGiftHelper'); helper.complete(gift, order); helper.complete(gift, order);
        assert.equal(helper.get(gift).custom.status, 'COMPLETED');
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.purchased, 1);
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.reserved, 0);
        order.status.value = 6; var purchases = h.load('scripts/helpers/purchaseHelper'); purchases.cancel(order); purchases.cancel(order);
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.purchased, 0);
    });

    it('does not read an undefined custom attribute on a native customer address', function () {
        var Address = h.load('models/address', function (address) { this.address = { address1: address.address1 }; });
        var customerAddress = { address1: 'Buyer address', custom: new Proxy({}, { get: function () { throw new Error('Undefined native custom attribute'); } }),
            describe: function () { return { getCustomAttributeDefinition: function () { return null; } }; } };
        assert.equal(new Address(customerAddress).address.address1, 'Buyer address');
    });
    it('rejects nonexistent calendar days rather than silently normalizing them', function () {
        raises(function () { h.load('scripts/util/validation').date('2026-02-30T12:00:00Z'); }, 'INVALID_DATE');
    });

    it('deduplicates lifecycle reminders and expires reservations in the scheduled job', function () {
        registry.get(key).custom.eventAt = new Date(Date.now() + 86400000);
        var reserved = h.load('scripts/helpers/reservationHelper').create(guest, { registryKey: key, itemKey: item, quantity: '1' });
        h.load('scripts/helpers/store').get('RegistryReservation', reserved.reservationKey).custom.expiresAt = new Date(0);
        var job = h.load('scripts/jobs/registryLifecycle');
        assert.equal(job.execute().status, 0); assert.equal(job.execute().status, 0);
        var notices = Object.values(h.db).filter(function (row) { return row.UUID.startsWith('SGNotification:'); });
        assert.equal(notices.length, 2);
        assert.equal(h.load('scripts/helpers/store').get('RegistryItemState', item).custom.reserved, 0);
    });
    it('retains live aggregate revision claims when cleaning expiring abuse records', function () {
        var store = h.load('scripts/helpers/store');
        store.create('Mutation', 'live-claim', { scope: 'gift:live', expiresAt: null });
        store.create('Mutation', 'old-abuse', { scope: 'abuse:expired', expiresAt: new Date(0) });
        h.load('scripts/jobs/registryLifecycle').execute();
        assert(store.get('Mutation', 'live-claim')); assert.equal(store.get('Mutation', 'old-abuse'), null);
    });

});
