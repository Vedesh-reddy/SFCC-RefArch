'use strict';

// Opt-in sandbox test. Fixture contains two independent cookie/CSRF sessions, never real card data.
var assert = require('assert');
var fs = require('fs');
var fixture = process.env.SG_SANDBOX_FIXTURE;
var suite = fixture ? describe : describe.skip;
suite('Social gifting sandbox concurrency', function () {
    this.timeout(30000);
    var config;
    before(function () {
        config = JSON.parse(fs.readFileSync(fixture, 'utf8'));
        assert.strictEqual(config.sandbox, true, 'Use an isolated sandbox fixture');
        assert(new URL(config.baseURL).protocol === 'https:');
        assert(config.sessions.length >= 2);
        assert.notStrictEqual(config.sessions[0].cookie, config.sessions[1].cookie);
    });
    async function post(route, session, values) {
        var body = new URLSearchParams(Object.assign({}, values, { csrf_token: session.csrf }));
        var response = await fetch(config.baseURL + route, {
            method: 'POST', redirect: 'manual', headers: { Cookie: session.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
        });
        assert([200, 400, 403, 404, 409, 429, 503].includes(response.status), 'Unexpected transport status');
        return response.json();
    }
    it('admits exactly one simultaneous reservation for the last desired unit', async function () {
        assert(config.registryKey && config.singleUnitItemKey);
        var results = await Promise.all(config.sessions.slice(0, 2).map(function (session) {
            return post('RegistryReservation-Create', session, { registryKey: config.registryKey, itemKey: config.singleUnitItemKey, quantity: '1' });
        }));
        try { assert.equal(results.filter(function (result) { return result.success; }).length, 1); }
        finally {
            await Promise.all(results.map(function (result, index) {
                return result.success ? post('RegistryReservation-Cancel', config.sessions[index], result.data) : Promise.resolve();
            }));
        }
    });
    it('admits 100 but rejects 200 when campaign remaining capacity is 100', async function () {
        assert(config.giftWith100Remaining);
        var results = await Promise.all(['100', '200'].map(function (amount, index) {
            return post('GroupGift-Contribute', config.sessions[index], { registryKey: config.registryKey, giftKey: config.giftWith100Remaining, amount: amount });
        }));
        try { assert.strictEqual(results[0].success, true); assert.strictEqual(results[1].success, false); }
        finally {
            await Promise.all(results.map(function (result, index) {
                return result.success ? post('RegistryCheckout-Cancel', config.sessions[index], {}) : Promise.resolve();
            }));
        }
    });
    it('rejects a browser mutation without CSRF', async function () {
        var result = await post('RegistryReservation-Create', { cookie: config.sessions[0].cookie, csrf: '' }, { registryKey: config.registryKey, itemKey: config.singleUnitItemKey, quantity: '1' });
        assert.strictEqual(result.success, false); assert.equal(result.error.code, 'CSRF');
    });
});
