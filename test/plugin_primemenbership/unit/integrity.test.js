'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var harness = require('../fixtures/harness');

var repo = harness.repo;
var cartridge = path.join(repo, 'cartridges/plugin_primemenbership');
var bm = path.join(repo, 'cartridges/bm_primemenbership');
var resources = path.join(cartridge, 'cartridge/templates/resources/primemembership.properties');
var extensions = path.join(repo, 'metadata/plugin_primemenbership/meta/system-objecttype-extensions.xml');

function walk(dir, pattern) {
    var out = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        var full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'static') out = out.concat(walk(full, pattern));
        } else if (pattern.test(entry.name)) {
            out.push(full);
        }
    });
    return out;
}

function properties(file) {
    var keys = {};
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
        var match = /^([^#=\s][^=]*)=/.exec(line);
        if (match) keys[match[1].trim()] = true;
    });
    return keys;
}

describe('plugin_primemenbership integrity', function () {
    var keys = properties(resources);

    it('defines every literal resource key used in templates and scripts', function () {
        var missing = [];
        walk(cartridge, /\.(isml|js)$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/Resource\.msgf?\(\s*'([^']+)'\s*,\s*'primemembership'/g, function (m, key) {
                if (!keys[key]) missing.push(path.relative(repo, file) + ': ' + key);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('defines keys for every dynamic key with a known value set', function () {
        var h = harness();
        var planHelpers = h.require('scripts/helpers/membershipPlanHelpers');
        var subscription = h.require('scripts/helpers/membershipSubscriptionHelpers');
        var payment = h.require('scripts/helpers/membershipPaymentHelpers');
        var expected = Object.keys(subscription.TRANSITIONS).map(function (s) { return 'status.' + s; })
            .concat(Object.keys(payment.FLOW).map(function (s) { return 'transaction.status.' + s; }))
            .concat(['PURCHASE', 'UPGRADE', 'RENEWAL', 'REFUND'].map(function (s) { return 'transaction.type.' + s; }))
            .concat(['PURCHASE', 'UPGRADE', 'RENEWAL'].map(function (s) { return 'review.heading.' + s; }))
            .concat(Object.keys(planHelpers.BENEFITS).map(function (s) { return 'benefit.' + s; }))
            .concat(['ACTIVE', 'INTEGRATION_REQUIRED', 'SETUP_REQUIRED'].map(function (s) { return 'benefit.status.' + s; }))
            .concat(['COMPLETED', 'AWAITING_PAYMENT', 'PROCESSING', 'REVIEW', 'FAILED'].map(function (s) { return 'confirmation.heading.' + s; }))
            .concat(['members-only', 'early-access', 'not-launched'].map(function (s) { return 'access.' + s; }))
            .concat(['exclusive', 'early-access', 'launch'].map(function (s) { return 'label.' + s; }))
            .concat(['member-discount', 'exclusive-deals', 'free-shipping'].map(function (s) { return 'adjustment.' + s; }))
            .concat(['saved', 'cancelled', 'reactivated'].map(function (s) { return 'flash.' + s; }))
            .concat(['join', 'upgrade'].map(function (s) { return 'action.' + s; }));
        assert.deepEqual(expected.filter(function (k) { return !keys[k]; }), []);
    });

    it('defines a message for every error code the code returns', function () {
        var codes = {};
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:errorResult|abort)\('([a-z-]+)'/g, function (m, code) { codes[code] = true; return m; });
        });
        assert.isAbove(Object.keys(codes).length, 20);
        var known = ['fee-product-in-catalog', 'cap-exceeded', 'order-not-placed'];
        assert.deepEqual(Object.keys(codes).filter(function (c) { return !keys['error.' + c] && known.indexOf(c) < 0; }), []);
    });

    it('has a subject and body for every notification type the code sends, including all required ones', function () {
        var types = { ACTIVATED: 1, UPGRADED: 1, RENEWED: 1, EXPIRING: 1, EXPIRED: 1, PAYMENT_FAILED: 1, CANCELLED: 1, BIRTHDAY_REWARD: 1, MONTHLY_VOUCHER: 1, MEMBERSHIP_CHANGED: 1 };
        walk(cartridge, /\.js$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/notify\([^,]+,\s*'([A-Z_]+)'/g, function (m, type) { types[type] = 1; return m; });
        });
        assert.deepEqual(Object.keys(types).filter(function (t) { return !keys['notification.' + t + '.subject'] || !keys['notification.' + t + '.body']; }), []);
    });

    it('wires every job step to an exported function and every job to a declared step type', function () {
        var steptypes = JSON.parse(fs.readFileSync(path.join(cartridge, 'steptypes.json'), 'utf8'))['step-types']['script-module-step'];
        var jobs = harness().require('scripts/jobs/membership');
        steptypes.forEach(function (s) {
            assert.equal(s.module, 'plugin_primemenbership/cartridge/scripts/jobs/membership.js');
            assert.isFunction(jobs[s.function], s['@type-id']);
            assert.equal(s.transactional, 'false');
        });
        var jobsXml = fs.readFileSync(path.join(repo, 'metadata/plugin_primemenbership/jobs.xml'), 'utf8');
        var used = [];
        jobsXml.replace(/type="(custom\.[^"]+)"/g, function (m, t) { used.push(t); return m; });
        assert.sameMembers(used, steptypes.map(function (s) { return s['@type-id']; }));
        assert.notMatch(jobsXml, /run-recurring enabled="true"/, 'schedules ship disabled');
        ['MembershipExpirationJob', 'MembershipRenewalJob', 'MembershipBenefitResetJob', 'MembershipBirthdayRewardJob', 'MembershipReconciliationJob', 'MembershipReportingJob'].forEach(function (job) {
            assert.include(jobsXml, 'job-id="' + job + '"');
        });
    });

    it('maps every Custom API endpoint to a public function with a schema operation', function () {
        var h = harness();
        ['prime-membership', 'prime-membership-admin'].forEach(function (api) {
            var mapping = JSON.parse(fs.readFileSync(path.join(cartridge, 'cartridge/rest-apis', api, 'api.json'), 'utf8'));
            var script = h.require('rest-apis/' + api + '/script');
            var schema = fs.readFileSync(path.join(cartridge, 'cartridge/rest-apis', api, 'schema.yaml'), 'utf8');
            mapping.endpoints.forEach(function (e) {
                assert.isFunction(script[e.endpoint], api + ' ' + e.endpoint);
                assert.isTrue(script[e.endpoint].public, e.endpoint + ' is public');
                assert.include(schema, 'operationId: ' + e.endpoint);
            });
        });
    });

    it('registers every Business Manager node under exactly one menu action, and exports it', function () {
        var xml = fs.readFileSync(path.join(bm, 'cartridge/bm_extensions.xml'), 'latin1');
        var nodes = [];
        xml.replace(/<pipeline name="PrimeMembershipAdmin-([A-Za-z]+)"\/>/g, function (m, n) { nodes.push(n); return m; });
        assert.equal(nodes.filter(function (n, i) { return nodes.indexOf(n) === i; }).length, nodes.length, 'a node is registered twice');
        var source = fs.readFileSync(path.join(bm, 'cartridge/controllers/PrimeMembershipAdmin.js'), 'utf8');
        var exported = [];
        source.replace(/exports\.([A-Za-z]+)\.public = true;/g, function (m, n) { exported.push(n); return m; });
        assert.sameMembers(exported, nodes);
        assert.notInclude(xml, 'NoPermissionCheck');
    });

    it('defines a site preference for every preference the code reads', function () {
        var xml = fs.readFileSync(extensions, 'utf8').split('type-id="SitePreferences"')[1];
        var missing = [];
        walk(cartridge, /\.(js|isml)$/).concat(walk(bm, /\.(js|isml)$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:getCustomPreferenceValue|getPreference|getListPreference)\('([A-Za-z]+)'\)/g, function (m, id) {
                if (xml.indexOf('attribute-id="' + id + '"') < 0) missing.push(path.relative(repo, file) + ': ' + id);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('defines the custom attributes the code writes on orders, baskets and products', function () {
        var xml = fs.readFileSync(extensions, 'utf8');
        var missing = {};
        walk(cartridge, /\.js$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:order|basket|product|ctnr)\.custom\.(primeMembership\w+)/g, function (m, id) {
                if (xml.indexOf('attribute-id="' + id + '"') < 0) missing[id] = true;
                return m;
            });
        });
        assert.deepEqual(Object.keys(missing), []);
    });

    it('holds no price, percentage or shipping method in the code', function () {
        var problems = [];
        walk(path.join(cartridge, 'cartridge/scripts'), /\.js$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            if (/\b(100000|250000|500000)\b/.test(text)) problems.push(file + ': plan price');
            if (/[^.\w]percent\s*[:=]\s*[1-9]/.test(text)) problems.push(file + ': discount');
        });
        assert.deepEqual(problems, []);
    });

    it('follows the repository conventions: categorized kebab-case loggers, no Grid, kebab-case classes', function () {
        var problems = [];
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            var rel = path.relative(repo, file);
            text.replace(/Logger\.getLogger\(([^)]*)\)/g, function (m, args) {
                if (!/^'[a-z0-9-]+',\s*'[a-z0-9-]+'$/.test(args.trim())) problems.push(rel + ': logger ' + args);
                return m;
            });
            if (/Logger\.(info|warn|error|debug)\(/.test(text)) problems.push(rel + ': uncategorized logging');
            if (/console\./.test(text)) problems.push(rel + ': console');
        });
        walk(cartridge, /\.scss$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            if (/display:\s*grid|grid-template/.test(text)) problems.push(file + ': grid');
            text.replace(/\.([A-Za-z][\w-]*)/g, function (m, cls) {
                if (/[A-Z_]/.test(cls)) problems.push(file + ': class ' + cls);
                return m;
            });
        });
        walk(path.join(cartridge, 'cartridge/templates/default'), /\.isml$/).concat(walk(path.join(bm, 'cartridge/templates/default'), /\.isml$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/class="([^"$]*)"/g, function (m, classes) {
                classes.split(/\s+/).filter(Boolean).forEach(function (cls) {
                    if (/[A-Z]|_/.test(cls) && !/^(col|row|table_)/.test(cls)) problems.push(path.relative(repo, file) + ': class ' + cls);
                });
                return m;
            });
        });
        assert.deepEqual(problems, []);
    });

    it('keeps ISML expressions free of braces and function literals', function () {
        var problems = [];
        walk(path.join(cartridge, 'cartridge/templates/default'), /\.isml$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/\$\{([^}]*)\}/g, function (m, body) {
                if (/\{|function/.test(body)) problems.push(path.relative(repo, file) + ': ' + body.slice(0, 60));
                return m;
            });
        });
        assert.deepEqual(problems, []);
    });

    it('protects every state-changing storefront route with HTTPS, login and CSRF', function () {
        var source = fs.readFileSync(path.join(cartridge, 'cartridge/controllers/PrimeMembership.js'), 'utf8');
        var posts = source.match(/server\.post\('[A-Za-z]+',[^\n]*/g);
        assert.isAbove(posts.length, 5);
        posts.forEach(function (line) {
            assert.include(line, 'server.middleware.https', line);
            assert.include(line, 'requireLogin', line);
            assert.include(line, 'csrfProtection.validateRequest', line);
        });
    });

    it('never reads payment results or amounts from the request', function () {
        var source = fs.readFileSync(path.join(cartridge, 'cartridge/controllers/PrimeMembership.js'), 'utf8');
        assert.notMatch(source, /req\.form\.(amount|price|total|status|paid)/);
        assert.notMatch(source, /querystring\.(amount|price|total|status|paid)/);
    });

    it('declares the login redirect slot on the path of the other plugins', function () {
        var h = harness();
        var endpoints = h.require('config/oAuthRenentryRedirectEndpoints');
        assert.equal(endpoints[10], 'PrimeMembership-Dashboard');
        assert.equal(endpoints[9], 'LuckyDraw-Show', 'keeps the slots of other plugins');
    });

    it('keeps the base cartridges untouched', function () {
        if (!fs.existsSync(path.join(repo, 'cartridges/app_storefront_base'))) this.skip();
        var changed = require('child_process').execFileSync('git', ['status', '--porcelain', '--', 'cartridges/app_storefront_base', 'cartridges/bm_app_storefront_base', 'cartridges/modules'], { cwd: repo }).toString().trim();
        assert.equal(changed, '');
    });
});
