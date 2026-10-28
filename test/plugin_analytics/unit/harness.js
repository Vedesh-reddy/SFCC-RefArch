'use strict';

// In-memory Script API double for plugin_analytics. It models what the plugin relies on:
// unique custom object keys, transactions that roll back, the 4-expression query quota,
// datetime comparison to the second, attribute types from the metadata, the site calendar,
// orders whose lastModified moves when they are written, and the SFRA route chain.
var Module = require('module');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var repo = path.resolve(__dirname, '../../..');
var root = path.join(repo, 'cartridges/plugin_analytics/cartridge');
var bmRoot = path.join(repo, 'cartridges/bm_analytics/cartridge');
var meta = path.join(repo, 'metadata/plugin_analytics/meta');
var active = {};
var original = Module._load; // eslint-disable-line no-underscore-dangle

Module._load = function (request, parent, isMain) { // eslint-disable-line no-underscore-dangle
    var file = parent && parent.filename;
    var ours = file && (file.indexOf(root) === 0 || file.indexOf(bmRoot) === 0);
    if (ours && active[request]) return active[request];
    if (ours && /^[*~]\/cartridge\//.test(request)) {
        var target = request.slice(12);
        if (active['*/cartridge/' + target]) return active['*/cartridge/' + target];
        return original.call(this, path.join(root, target), parent, isMain);
    }
    return original.call(this, request, parent, isMain);
};

/**
 * @param {*} value - string or Buffer
 */
function Bytes(value) {
    this.buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    this.length = this.buffer.length;
}

function compare(a, b, op) {
    var left = a instanceof Date ? Math.floor(a.getTime() / 1000) : a;
    var right = b instanceof Date ? Math.floor(b.getTime() / 1000) : b;
    if (left === undefined) left = null;
    if (op === '===') return left === right;
    if (op === '!==') return left !== right;
    if (left === null || right === null) return false;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    return left >= right;
}

/**
 * @param {string} condition - "custom.a = {0} AND creationDate < {1}"
 * @param {Array} args - arguments
 * @returns {Function} row => boolean
 */
function predicate(condition, args) {
    var js = condition
        .replace(/((?:custom\.)?\w+)\s*(!=|>=|<=|=|<|>)\s*NULL/g, function (all, field, op) {
            var ref = field.indexOf('custom.') === 0 ? 'row.custom.' + field.slice(7) : 'row.' + field;
            return op === '=' ? '(' + ref + ' == null)' : '(' + ref + ' != null)';
        })
        .replace(/((?:custom\.)?\w+)\s*(!=|>=|<=|=|<|>)\s*\{(\d+)\}/g, function (all, field, op, index) {
            var ref = field.indexOf('custom.') === 0 ? 'row.custom.' + field.slice(7) : 'row.' + field;
            return 'compare(' + ref + ', args[' + index + '], "' + ({ '=': '===', '!=': '!==' }[op] || op) + '")';
        })
        .replace(/ AND /g, ' && ')
        .replace(/ OR /g, ' || ');
    var test = new Function('row', 'args', 'compare', 'return ' + js + ';'); // eslint-disable-line no-new-func
    return function (row) { return test(row, args, compare); };
}

/**
 * @param {Array} rows - rows
 * @param {?string} sort - "custom.field asc"
 * @returns {Array} sorted rows
 */
function sortRows(rows, sort) {
    if (!sort) return rows;
    var parts = sort.split(/\s+/);
    var field = parts[0];
    var dir = parts[1] === 'desc' ? -1 : 1;
    var get = function (row) {
        var value = field.indexOf('custom.') === 0 ? row.custom[field.slice(7)] : row[field];
        return value instanceof Date ? value.getTime() : value;
    };
    return rows.slice().sort(function (a, b) {
        var x = get(a);
        var y = get(b);
        if (x === y) return 0;
        return x < y ? -dir : dir;
    });
}

function iterator(items) {
    var index = 0;
    var state = { closed: false };
    return {
        count: items.length,
        state: state,
        hasNext: function () { return index < items.length; },
        next: function () { return items[index++]; },
        close: function () { state.closed = true; },
        asList: function () { return items; }
    };
}

/**
 * @returns {Object} typeId => {attributeId: type}, plus keys and storage scopes
 */
function schema() {
    var result = { types: {}, keys: {}, scopes: {} };
    var co = fs.readFileSync(path.join(meta, 'custom-objecttype-definitions.xml'), 'utf8');
    co.split('<custom-type type-id="').slice(1).forEach(function (chunk) {
        var typeId = chunk.slice(0, chunk.indexOf('"'));
        var attrs = {};
        var key = /<key-definition attribute-id="([^"]+)"/.exec(chunk)[1];
        attrs[key] = 'string';
        chunk.replace(/<attribute-definition attribute-id="([^"]+)">[\s\S]*?<type>([^<]+)<\/type>/g, function (m, id, type) { attrs[id] = type; return m; });
        result.types[typeId] = attrs;
        result.keys[typeId] = key;
        result.scopes[typeId] = /<storage-scope>([^<]+)<\/storage-scope>/.exec(chunk)[1];
    });
    var sys = fs.readFileSync(path.join(meta, 'system-objecttype-extensions.xml'), 'utf8');
    sys.split('<type-extension type-id="').slice(1).forEach(function (chunk) {
        var typeId = chunk.slice(0, chunk.indexOf('"'));
        var attrs = {};
        chunk.replace(/<attribute-definition attribute-id="([^"]+)">[\s\S]*?<type>([^<]+)<\/type>/g, function (m, id, type) { attrs[id] = type; return m; });
        result.types[typeId] = attrs;
    });
    return result;
}
var SCHEMA = schema();

/**
 * @returns {Object} site preference defaults as getCustomPreferenceValue returns them
 */
function preferenceDefaults() {
    var xml = fs.readFileSync(path.join(meta, 'system-objecttype-extensions.xml'), 'utf8');
    var result = {};
    xml.split('type-id="SitePreferences"')[1].replace(/<attribute-definition attribute-id="(\w+)">([\s\S]*?)<\/attribute-definition>/g, function (m, id, body) {
        var type = /<type>([^<]+)<\/type>/.exec(body)[1];
        var value = /<default-value>([^<]*)<\/default-value>/.exec(body);
        var enumValue = /<value-definition default="true">[\s\S]*?<value>([^<]*)<\/value>/.exec(body);
        if (value && type === 'int') result[id] = Number(value[1]);
        else if (value && type === 'boolean') result[id] = value[1] === 'true';
        else if (value) result[id] = value[1];
        else if (enumValue) result[id] = { value: enumValue[1] };
        return m;
    });
    return result;
}
var PREFERENCE_DEFAULTS = preferenceDefaults();

/**
 * @param {string} file - properties file
 * @returns {Object} key => text
 */
function properties(file) {
    var result = {};
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
        var index = line.indexOf('=');
        if (index > 0 && line.charAt(0) !== '#') result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
    return result;
}
var BUNDLES = { analyticsadmin: properties(path.join(bmRoot, 'templates/resources/analyticsadmin.properties')) };

function checkType(typeId, name, value) {
    var type = SCHEMA.types[typeId] && SCHEMA.types[typeId][name];
    if (!type) throw new Error('Attribute ' + typeId + '.' + name + ' is not defined in the metadata');
    if (value === null || value === undefined) return;
    var ok = {
        string: typeof value === 'string',
        text: typeof value === 'string',
        int: typeof value === 'number' && Math.floor(value) === value && Math.abs(value) < 2147483648,
        boolean: typeof value === 'boolean',
        datetime: value instanceof Date
    }[type];
    if (!ok) throw new Error('Attribute ' + typeId + '.' + name + ' (' + type + ') cannot hold ' + JSON.stringify(value));
}

/**
 * @param {string} typeId - object type
 * @param {Object} initial - initial values
 * @param {Function} [onWrite] - called after each write
 * @returns {Object} custom attribute bag that validates writes
 */
function typedCustom(typeId, initial, onWrite) {
    return new Proxy(Object.assign({}, initial), {
        set: function (obj, name, value) {
            checkType(typeId, name, value);
            obj[name] = value;
            if (onWrite) onWrite();
            return true;
        }
    });
}

/**
 * @param {Array} items - items
 * @returns {Object} dw.util.Collection-like
 */
function collection(items) {
    return { length: items.length, size: function () { return items.length; }, toArray: function () { return items.slice(); }, iterator: function () { return iterator(items); } };
}

function harness(options) {
    var opts = options || {};
    var db = {};
    var state = {
        orders: {},
        products: {},
        categories: {},
        logs: [],
        renders: [],
        velocity: [],
        creates: 0,
        siteCurrency: 'USD',
        offsetHours: opts.offsetHours === undefined ? -5 : opts.offsetHours,
        now: null,
        failCommitIn: 0
    };
    var preferences = Object.assign({}, PREFERENCE_DEFAULTS, { analyticsEnabled: true, analyticsSearchTrackingEnabled: true }, opts.preferences || {});

    function snapshot() {
        var copy = {};
        Object.keys(db).forEach(function (id) { copy[id] = { row: db[id], custom: Object.assign({}, db[id].custom) }; });
        var orders = {};
        Object.keys(state.orders).forEach(function (no) { orders[no] = { custom: Object.assign({}, state.orders[no].custom), lastModified: state.orders[no].lastModified }; });
        return { db: copy, orders: orders };
    }

    function restore(saved) {
        Object.keys(db).forEach(function (id) { if (!(id in saved.db)) delete db[id]; });
        Object.keys(saved.db).forEach(function (id) {
            db[id] = saved.db[id].row;
            db[id].custom = typedCustom(db[id].type, saved.db[id].custom);
        });
        Object.keys(saved.orders).forEach(function (no) {
            var order = state.orders[no];
            order.lastModified = saved.orders[no].lastModified;
            order.custom = typedCustom('Order', saved.orders[no].custom, function () { order.lastModified = new Date(); });
        });
    }

    var depth = 0;
    function transactionWrap(fn) {
        var saved = depth === 0 ? snapshot() : null;
        depth += 1;
        try {
            var result = fn();
            if (depth === 1 && state.failCommitIn) {
                state.failCommitIn -= 1;
                if (state.failCommitIn === 0) throw new Error('commit failed');
            }
            return result;
        } catch (e) {
            if (saved) restore(saved);
            throw e;
        } finally {
            depth -= 1;
        }
    }

    function rowsOf(type) {
        return Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; });
    }

    var CustomObjectMgr = {
        getCustomObject: function (type, key) { return db[type + ':' + key] || null; },
        createCustomObject: function (type, key) {
            if (!SCHEMA.keys[type]) throw new Error('Unknown custom object type ' + type);
            if (depth === 0) throw new Error('createCustomObject outside a transaction');
            var id = type + ':' + key;
            if (db[id]) throw new Error('UNIQUE_CONSTRAINT ' + id);
            if (String(key).length > 256) throw new Error('key too long');
            var custom = {};
            custom[SCHEMA.keys[type]] = key;
            db[id] = { type: type, custom: typedCustom(type, custom), creationDate: new Date() };
            state.creates += 1;
            return db[id];
        },
        remove: function (obj) {
            if (depth === 0) throw new Error('remove outside a transaction');
            Object.keys(db).forEach(function (id) { if (db[id] === obj) delete db[id]; });
        },
        queryCustomObjects: function (type, query, sort) {
            if ((String(query).match(/custom\.\w+/g) || []).length > 4) throw new Error('QuotaLimitExceededException api.query.customAttrExpr: ' + query);
            var args = Array.prototype.slice.call(arguments, 3);
            return iterator(sortRows(rowsOf(type).filter(predicate(query, args)), sort));
        }
    };

    function shifted(date) {
        return new Date(date.getTime() + state.offsetHours * 3600000);
    }

    // Site calendar with a fixed UTC offset (the default is -5h, like New York in winter).
    function Calendar() {
        this.time = state.now ? new Date(state.now) : new Date();
    }
    Calendar.DATE = 5;
    Calendar.prototype.setTime = function (date) { this.time = new Date(date); };
    Calendar.prototype.getTime = function () { return new Date(this.time); };
    Calendar.prototype.add = function (field, amount) { if (field === Calendar.DATE) this.time = new Date(this.time.getTime() + amount * 86400000); };
    Calendar.prototype.parseByFormat = function (text) {
        this.time = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))) - state.offsetHours * 3600000);
    };

    var Site = {
        getCurrent: function () {
            return {
                getCustomPreferenceValue: function (id) { return Object.prototype.hasOwnProperty.call(preferences, id) ? preferences[id] : null; },
                getDefaultCurrency: function () { return state.siteCurrency; },
                getID: function () { return 'TestSite'; },
                getTimezone: function () { return 'America/New_York'; }
            };
        },
        getCalendar: function () { return new Calendar(); }
    };

    function logger() {
        var write = function (level) {
            return function (message) {
                var args = Array.prototype.slice.call(arguments, 1);
                state.logs.push({ level: level, message: String(message).replace(/\{(\d+)\}/g, function (m, i) { return args[i]; }) });
            };
        };
        return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error'), isDebugEnabled: function () { return false; } };
    }

    function Money(value, currencyCode) {
        this.value = value;
        this.currencyCode = currencyCode || 'USD';
        this.available = value !== null && value !== undefined;
    }

    var OrderMgr = {
        getOrder: function (no) { return state.orders[no] || null; },
        searchOrders: function (query, sort) {
            var args = Array.prototype.slice.call(arguments, 2);
            var rows = Object.keys(state.orders).map(function (no) { return state.orders[no]; }).filter(predicate(query, args));
            return iterator(sortRows(rows, sort));
        }
    };

    // SFRA routes: server.append/post register middleware; run() plays a route like the base.
    var routes = {};
    var server = {
        middleware: { https: function (req, res, next) { next(); } },
        forms: { getForm: function () { return {}; } },
        extend: function () {},
        exports: function () { return routes; },
        get: function (name) { routes[name] = Array.prototype.slice.call(arguments, 1); },
        post: function (name) { routes[name] = Array.prototype.slice.call(arguments, 1); },
        append: function (name, fn) { routes['append:' + name] = [fn]; },
        prepend: function (name, fn) { routes['prepend:' + name] = [fn]; }
    };

    var mocks = {
        server: server,
        'dw/object/CustomObjectMgr': CustomObjectMgr,
        'dw/system/Transaction': { wrap: transactionWrap },
        'dw/system/Site': Site,
        'dw/system/Logger': { getLogger: logger },
        'dw/system/Status': Object.assign(function (status, code, message) { this.status = status; this.code = code; this.message = message; }, { OK: 0, ERROR: 1 }),
        'dw/crypto/SecureRandom': function () {
            this.nextBytes = function (n) { return new Bytes(crypto.randomBytes(n)); };
            this.nextInt = function (n) { return opts.randomInt !== undefined ? opts.randomInt : crypto.randomInt(n); };
        },
        'dw/crypto/Encoding': { toHex: function (bytes) { return bytes.buffer.toString('hex'); } },
        'dw/crypto/MessageDigest': Object.assign(function () {
            this.digestBytes = function (bytes) { return new Bytes(crypto.createHash('sha256').update(bytes.buffer).digest()); };
        }, { DIGEST_SHA_256: 'SHA-256' }),
        'dw/util/Bytes': Bytes,
        'dw/util/Calendar': Calendar,
        'dw/util/StringUtils': {
            formatCalendar: function (calendar, format) {
                if (format !== 'yyyyMMdd') throw new Error('unexpected format ' + format);
                return shifted(calendar.getTime()).toISOString().slice(0, 10).replace(/-/g, '');
            },
            formatMoney: function (money) {
                var cents = Math.round(Math.abs(money.value) * 100);
                var text = '$' + Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String((cents % 100) + 100).slice(1);
                return money.value < 0 ? '-' + text : text;
            }
        },
        'dw/value/Money': Money,
        'dw/web/Resource': {
            msg: function (key, bundle, fallback) {
                if (BUNDLES[bundle] && Object.prototype.hasOwnProperty.call(BUNDLES[bundle], key)) return BUNDLES[bundle][key];
                state.missingKeys = (state.missingKeys || []).concat([bundle + ':' + key]);
                return fallback === null || fallback === undefined ? key : fallback;
            }
        },
        'dw/web/URLUtils': {
            url: function () { return { toString: function () { return Array.prototype.join.call(this.parts, '/'); }, parts: Array.prototype.slice.call(arguments) }; },
            staticURL: function (p) { return '/static' + p; }
        },
        'dw/template/ISML': { renderTemplate: function (template, data) { state.renders.push({ template: template, data: data }); } },
        'dw/template/Velocity': { render: function (template, data) { state.velocity.push({ template: template, data: data }); } },
        'dw/catalog/ProductMgr': {
            getProduct: function (id) { return state.products[id] || null; },
            queryAllSiteProducts: function () { return iterator(Object.keys(state.products).map(function (id) { return state.products[id]; })); }
        },
        'dw/catalog/CatalogMgr': { getCategory: function (id) { return state.categories[id] || null; } },
        'dw/order/OrderMgr': OrderMgr,
        'dw/order/BasketMgr': { getCurrentBasket: function () { return state.basket || null; } },
        'dw/order/Order': { ORDER_STATUS_CREATED: 0, ORDER_STATUS_NEW: 3, ORDER_STATUS_OPEN: 4, ORDER_STATUS_COMPLETED: 5, ORDER_STATUS_CANCELLED: 6, ORDER_STATUS_FAILED: 8, PAYMENT_STATUS_NOTPAID: 0, PAYMENT_STATUS_PARTPAID: 1, PAYMENT_STATUS_PAID: 2 }
    };
    Object.keys(active).forEach(function (k) { delete active[k]; });
    Object.assign(active, mocks, opts.mocks || {});
    Object.keys(require.cache).forEach(function (k) { if (k.indexOf(root) === 0 || k.indexOf(bmRoot) === 0) delete require.cache[k]; });
    Object.keys(routes).forEach(function (k) { delete routes[k]; });

    global.session = { privacy: {}, trackingAllowed: true, userAuthenticated: true, userName: 'analyst' };
    global.request = {
        httpHost: 'shop.example.com',
        httpHeaders: { get: function (name) { return (state.headers || { origin: 'https://shop.example.com' })[name] || null; } },
        httpParameterMap: {
            get: function (name) {
                var q = state.params || {};
                return { submitted: Object.prototype.hasOwnProperty.call(q, name), stringValue: q[name] };
            }
        }
    };
    Object.defineProperty(global.request.httpParameterMap, 'requestBodyAsString', { get: function () { return state.body; }, configurable: true });
    state.response = { status: 200, headers: {}, body: '', contentType: null };
    global.response = {
        setStatus: function (s) { state.response.status = s; },
        setContentType: function (t) { state.response.contentType = t; },
        setHttpHeader: function (n, v) { state.response.headers[n] = v; },
        writer: { print: function (text) { state.response.body += text; } }
    };

    var api = {
        db: db,
        state: state,
        preferences: preferences,
        routes: routes,
        Money: Money,
        schema: SCHEMA,
        require: function (rel) { return require(path.join(root, rel)); },
        requireBm: function (rel) { return require(path.join(bmRoot, rel)); },
        get: function (type, key) { return CustomObjectMgr.getCustomObject(type, key); },
        rows: function (type) { return rowsOf(type); },
        mock: function (name) { return active[name]; },
        /**
         * @param {string} iso - moment the site clock shows
         */
        setNow: function (iso) { state.now = iso ? new Date(iso) : null; },
        /**
         * Plays an SFRA route: base middleware (optional), then the plugin's appended
         * middleware, then route:BeforeComplete listeners in registration order.
         * @param {string} name - route
         * @param {Object} call - {base(req, res, route), form, viewData, redirectUrl, customer}
         * @returns {Object} res
         */
        run: function (name, call) {
            var listeners = [];
            var route = { on: function (event, fn) { if (event === 'route:BeforeComplete') listeners.push(fn); } };
            var req = { form: call.form || {}, currentCustomer: { raw: call.customer || { registered: false } } };
            var viewData = Object.assign({}, call.viewData || {});
            var res = {
                redirectUrl: call.redirectUrl || null,
                status: 200,
                printed: null,
                getViewData: function () { return viewData; },
                setViewData: function (d) { Object.assign(viewData, d); },
                json: function (d) { Object.assign(viewData, d); },
                setStatusCode: function (s) { res.status = s; },
                print: function (m) { res.printed = m; }
            };
            if (call.base) call.base(req, res, route);
            var chain = (routes['append:' + name] || routes[name] || []).filter(function (fn) { return typeof fn === 'function'; });
            var index = 0;
            var next = function () {
                var fn = chain[index++];
                if (fn) fn.call(route, req, res, next);
            };
            next();
            listeners.forEach(function (fn) { fn.call(route, req, res); });
            return res;
        }
    };
    return api;
}

harness.Bytes = Bytes;
harness.collection = collection;
harness.typedCustom = typedCustom;
harness.bundles = BUNDLES;
harness.repo = repo;

module.exports = harness;
