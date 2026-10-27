'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var harness = require('./harness');

var repo = path.resolve(__dirname, '../../..');
var cartridge = path.join(repo, 'cartridges/plugin_seller');
var bm = path.join(repo, 'cartridges/bm_seller');

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

describe('plugin_seller integrity', function () {
    it('defines every literal "seller" resource key used in templates and scripts', function () {
        var keys = properties(path.join(cartridge, 'cartridge/templates/resources/seller.properties'));
        var missing = [];
        walk(cartridge, /\.(isml|js)$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            var re = /Resource\.msgf?\(\s*'([^']+)'\s*,\s*'seller'/g;
            text.replace(re, function (m, key) {
                if (!keys[key]) missing.push(path.relative(repo, file) + ': ' + key);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('defines keys for every dynamic key prefix with a known value set', function () {
        var keys = properties(path.join(cartridge, 'cartridge/templates/resources/seller.properties'));
        var h = harness();
        var helpers = path.join(cartridge, 'cartridge/scripts/helpers');
        var statuses = {};
        var entryTypes = [];
        fs.readdirSync(helpers).forEach(function (name) {
            var text = fs.readFileSync(path.join(helpers, name), 'utf8');
            text.replace(/var [A-Z_]+_FLOW = \{([\s\S]*?)\n\};/g, function (m, body) {
                body.replace(/^\s+([A-Z_]+):/gm, function (k, status) { statuses[status] = true; return k; });
                return m;
            });
            var signs = /var ENTRY_SIGNS = \{([^}]*)\}/.exec(text);
            if (signs) signs[1].replace(/([A-Z_]+):/g, function (k, type) { entryTypes.push(type); return k; });
        });
        assert.isAbove(Object.keys(statuses).length, 20);
        assert.isAbove(entryTypes.length, 5);
        var internalCases = ['DUPLICATE_SELLER', 'PROVISIONING_FAILED', 'INTEGRATION_FAILURE', 'COMMISSION_RULE_MISSING', 'RECONCILIATION_MISMATCH'];
        var expected = Object.keys(statuses).map(function (s) { return 'status.' + s; })
            .concat(h.require('scripts/helpers/sellerDocumentHelpers').DOCUMENT_TYPES.map(function (t) { return 'doctype.' + t; }))
            .concat(entryTypes.map(function (t) { return 'ledger.' + t; }))
            .concat(h.require('scripts/helpers/caseHelpers').CASE_TYPES.filter(function (t) { return internalCases.indexOf(t) < 0; }).map(function (t) { return 'casetype.' + t; }));
        assert.deepEqual(expected.filter(function (k) { return !keys[k]; }), []);
    });

    it('defines a message for every error code the helpers return', function () {
        var keys = properties(path.join(cartridge, 'cartridge/templates/resources/seller.properties'));
        var codes = {};
        walk(cartridge, /\.js$/).concat(walk(bm, /\.js$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/errorResult\('([a-z-]+)'/g, function (m, code) { codes[code] = true; return m; });
        });
        assert.deepEqual(Object.keys(codes).filter(function (c) { return !keys['error.' + c]; }), []);
    });

    it('has a subject and body for every notification type that the code enqueues', function () {
        var keys = properties(path.join(cartridge, 'cartridge/templates/resources/seller.properties'));
        var types = {};
        walk(cartridge, /\.js$/).forEach(function (file) {
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
                    // Skip ternary conditions and prefixes completed at run time.
                    if (!compared && !/_$/.test(type)) types[type] = true;
                    return q;
                });
                return m;
            });
            text.replace(/notice: '([A-Z_]+)'/g, function (m, type) {
                types[type] = true;
                return m;
            });
        });
        ['PAYOUT_ACCOUNT_VERIFIED', 'PAYOUT_ACCOUNT_REJECTED'].forEach(function (t) { types[t] = true; });
        var missing = Object.keys(types).filter(function (t) { return !keys['notification.' + t + '.subject'] || !keys['notification.' + t + '.body']; });
        assert.deepEqual(missing, []);
    });

    it('wires every job step to an exported function and every job to a declared step type', function () {
        var steptypes = JSON.parse(fs.readFileSync(path.join(cartridge, 'steptypes.json'), 'utf8'))['step-types']['script-module-step'];
        var h = harness();
        var jobs = h.require('scripts/jobs/marketplace');
        steptypes.forEach(function (s) {
            assert.equal(s.module, 'plugin_seller/cartridge/scripts/jobs/marketplace.js');
            assert.isFunction(jobs[s.function], s['@type-id']);
            assert.equal(s.transactional, 'false');
        });
        var declared = steptypes.map(function (s) { return s['@type-id']; });
        var jobsXml = fs.readFileSync(path.join(repo, 'metadata/plugin_seller/jobs.xml'), 'utf8');
        var used = [];
        jobsXml.replace(/type="(custom\.[^"]+)"/g, function (m, t) { used.push(t); return m; });
        assert.deepEqual(used.filter(function (t) { return declared.indexOf(t) < 0; }), []);
        assert.notMatch(jobsXml, /run-recurring enabled="true"/, 'schedules ship disabled');
    });

    it('maps every Custom API endpoint to a public function', function () {
        var h = harness();
        ['marketplace', 'marketplace-admin'].forEach(function (api) {
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
        xml.replace(/<pipeline name="MarketplaceAdmin-([A-Za-z]+)"\/>/g, function (m, n) { nodes.push(n); return m; });
        var unique = nodes.filter(function (n, i) { return nodes.indexOf(n) === i; });
        assert.equal(unique.length, nodes.length, 'a node is registered under two menu actions');
        var source = fs.readFileSync(path.join(bm, 'cartridge/controllers/MarketplaceAdmin.js'), 'utf8');
        var exported = [];
        source.replace(/exports\.([A-Za-z]+)\.public = true;/g, function (m, n) { exported.push(n); return m; });
        assert.sameMembers(exported, nodes);
        assert.notInclude(xml, 'NoPermissionCheck');
    });

    it('defines a site preference for every preference the code reads, and uses no other', function () {
        var xml = fs.readFileSync(path.join(repo, 'metadata/plugin_seller/meta/system-objecttype-extensions.xml'), 'utf8');
        var defined = xml.split('type-id="SitePreferences"')[1];
        var missing = [];
        walk(cartridge, /\.(js|isml)$/).concat(walk(bm, /\.(js|isml)$/)).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:getCustomPreferenceValue|getPreference|getEnumPreference|getListPreference)\('([A-Za-z]+)'\)/g, function (m, id) {
                if (defined.indexOf('attribute-id="' + id + '"') < 0) missing.push(path.relative(repo, file) + ': ' + id);
                return m;
            });
        });
        assert.deepEqual(missing, []);
    });

    it('keeps the base SFRA layout: no plugin framework modules', function () {
        assert.isFalse(fs.existsSync(path.join(cartridge, 'cartridge/scripts/seller')));
        var stale = [];
        walk(cartridge, /\.(js|isml)$/).concat(walk(bm, /\.(js|isml)$/)).forEach(function (file) {
            if (/scripts\/seller\//.test(fs.readFileSync(file, 'utf8'))) stale.push(path.relative(repo, file));
        });
        assert.deepEqual(stale, []);
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
        walk(path.join(cartridge, 'cartridge/templates/default'), /\.isml$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            text.replace(/class="([^"$]*)"/g, function (m, classes) {
                classes.split(/\s+/).filter(Boolean).forEach(function (cls) {
                    if (/[A-Z]|_/.test(cls) && !/^(col|row)/.test(cls)) problems.push(path.relative(repo, file) + ': class ' + cls);
                });
                return m;
            });
            if (/style="[^"]*grid/.test(text)) problems.push(file + ': grid');
        });
        assert.deepEqual(problems, []);
    });

    it('keeps the base cartridges untouched', function () {
        var childProcess = require('child_process');
        var changed = childProcess.execFileSync('git', ['status', '--porcelain', '--', 'cartridges/app_storefront_base', 'cartridges/bm_app_storefront_base', 'cartridges/modules'], { cwd: repo }).toString().trim();
        assert.equal(changed, '');
    });
});
