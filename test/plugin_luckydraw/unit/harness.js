'use strict';

// In-memory Script API double for plugin_luckydraw. It models the parts the plugin relies on:
// unique custom object keys, transactions that roll back (coupon codes included), bounded
// queries, order search, time-zone calendars, site preferences, keyed hashing and secure
// randomness (backed by Node crypto).
var Module = require('module');
var path = require('path');
var crypto = require('crypto');

var root = path.resolve(__dirname, '../../../cartridges/plugin_luckydraw/cartridge');
var meta = path.resolve(__dirname, '../../../metadata/plugin_luckydraw/meta');
var active = {};
var original = Module._load; // eslint-disable-line no-underscore-dangle

Module._load = function (request, parent, isMain) { // eslint-disable-line no-underscore-dangle
    var ours = parent && parent.filename && parent.filename.indexOf(root) === 0;
    if (ours && active[request]) return active[request];
    if (ours && /^[*~]\/cartridge\//.test(request)) {
        var target = request.slice(12);
        if (active['*/cartridge/' + target]) return active['*/cartridge/' + target];
        return original.call(this, path.join(root, target), parent, isMain);
    }
    return original.call(this, request, parent, isMain);
};

function Bytes(value) {
    this.buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    this.length = this.buffer.length;
}
Bytes.prototype.byteAt = function (i) { return this.buffer[i]; };
Bytes.prototype.toString = function () { return this.buffer.toString('utf8'); };

function compare(a, b, op) {
    var left = a instanceof Date ? a.getTime() : a;
    var right = b instanceof Date ? b.getTime() : b;
    if (left === undefined) left = null;
    if (Array.isArray(left) && (op === '===' || op === '!==')) {
        var has = left.indexOf(right) >= 0;
        return op === '===' ? has : !has;
    }
    if (op === '===') return left === right;
    if (op === '!==') return left !== right;
    if (left === null || right === null) return false;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    return left >= right;
}

/**
 * Turns "custom.a = {0} AND (custom.b != NULL OR c <= {1})" into a predicate. Plain fields
 * (orders) read the value of enum values.
 */
function predicate(condition, args) {
    var field = function (name) { return name.indexOf('custom.') === 0 ? 'row.custom.' + name.slice(7) : 'value(row.' + name + ')'; };
    var js = condition
        .replace(/((?:custom\.)?\w+)\s*(!=|>=|<=|=|<|>)\s*NULL/g, function (all, name, op) {
            var f = field(name);
            return op === '=' ? '(' + f + ' === null || ' + f + ' === undefined)' : '(' + f + ' !== null && ' + f + ' !== undefined)';
        })
        .replace(/((?:custom\.)?\w+)\s*(!=|>=|<=|=|<|>)\s*\{(\d+)\}/g, function (all, name, op, index) {
            return 'compare(' + field(name) + ', args[' + index + '], "' + ({ '=': '===', '!=': '!==' }[op] || op) + '")';
        })
        .replace(/ AND /g, ' && ')
        .replace(/ OR /g, ' || ');
    var value = function (v) { return v && typeof v === 'object' && !(v instanceof Date) && v.value !== undefined ? v.value : v; };
    var test = new Function('row', 'args', 'compare', 'value', 'return ' + js + ';'); // eslint-disable-line no-new-func
    return function (row) { return test(row, args, compare, value); };
}

function iterator(items) {
    var index = 0;
    return {
        count: items.length,
        hasNext: function () { return index < items.length; },
        next: function () { return items[index++]; },
        forward: function (n) { index += n; },
        close: function () {},
        asList: function () { return items; }
    };
}

function sorter(sort, read) {
    var parts = sort.split(/\s+/);
    var name = parts[0];
    var dir = parts[1] === 'desc' ? -1 : 1;
    return function (a, b) {
        var x = read(a, name);
        var y = read(b, name);
        x = x instanceof Date ? x.getTime() : x;
        y = y instanceof Date ? y.getTime() : y;
        if (x === y) return 0;
        if (x === undefined || x === null) return -dir;
        if (y === undefined || y === null) return dir;
        return x < y ? -dir : dir;
    };
}

function schema() {
    var fs = require('fs');
    var result = {};
    var keys = {};
    var co = fs.readFileSync(path.join(meta, 'custom-objecttype-definitions.xml'), 'utf8');
    co.split('<custom-type type-id="').slice(1).forEach(function (chunk) {
        var typeId = chunk.slice(0, chunk.indexOf('"'));
        var attrs = {};
        var key = /<key-definition attribute-id="([^"]+)"/.exec(chunk)[1];
        attrs[key] = 'string';
        keys[typeId] = key;
        chunk.replace(/<attribute-definition attribute-id="([^"]+)">[\s\S]*?<type>([^<]+)<\/type>/g, function (m, id, type) { attrs[id] = type; return m; });
        result[typeId] = attrs;
    });
    return { types: result, keys: keys };
}
var SCHEMA = schema();

/**
 * Site preference defaults from the metadata, the way getCustomPreferenceValue returns them.
 * @returns {Object} preference ID => default value
 */
function preferenceDefaults() {
    var fs = require('fs');
    var xml = fs.readFileSync(path.resolve(__dirname, '../../../metadata/plugin_luckydraw/meta/system-objecttype-extensions.xml'), 'utf8');
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

var MESSAGES = {};
require('fs').readFileSync(path.join(root, 'templates/resources/luckydraw.properties'), 'utf8').split('\n').forEach(function (line) {
    var index = line.indexOf('=');
    if (index > 0 && line.charAt(0) !== '#') MESSAGES[line.slice(0, index).trim()] = line.slice(index + 1).trim();
});

function checkType(typeId, name, value) {
    var type = SCHEMA.types[typeId] && SCHEMA.types[typeId][name];
    if (!type) throw new Error('Attribute ' + typeId + '.' + name + ' is not defined in the metadata');
    if (value === null || value === undefined) return;
    var ok = {
        string: typeof value === 'string',
        text: typeof value === 'string',
        int: typeof value === 'number' && Math.floor(value) === value,
        boolean: typeof value === 'boolean',
        datetime: value instanceof Date,
        'set-of-string': Array.isArray(value) && value.every(function (v) { return typeof v === 'string'; })
    }[type];
    if (!ok) throw new Error('Attribute ' + typeId + '.' + name + ' (' + type + ') cannot hold ' + JSON.stringify(value));
}

function typedCustom(typeId, initial) {
    return new Proxy(Object.assign({}, initial), {
        set: function (obj, name, value) {
            checkType(typeId, name, value);
            obj[name] = value;
            return true;
        }
    });
}

/**
 * @param {number} ms - instant
 * @param {string} tz - IANA zone
 * @returns {number} local minus UTC in ms
 */
function offset(ms, tz) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)) - Math.floor(ms / 1000) * 1000;
}

function Calendar(date) {
    this.ms = date ? date.getTime() : Date.now();
    this.tz = 'UTC';
}
Object.assign(Calendar, { YEAR: 1, MONTH: 2, DAY_OF_MONTH: 5, HOUR_OF_DAY: 11, MINUTE: 12, SECOND: 13, MILLISECOND: 14 });
Calendar.prototype.setTimeZone = function (tz) { this.tz = tz; };
Calendar.prototype.get = function (f) {
    var local = new Date(this.ms + offset(this.ms, this.tz));
    if (f === Calendar.YEAR) return local.getUTCFullYear();
    if (f === Calendar.MONTH) return local.getUTCMonth();
    if (f === Calendar.DAY_OF_MONTH) return local.getUTCDate();
    if (f === Calendar.HOUR_OF_DAY) return local.getUTCHours();
    if (f === Calendar.MINUTE) return local.getUTCMinutes();
    return local.getUTCSeconds();
};
Calendar.prototype.set = function () {
    var a = arguments;
    if (a.length === 2) {
        if (a[0] === Calendar.MILLISECOND) this.ms = Math.floor(this.ms / 1000) * 1000 + a[1];
        return;
    }
    var guess = Date.UTC(a[0], a[1], a[2], a[3] || 0, a[4] || 0, a[5] || 0);
    var first = offset(guess, this.tz);
    var ms = guess - first;
    var second = offset(ms, this.tz);
    this.ms = second === first ? ms : guess - second;
};
Calendar.prototype.getTime = function () { return new Date(this.ms); };

function harness(options) {
    var opts = options || {};
    var db = {};
    var preferences = Object.assign({}, PREFERENCE_DEFAULTS, {
        luckyDrawEnabled: true,
        luckyDrawCurrency: 'USD',
        luckyDrawPublishWinners: true,
        luckyDrawFromEmail: 'no-reply@example.com'
    }, opts.preferences || {});
    var state = {
        orders: {}, instanceType: 0, mails: [], hooks: {}, products: {}, coupons: {}, redemptions: {}, content: {}, groups: {}, logs: [], siteCurrency: 'USD', txDepth: 0, firstNames: {}
    };

    function transactionWrap(fn) {
        var snapshot = {};
        Object.keys(db).forEach(function (id) { snapshot[id] = { row: db[id], custom: Object.assign({}, db[id].custom) }; });
        var coupons = JSON.stringify(state.coupons);
        state.txDepth += 1;
        try {
            return fn();
        } catch (e) {
            Object.keys(db).forEach(function (id) { if (!(id in snapshot)) delete db[id]; });
            // Restore in place: like the platform, references held by the caller stay valid.
            Object.keys(snapshot).forEach(function (id) {
                var row = snapshot[id].row;
                db[id] = row;
                Object.keys(row.custom).forEach(function (k) { delete row.custom[k]; });
                Object.assign(row.custom, snapshot[id].custom);
            });
            state.coupons = JSON.parse(coupons);
            throw e;
        } finally {
            state.txDepth -= 1;
        }
    }

    var CustomObjectMgr = {
        getCustomObject: function (type, key) { return db[type + ':' + key] || null; },
        createCustomObject: function (type, key) {
            var id = type + ':' + key;
            if (db[id]) throw new Error('UNIQUE_CONSTRAINT ' + id);
            var custom = {};
            custom[SCHEMA.keys[type]] = key;
            db[id] = { type: type, custom: typedCustom(type, custom) };
            return db[id];
        },
        remove: function (obj) { Object.keys(db).forEach(function (id) { if (db[id] === obj) delete db[id]; }); },
        queryCustomObjects: function (type, query, sort) {
            // platform quota api.query.customAttrExpr: at most 4 custom attribute expressions per query
            if ((String(query).match(/custom\.\w+/g) || []).length > 4) throw new Error('QuotaLimitExceededException api.query.customAttrExpr: ' + query);
            var args = Array.prototype.slice.call(arguments, 3);
            var rows = Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }).filter(predicate(query, args));
            if (sort) rows.sort(sorter(sort, function (row, name) { return row.custom[name.replace(/^custom\./, '')]; }));
            return iterator(rows);
        }
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

    var secrets = Object.assign({ 'plugin-luckydraw.hmac': 'k'.repeat(40) }, opts.secrets || {});

    function Money(value, currencyCode) {
        this.value = value;
        this.currencyCode = currencyCode;
        this.available = value !== null && value !== undefined;
    }

    var files = {};
    function File(dirOrPath, name) {
        this.fullPath = '/' + (name ? (dirOrPath.fullPath.replace(/^\//, '') + '/' + name) : String(dirOrPath)).replace(/^\//, '');
        this.name = this.fullPath.split('/').pop();
    }
    File.IMPEX = 'IMPEX';
    File.prototype.exists = function () { return Buffer.isBuffer(files[this.fullPath]) || !!files[this.fullPath + '/']; };
    File.prototype.mkdirs = function () { files[this.fullPath + '/'] = true; return true; };
    function FileWriter(file) {
        var chunks = [];
        this.write = function (text) { chunks.push(String(text)); };
        this.close = function () { files[file.fullPath] = Buffer.from(chunks.join(''), 'utf8'); };
    }
    function RandomAccessFileReader(file) {
        var position = 0;
        this.readBytes = function (n) {
            var data = files[file.fullPath] || Buffer.alloc(0);
            if (position >= data.length) return null;
            var chunk = data.slice(position, position + n);
            position += chunk.length;
            return new Bytes(chunk);
        };
        this.close = function () {};
    }
    RandomAccessFileReader.MAX_READ_BYTES = 10240;
    state.files = files;

    state.responses = [];
    var RESTResponseMgr = {
        createSuccess: function (body, status) { return { render: function () { state.responses.push({ status: status || 200, body: body }); } }; },
        createError: function (status, type, title, detail) {
            var error = { custom: {}, render: function () { state.responses.push({ status: status, type: type, title: title, detail: detail, custom: error.custom }); } };
            return error;
        }
    };

    var Coupon = { TYPE_SINGLE_CODE: 'SINGLE_CODE', TYPE_MULTIPLE_CODES: 'MULTIPLE_CODES', TYPE_SYSTEM_CODES: 'SYSTEM_CODES' };
    var CouponMgr = {
        getCoupon: function (id) {
            if (!state.coupons[id]) return null;
            return {
                isEnabled: function () { return state.coupons[id].enabled; },
                getType: function () { return state.coupons[id].type; },
                getRedemptionLimitPerCode: function () { return state.coupons[id].limit; },
                getNextCouponCode: function () {
                    if (!state.txDepth) throw new Error('getNextCouponCode needs a transaction');
                    var c = state.coupons[id];
                    var code = c.codes[c.issued] || null;
                    if (code) c.issued += 1;
                    return code;
                }
            };
        },
        getRedemptions: function (id, code) {
            var list = state.redemptions[code] || [];
            return { size: function () { return list.length; }, iterator: function () { return iterator(list); } };
        }
    };

    var Order = { ORDER_STATUS_CREATED: 0, ORDER_STATUS_NEW: 3, ORDER_STATUS_OPEN: 4, ORDER_STATUS_COMPLETED: 5, ORDER_STATUS_CANCELLED: 6, ORDER_STATUS_FAILED: 8, PAYMENT_STATUS_NOTPAID: 0, PAYMENT_STATUS_PAID: 2 };

    var mocks = {
        'dw/system/RESTResponseMgr': RESTResponseMgr,
        'dw/io/File': File,
        'dw/io/FileWriter': FileWriter,
        'dw/io/RandomAccessFileReader': RandomAccessFileReader,
        'dw/object/CustomObjectMgr': CustomObjectMgr,
        'dw/system/Transaction': { wrap: transactionWrap },
        'dw/system/Site': {
            getCurrent: function () {
                return {
                    getCustomPreferenceValue: function (id) { return Object.prototype.hasOwnProperty.call(preferences, id) ? preferences[id] : null; },
                    getDefaultCurrency: function () { return state.siteCurrency; }
                };
            }
        },
        'dw/system/Logger': { getLogger: logger },
        'dw/system/HookMgr': {
            hasHook: function (name) { return !!state.hooks[name]; },
            callHook: function (name, fn) { return state.hooks[name][fn].apply(null, Array.prototype.slice.call(arguments, 2)); }
        },
        'dw/system/Status': Object.assign(function (status, code, message) { this.status = status; this.code = code; this.message = message; }, { OK: 0, ERROR: 1 }),
        'dw/system/System': { PRODUCTION_SYSTEM: 2, getInstanceType: function () { return state.instanceType; } },
        'dw/crypto/SecureRandom': function () { this.nextBytes = function (n) { return new Bytes(crypto.randomBytes(n)); }; },
        'dw/crypto/Encoding': { toHex: function (bytes) { return bytes.buffer.toString('hex'); } },
        'dw/crypto/Mac': Object.assign(function () {
            this.digest = function (input, key) { return new Bytes(crypto.createHmac('sha256', String(key)).update(String(input), 'utf8').digest()); };
        }, { HMAC_SHA_256: 'HmacSHA256' }),
        'dw/crypto/MessageDigest': Object.assign(function () {
            this.digestBytes = function (bytes) { return new Bytes(crypto.createHash('sha256').update(bytes.buffer).digest()); };
        }, { DIGEST_SHA_256: 'SHA-256' }),
        'dw/util/Bytes': Bytes,
        'dw/util/Calendar': Calendar,
        'dw/svc/LocalServiceRegistry': {
            createService: function (id) {
                return { getConfiguration: function () { return { getCredential: function () { return secrets[id] ? { getPassword: function () { return secrets[id]; } } : null; } }; } };
            }
        },
        'dw/web/Resource': {
            msg: function (key, bundle, fallback) {
                if (bundle === 'luckydraw' && Object.prototype.hasOwnProperty.call(MESSAGES, key)) return MESSAGES[key];
                return fallback === null || fallback === undefined ? key : fallback;
            },
            msgf: function (key) { return key + ':' + Array.prototype.slice.call(arguments, 3).join('|'); }
        },
        'dw/value/Money': Money,
        'dw/util/StringUtils': {
            formatMoney: function (money) {
                var cents = Math.round(Math.abs(money.value) * 100);
                var text = '$' + Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(cents % 100 + 100).slice(1);
                return money.value < 0 ? '-' + text : text;
            }
        },
        'dw/catalog/ProductMgr': { getProduct: function (id) { return state.products[id] || null; } },
        'dw/campaign/Coupon': Coupon,
        'dw/campaign/CouponMgr': CouponMgr,
        'dw/content/ContentMgr': { getContent: function (id) { return state.content[id] || null; } },
        'dw/order/Order': Order,
        'dw/order/OrderMgr': {
            getOrder: function (no) { return state.orders[no] || null; },
            searchOrders: function (query, sort) {
                var args = Array.prototype.slice.call(arguments, 2);
                var rows = Object.keys(state.orders).map(function (k) { return state.orders[k]; }).filter(predicate(query, args));
                rows.sort(sorter(sort, function (row, name) { return row[name]; }));
                return iterator(rows);
            }
        },
        'dw/order/BasketMgr': { getCurrentBasket: function () { return state.basket || null; } },
        'dw/web/URLUtils': { url: function () { return Array.prototype.join.call(arguments, '/'); }, https: function () { return Array.prototype.join.call(arguments, '/'); } },
        'dw/customer/CustomerMgr': {
            getCustomerByCustomerNumber: function (no) {
                return {
                    profile: { customerNo: no, email: no.toLowerCase() + '@example.com', firstName: state.firstNames[no] || 'Alex' },
                    isMemberOfAnyCustomerGroup: function () {
                        var ids = Array.prototype.slice.call(arguments);
                        return (state.groups[no] || []).some(function (g) { return ids.indexOf(g) >= 0; });
                    }
                };
            }
        },
        '*/cartridge/scripts/helpers/basketCalculationHelpers': { calculateTotals: function () { state.recalculated = (state.recalculated || 0) + 1; } },
        '*/cartridge/scripts/helpers/emailHelpers': { sendEmail: function (mail, template, context) { state.mails.push({ mail: mail, template: template, context: context }); } }
    };
    Object.keys(active).forEach(function (k) { delete active[k]; });
    Object.assign(active, mocks, opts.mocks || {});
    Object.keys(require.cache).forEach(function (k) { if (k.indexOf(root) === 0) delete require.cache[k]; });
    global.session = { custom: {}, userName: 'admin', userAuthenticated: true };
    global.request = { custom: {} };

    return {
        db: db,
        state: state,
        preferences: preferences,
        Money: Money,
        File: File,
        require: function (rel) { return require(path.join(root, rel)); },
        mock: function (name) { return active[name]; },
        api: function (call) {
            global.customer = call.customer || { authenticated: false, registered: false };
            global.request = {
                getHttpParameterMap: function () {
                    return {
                        get: function (name) {
                            var q = call.query || {};
                            return { submitted: Object.prototype.hasOwnProperty.call(q, name), stringValue: q[name] };
                        },
                        getRequestBodyAsString: function () {
                            if (call.body === undefined) return '';
                            return typeof call.body === 'string' ? call.body : JSON.stringify(call.body);
                        }
                    };
                },
                getSCAPIPathParameters: function () { return { get: function (name) { return (call.path || {})[name]; } }; }
            };
            state.responses.length = 0;
        },
        get: function (type, key) { return active['dw/object/CustomObjectMgr'].getCustomObject(type, key); },
        create: function (type, key, fields) {
            var record = active['dw/object/CustomObjectMgr'].createCustomObject(type, key);
            Object.keys(fields || {}).forEach(function (name) { record.custom[name] = fields[name]; });
            return record;
        },
        rows: function (type) { return Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }); },
        customer: function (customerNo) {
            return { authenticated: true, registered: true, profile: { customerNo: customerNo, email: customerNo.toLowerCase() + '@example.com' } };
        }
    };
}

harness.messages = MESSAGES;

module.exports = harness;
