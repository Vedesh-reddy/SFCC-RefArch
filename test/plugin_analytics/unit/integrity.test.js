'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var harness = require('./harness');

var repo = harness.repo;
var cartridge = path.join(repo, 'cartridges/plugin_analytics');
var bm = path.join(repo, 'cartridges/bm_analytics');
var metadata = path.join(repo, 'metadata/plugin_analytics');

/**
 * @param {string} dir - directory
 * @param {RegExp} pattern - file name filter
 * @returns {string[]} files below dir, without compiled static output
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
 * @param {RegExp} pattern - file name filter
 * @returns {string[]} plugin and BM files
 */
function sources(pattern) {
    return walk(cartridge, pattern).concat(walk(bm, pattern));
}

describe('plugin_analytics integrity', function () {
    it('defines every resource key the desk uses, including dynamic key families', function () {
        var keys = harness.bundles.analyticsadmin;
        var r = harness().require('scripts/helpers/analyticsReportHelpers');
        var used = [];
        sources(/\.(js|isml)$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:msg\(|Resource\.msg\()'([^']+[^.'])'(?! \+)/g, function (m, key) { used.push(key); return m; });
        });
        used = used.concat(r.RANGES.map(function (n) { return 'range.' + n; }))
            .concat(r.PRODUCT_SORTS.concat(['cartToPurchaseRate']).map(function (s) { return 'sort.' + s; }))
            .concat(['impressions', 'selections', 'views', 'cart', 'checkout', 'shipping', 'payment', 'purchase'].map(function (s) { return 'step.' + s; }))
            .concat(Object.keys(r.getRankings([], [])).map(function (l) { return 'ranking.' + l; }))
            .concat(['site', 'products', 'categories', 'searches'].map(function (e) { return 'export.' + e; }))
            .concat(['invalid-date', 'invalid-order', 'range-too-long'].map(function (e) { return 'error.' + e; }))
            .concat(['overview', 'products', 'rankings', 'categories', 'funnel', 'orders', 'search', 'health', 'export'].map(function (n) { return 'nav.' + n; }));
        assert.deepEqual(used.filter(function (k) { return !keys[k]; }), []);
    });

    it('wires every step type to an exported function and every job to a declared step type', function () {
        var steptypes = JSON.parse(fs.readFileSync(path.join(cartridge, 'steptypes.json'), 'utf8'))['step-types']['script-module-step'];
        var jobs = harness().require('scripts/jobs/analytics');
        steptypes.forEach(function (s) {
            assert.equal(s.module, 'plugin_analytics/cartridge/scripts/jobs/analytics.js');
            assert.isFunction(jobs[s.function], s['@type-id']);
            assert.equal(s.transactional, 'false');
            assert.equal(s['@supports-parallel-execution'], 'false');
            assert.equal(s['@supports-site-context'], 'true');
        });
        var jobsXml = fs.readFileSync(path.join(metadata, 'jobs.xml'), 'utf8');
        var used = [];
        jobsXml.replace(/type="(custom\.[^"]+)"/g, function (m, t) { used.push(t); return m; });
        assert.sameMembers(used, steptypes.map(function (s) { return s['@type-id']; }));
        assert.notMatch(jobsXml, /run-recurring enabled="true"/, 'schedules ship disabled');
    });

    it('registers every Business Manager node under exactly one menu action, and exports it', function () {
        var xml = fs.readFileSync(path.join(bm, 'cartridge/bm_extensions.xml'), 'latin1');
        var nodes = [];
        xml.replace(/<pipeline name="AnalyticsAdmin-([A-Za-z]+)"\/>/g, function (m, n) { nodes.push(n); return m; });
        assert.equal(nodes.filter(function (n, i) { return nodes.indexOf(n) === i; }).length, nodes.length);
        var exported = [];
        fs.readFileSync(path.join(bm, 'cartridge/controllers/AnalyticsAdmin.js'), 'utf8').replace(/exports\.([A-Za-z]+)\.public = true;/g, function (m, n) { exported.push(n); return m; });
        assert.sameMembers(exported, nodes);
        assert.notInclude(xml, 'NoPermissionCheck');
    });

    it('defines a site preference for every preference the code reads', function () {
        var xml = fs.readFileSync(path.join(metadata, 'meta/system-objecttype-extensions.xml'), 'utf8').split('type-id="SitePreferences"')[1];
        var missing = [];
        sources(/\.(js|isml)$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/(?:getCustomPreferenceValue|getPreference|getIntPreference)\('([A-Za-z]+)'/g, function (m, id) {
                if (xml.indexOf('attribute-id="' + id + '"') < 0) missing.push(path.relative(repo, file) + ': ' + id);
                return m;
            });
        });
        var flags = /analytics(Product|Checkout|Purchase|Search)TrackingEnabled/g;
        fs.readFileSync(path.join(cartridge, 'cartridge/scripts/helpers/analyticsHelpers.js'), 'utf8').replace(flags, function (id) {
            if (xml.indexOf('attribute-id="' + id + '"') < 0) missing.push(id);
            return id;
        });
        assert.deepEqual(missing, []);
    });

    it('keeps every analytics custom object site-scoped, so sites never mix their data', function () {
        var schema = harness().schema;
        var used = {};
        sources(/\.js$/).forEach(function (file) {
            fs.readFileSync(file, 'utf8').replace(/'(Analytics[A-Z][A-Za-z]+)'/g, function (m, type) { used[type] = true; return m; });
        });
        Object.keys(used).forEach(function (type) {
            assert.equal(schema.scopes[type], 'site', type);
        });
        assert.isAtLeast(Object.keys(used).length, 7);
    });

    it('follows the base SFRA layout and the repository conventions', function () {
        assert.isFalse(fs.existsSync(path.join(cartridge, 'cartridge/scripts/analytics')), 'helpers live in scripts/helpers');
        var problems = [];
        sources(/\.js$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            var rel = path.relative(repo, file);
            if (/Math\.random/.test(text)) problems.push(rel + ': Math.random');
            if (/console\./.test(text)) problems.push(rel + ': console');
            text.replace(/Logger\.getLogger\(([^)]*)\)/g, function (m, args) {
                if (!/^'[a-z0-9-]+',\s*'[a-z0-9-]+'$/.test(args.trim())) problems.push(rel + ': logger ' + args);
                return m;
            });
            if (/Logger\.(info|warn|error|debug)\(/.test(text)) problems.push(rel + ': uncategorized logging');
            if (/\b(let|const)\s/.test(text) && rel.indexOf('/client/') < 0) problems.push(rel + ': ES6 declarations in server script');
        });
        sources(/\.isml$/).forEach(function (file) {
            var text = fs.readFileSync(file, 'utf8');
            if (/grid/.test(text.replace(/table_/g, ''))) problems.push(file + ': grid');
            text.replace(/class="([^"$]*)"/g, function (m, classes) {
                classes.split(/\s+/).filter(Boolean).forEach(function (cls) {
                    if (/[A-Z]|_/.test(cls) && !/^table_/.test(cls)) problems.push(path.relative(repo, file) + ': class ' + cls);
                });
                return m;
            });
        });
        fs.readFileSync(path.join(cartridge, 'cartridge/scripts/hooks/afterFooter.js'), 'utf8').replace(/(?:class|id)="([^"$]+)"/g, function (m, names) {
            if (/[A-Z_]/.test(names)) problems.push('afterFooter: ' + names);
            return m;
        });
        assert.deepEqual(problems, []);
    });

    it('registers the template hook and step types through the cartridge package', function () {
        var pkg = JSON.parse(fs.readFileSync(path.join(cartridge, 'package.json'), 'utf8'));
        var hooks = JSON.parse(fs.readFileSync(path.join(cartridge, pkg.hooks), 'utf8')).hooks;
        assert.deepEqual(hooks.map(function (hook) { return hook.name; }), ['app.template.afterFooter']);
        hooks.forEach(function (hook) { assert.isTrue(fs.existsSync(path.join(cartridge, hook.script)), hook.script); });
    });

    it('renders the page context HTML-escaped, so a search term cannot break out of the attribute', function () {
        var h = harness();
        h.require('scripts/hooks/afterFooter').afterFooter({ productSearch: { searchKeywords: '"><script>alert(1)</script>', count: 0 } });
        var output = h.state.velocity[0];
        assert.notInclude(output.data.page, '<');
        assert.notInclude(output.data.page, '"');
        assert.include(output.template, 'data-page="$page"');
        h.require('scripts/hooks/afterFooter').afterFooter({ product: { id: 'M1' }, addToCartUrl: '/add' });
        assert.include(h.state.velocity[1].data.page, 'pdp');
        h.preferences.analyticsProductTrackingEnabled = false;
        h.require('scripts/hooks/afterFooter').afterFooter({});
        assert.lengthOf(h.state.velocity, 2, 'no script when product tracking is off');
    });

    it('keeps the base cartridges untouched', function () {
        if (!fs.existsSync(path.join(repo, 'cartridges/app_storefront_base'))) this.skip();
        var changed = require('child_process').execFileSync('git', ['status', '--porcelain', '--', 'cartridges/app_storefront_base', 'cartridges/bm_app_storefront_base', 'cartridges/modules'], { cwd: repo }).toString().trim();
        assert.equal(changed, '');
    });
});
