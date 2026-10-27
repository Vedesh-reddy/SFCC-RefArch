'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var harness = require('./harness');

var repo = path.resolve(__dirname, '../../..');
var cartridge = path.join(repo, 'cartridges/plugin_wallet');
var bm = path.join(repo, 'cartridges/bm_wallet');
var resources = path.join(cartridge, 'cartridge/templates/resources/wallet.properties');

/**
 * @param {string} dir - directory
 * @param {RegExp} pattern - file name filter
 * @returns {string[]} files below dir
 */
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

/**
 * @param {string} file - properties file
 * @returns {Object} keys
 */
function properties(file) {
    var keys = {};
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
        var match = /^([^#=\s][^=]*)=/.exec(line);
        if (match) keys[match[1].trim()] = true;
    });
    return keys;
}

describe('plugin_wallet integrity', function () {
    it('defines every literal "wallet" resource key used in templates and scripts', function () {
        var keys = properties(resources);
        var missing = [];
        walk(cartridge, /\.(isml|js)$/).concat(walk(bm, /\.(isml|js)$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/Resource\.msgf?\(\s*'([^']+)'\s*,\s*'wallet'/g, function (m, key) {
                if (!keys[key]) missing.push(path.relative(repo, file) + ': ' + key);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('defines keys for every dynamic key prefix with a known value set', function () {
        var keys = properties(resources);
        var h = harness();
        var flows = {};
        fs.readdirSync(path.join(cartridge, 'cartridge/scripts/helpers')).forEach(function (name) {
            fs.readFileSync(path.join(cartridge, 'cartridge/scripts/helpers', name), 'utf8').replace(/var ([A-Z]+)_FLOW = \{([\s\S]*?)\n\};/g, function (m, flow, body) {
                flows[flow] = [];
                body.replace(/^\s+([A-Z_]+):/gm, function (k, status) { flows[flow].push(status); return k; });
                return m;
            });
        });
        assert.includeMembers(Object.keys(flows), ['WALLET', 'MEMBER', 'TOPUP', 'HOLD', 'APPROVAL', 'CASE']);
        var expected = flows.WALLET.map(function (s) { return 'status.' + s; })
            .concat(flows.MEMBER.map(function (s) { return 'member.' + s; }))
            .concat(flows.TOPUP.map(function (s) { return 'topup.' + s; }))
            .concat(Object.keys(h.require('scripts/helpers/walletAccountHelpers').TRANSACTION_TYPES).map(function (t) { return 'tx.' + t; }))
            .concat(['credited', 'pending', 'failed', 'expired', 'reversed'].map(function (s) { return 'flash.topup-' + s; }))
            .concat(['revoke', 'freeze', 'activate'].map(function (a) { return 'flash.member-' + a; }));
        assert.deepEqual(expected.filter(function (k) { return !keys[k]; }), []);
    });

    it('defines a message for every error code the helpers return', function () {
        var keys = properties(resources);
        var codes = { general: true };
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:errorResult|abort)\('([a-z-]+)'/g, function (m, code) { codes[code] = true; return m; });
        });
        assert.deepEqual(Object.keys(codes).filter(function (c) { return !keys['error.' + c]; }), []);
    });

    it('has a subject and body for every notification type that the code sends', function () {
        var keys = properties(resources);
        var types = {};
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            text.replace(/\bnotify\(/g, function (m, offset) {
                // The type is the second argument: a literal, or a ternary of literals.
                var args = [];
                var depth = 0;
                var current = '';
                for (var i = offset + m.length; i < text.length && depth >= 0 && args.length < 2; i++) {
                    var ch = text.charAt(i);
                    if ('([{'.indexOf(ch) >= 0) depth += 1;
                    if (')]}'.indexOf(ch) >= 0) depth -= 1;
                    if ((ch === ',' && depth === 0) || depth < 0) {
                        args.push(current);
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                (args[1] || '').replace(/(===\s*)?'([A-Z][A-Z_]+)'/g, function (q, compared, type) {
                    if (!compared) types[type] = true;
                    return q;
                });
                return m;
            });
        });
        assert.isAbove(Object.keys(types).length, 15);
        var missing = Object.keys(types).filter(function (t) { return !keys['notification.' + t + '.subject'] || !keys['notification.' + t + '.body']; });
        assert.deepEqual(missing, []);
    });

    it('wires every job step to an exported function and every job to a declared step type', function () {
        var steptypes = JSON.parse(fs.readFileSync(path.join(cartridge, 'steptypes.json'), 'utf8'))['step-types']['script-module-step'];
        var jobs = harness().require('scripts/jobs/wallet');
        steptypes.forEach(function (s) {
            assert.equal(s.module, 'plugin_wallet/cartridge/scripts/jobs/wallet.js');
            assert.isFunction(jobs[s.function], s['@type-id']);
            assert.equal(s.transactional, 'false');
        });
        var declared = steptypes.map(function (s) { return s['@type-id']; });
        var jobsXml = fs.readFileSync(path.join(repo, 'metadata/plugin_wallet/jobs.xml'), 'utf8');
        var used = [];
        jobsXml.replace(/type="(custom\.[^"]+)"/g, function (m, t) { used.push(t); return m; });
        assert.sameMembers(used, declared);
        assert.notMatch(jobsXml, /run-recurring enabled="true"/, 'schedules ship disabled');
    });

    it('maps every Custom API endpoint to a public function', function () {
        var h = harness();
        ['wallet', 'wallet-admin'].forEach(function (api) {
            var mapping = JSON.parse(fs.readFileSync(path.join(cartridge, 'cartridge/rest-apis', api, 'api.json'), 'utf8'));
            var script = h.require('rest-apis/' + api + '/script');
            var schema = fs.readFileSync(path.join(cartridge, 'cartridge/rest-apis', api, 'schema.yaml'), 'utf8');
            mapping.endpoints.forEach(function (e) {
                assert.isFunction(script[e.endpoint], api + ' ' + e.endpoint);
                assert.isTrue(script[e.endpoint].public, e.endpoint + ' is public');
                assert.include(schema, 'operationId: ' + e.endpoint);
            });
            assert.notInclude(schema, 'additionalProperties');
        });
    });

    it('registers every Business Manager node under exactly one menu action, and exports it', function () {
        var xml = fs.readFileSync(path.join(bm, 'cartridge/bm_extensions.xml'), 'latin1');
        var nodes = [];
        xml.replace(/<pipeline name="WalletAdmin-([A-Za-z]+)"\/>/g, function (m, n) { nodes.push(n); return m; });
        var unique = nodes.filter(function (n, i) { return nodes.indexOf(n) === i; });
        assert.equal(unique.length, nodes.length, 'a node is registered under two menu actions');
        var source = fs.readFileSync(path.join(bm, 'cartridge/controllers/WalletAdmin.js'), 'utf8');
        var exported = [];
        source.replace(/exports\.([A-Za-z]+)\.public = true;/g, function (m, n) { exported.push(n); return m; });
        assert.sameMembers(exported, nodes);
        assert.notInclude(xml, 'NoPermissionCheck');
    });

    it('defines a site preference for every preference the code reads', function () {
        var xml = fs.readFileSync(path.join(repo, 'metadata/plugin_wallet/meta/system-objecttype-extensions.xml'), 'utf8').split('type-id="SitePreferences"')[1];
        var missing = [];
        walk(cartridge, /\.(js|isml)$/).concat(walk(bm, /\.(js|isml)$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:getCustomPreferenceValue|getPreference|getEnumPreference|getListPreference)\('([A-Za-z]+)'\)/g, function (m, id) {
                if (xml.indexOf('attribute-id="' + id + '"') < 0) missing.push(path.relative(repo, file) + ': ' + id);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('keeps the base SFRA layout: no plugin framework modules', function () {
        assert.isFalse(fs.existsSync(path.join(cartridge, 'cartridge/scripts/wallet')));
        var stale = walk(cartridge, /\.(js|isml)$/).concat(walk(bm, /\.(js|isml)$/)).filter(function (file) {
            return /scripts\/wallet\//.test(fs.readFileSync(file, 'utf8'));
        });
        assert.deepEqual(stale, []);
    });

    it('labels the sandbox gateway as not for live money', function () {
        var keys = fs.readFileSync(resources, 'utf8');
        assert.match(keys, /Not for Live Money/);
        var sandbox = fs.readFileSync(path.join(cartridge, 'cartridge/templates/default/wallet/sandbox-pay.isml'), 'utf8');
        assert.include(sandbox, 'sandbox.banner');
    });

    it('follows the repository conventions: categorized kebab-case loggers, no Grid, no Math.random, kebab-case classes', function () {
        var problems = [];
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            var rel = path.relative(repo, file);
            if (/Math\.random/.test(text)) problems.push(rel + ': Math.random');
            text.replace(/Logger\.getLogger\(([^)]*)\)/g, function (m, args) {
                if (!/^'[a-z0-9-]+',\s*'[a-z0-9-]+'$/.test(args.trim())) problems.push(rel + ': logger ' + args);
                return m;
            });
            if (/Logger\.(info|warn|error|debug)\(/.test(text)) problems.push(rel + ': uncategorized logging');
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
            var text = fs.readFileSync(file, 'utf8');
            text.replace(/class="([^"$]*)"/g, function (m, classes) {
                classes.split(/\s+/).filter(Boolean).forEach(function (cls) {
                    if (/[A-Z]|_/.test(cls) && !/^(col|row|table_)/.test(cls)) problems.push(path.relative(repo, file) + ': class ' + cls);
                });
                return m;
            });
            if (/style="[^"]*grid/.test(text)) problems.push(file + ': grid');
        });
        assert.deepEqual(problems, []);
    });

    it('keeps the base cartridges untouched', function () {
        // only meaningful where the SFRA base cartridges live in the same repository (SFCC-RefArch)
        if (!require('fs').existsSync(require('path').join(repo, 'cartridges/app_storefront_base'))) this.skip();
        var changed = require('child_process').execFileSync('git', ['status', '--porcelain', '--', 'cartridges/app_storefront_base', 'cartridges/bm_app_storefront_base', 'cartridges/modules'], { cwd: repo }).toString().trim();
        assert.equal(changed, '');
    });
});
