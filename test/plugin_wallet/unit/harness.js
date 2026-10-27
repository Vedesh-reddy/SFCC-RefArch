'use strict';

// In-memory Script API double for plugin_wallet. It models the parts the plugin relies on:
// unique custom object keys, transactions that roll back, bounded queries, site preferences,
// keyed hashing and secure randomness (backed by Node crypto).
var Module = require('module');
var path = require('path');
var crypto = require('crypto');

var root = path.resolve(__dirname, '../../../cartridges/plugin_wallet/cartridge');
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

/**
 * Bytes double holding a Buffer.
 * @param {*} value - string or Buffer
 * @returns {Object} bytes
 */
function Bytes(value) {
    this.buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    this.length = this.buffer.length;
}
Bytes.prototype.byteAt = function (i) { return this.buffer[i]; };

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
 * Turns "custom.a = {0} AND (custom.b != NULL OR custom.c <= {1})" into a predicate.
 * @param {string} condition - query
 * @param {Array} args - arguments
 * @returns {Function} row => boolean
 */
function predicate(condition, args) {
    var js = condition
        .replace(/custom\.(\w+)\s*(!=|>=|<=|=|<|>)\s*NULL/g, function (all, field, op) {
            return op === '=' ? '(row.custom.' + field + ' === null || row.custom.' + field + ' === undefined)' : '(row.custom.' + field + ' !== null && row.custom.' + field + ' !== undefined)';
        })
        .replace(/custom\.(\w+)\s*(!=|>=|<=|=|<|>)\s*\{(\d+)\}/g, function (all, field, op, index) {
            return 'compare(row.custom.' + field + ', args[' + index + '], "' + ({ '=': '===', '!=': '!==' }[op] || op) + '")';
        })
        .replace(/ AND /g, ' && ')
        .replace(/ OR /g, ' || ');
    var test = new Function('row', 'args', 'compare', 'return ' + js + ';'); // eslint-disable-line no-new-func
    return function (row) { return test(row, args, compare); };
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

/**
 * Reads attribute types from the plugin metadata, so tests fail on an attribute that is
 * missing from the metadata or written with the wrong type (as the platform would).
 * @returns {Object} typeId => {attributeId: type}
 */
function schema() {
    var fs = require('fs');
    var meta = path.resolve(__dirname, '../../../metadata/plugin_wallet/meta');
    var result = {};
    var co = fs.readFileSync(path.join(meta, 'custom-objecttype-definitions.xml'), 'utf8');
    co.split('<custom-type type-id="').slice(1).forEach(function (chunk) {
        var typeId = chunk.slice(0, chunk.indexOf('"'));
        var attrs = {};
        var key = /<key-definition attribute-id="([^"]+)"/.exec(chunk)[1];
        attrs[key] = 'string';
        chunk.replace(/<attribute-definition attribute-id="([^"]+)">[\s\S]*?<type>([^<]+)<\/type>/g, function (m, id, type) { attrs[id] = type; return m; });
        result[typeId] = attrs;
    });
    var sys = fs.readFileSync(path.join(meta, 'system-objecttype-extensions.xml'), 'utf8');
    sys.split('<type-extension type-id="').slice(1).forEach(function (chunk) {
        var typeId = chunk.slice(0, chunk.indexOf('"'));
        var attrs = {};
        chunk.replace(/<attribute-definition attribute-id="([^"]+)">[\s\S]*?<type>([^<]+)<\/type>/g, function (m, id, type) { attrs[id] = type; return m; });
        result[typeId] = attrs;
    });
    return result;
}
var SCHEMA = schema();

/**
 * Site preference defaults from the metadata, the way getCustomPreferenceValue returns them:
 * int and boolean values as such, the default enum value as an EnumValue-like {value}.
 * @returns {Object} preference ID => default value
 */
function preferenceDefaults() {
    var fs = require('fs');
    var xml = fs.readFileSync(path.resolve(__dirname, '../../../metadata/plugin_wallet/meta/system-objecttype-extensions.xml'), 'utf8');
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
require('fs').readFileSync(path.join(root, 'templates/resources/wallet.properties'), 'utf8').split('\n').forEach(function (line) {
    var index = line.indexOf('=');
    if (index > 0 && line.charAt(0) !== '#') MESSAGES[line.slice(0, index).trim()] = line.slice(index + 1).trim();
});

/**
 * @param {string} typeId - object type
 * @param {string} name - attribute
 * @param {*} value - value being written
 */
function checkType(typeId, name, value) {
    var type = SCHEMA[typeId] && SCHEMA[typeId][name];
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

/**
 * @param {string} typeId - object type
 * @param {Object} initial - initial values
 * @returns {Object} custom attribute bag that validates writes
 */
function typedCustom(typeId, initial) {
    var target = Object.assign({}, initial);
    return new Proxy(target, {
        set: function (obj, name, value) {
            checkType(typeId, name, value);
            obj[name] = value;
            return true;
        }
    });
}

function keyAttributes() {
    var fs = require('fs');
    var co = fs.readFileSync(path.resolve(__dirname, '../../../metadata/plugin_wallet/meta/custom-objecttype-definitions.xml'), 'utf8');
    var keys = {};
    co.split('<custom-type type-id="').slice(1).forEach(function (chunk) {
        keys[chunk.slice(0, chunk.indexOf('"'))] = /<key-definition attribute-id="([^"]+)"/.exec(chunk)[1];
    });
    return keys;
}

function harness(options) {
    var opts = options || {};
    var db = {};
    var keys = keyAttributes();
    var preferences = Object.assign({}, PREFERENCE_DEFAULTS, {
        walletEnabled: true,
        walletCurrency: 'USD',
        walletFamilyEnabled: true,
        walletStepUpThresholdCents: 1000000,
        walletFromEmail: 'no-reply@example.com'
    }, opts.preferences || {});
    var state = { orders: {}, instanceType: 0, mails: [], hooks: {}, products: {}, categories: {}, inventory: {}, logs: [], siteCurrency: 'USD' };

    function transactionWrap(fn) {
        var snapshot = {};
        Object.keys(db).forEach(function (id) { snapshot[id] = { row: db[id], custom: Object.assign({}, db[id].custom) }; });
        try {
            return fn();
        } catch (e) {
            Object.keys(db).forEach(function (id) { if (!(id in snapshot)) delete db[id]; });
            Object.keys(snapshot).forEach(function (id) {
                db[id] = snapshot[id].row;
                db[id].custom = typedCustom(db[id].type, snapshot[id].custom);
            });
            throw e;
        }
    }

    var CustomObjectMgr = {
        getCustomObject: function (type, key) { return db[type + ':' + key] || null; },
        createCustomObject: function (type, key) {
            var id = type + ':' + key;
            if (db[id]) throw new Error('UNIQUE_CONSTRAINT ' + id);
            var custom = {};
            custom[keys[type]] = key;
            db[id] = { type: type, custom: typedCustom(type, custom), getCustomObjectType: function () { return type; } };
            return db[id];
        },
        remove: function (obj) {
            Object.keys(db).forEach(function (id) { if (db[id] === obj) delete db[id]; });
        },
        queryCustomObjects: function (type, query, sort) {
            // platform quota api.query.customAttrExpr: at most 4 custom attribute expressions per query
            if ((String(query).match(/custom\.\w+/g) || []).length > 4) throw new Error('QuotaLimitExceededException api.query.customAttrExpr: ' + query);
            var args = Array.prototype.slice.call(arguments, 3);
            var test = predicate(query, args);
            var rows = Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }).filter(test);
            if (sort) {
                var parts = sort.split(/\s+/);
                var field = parts[0].replace(/^custom\./, '');
                var dir = parts[1] === 'desc' ? -1 : 1;
                rows.sort(function (a, b) {
                    var x = a.custom[field] instanceof Date ? a.custom[field].getTime() : a.custom[field];
                    var y = b.custom[field] instanceof Date ? b.custom[field].getTime() : b.custom[field];
                    if (x === y) return 0;
                    if (x === undefined || x === null) return -dir;
                    if (y === undefined || y === null) return dir;
                    return x < y ? -dir : dir;
                });
            }
            return iterator(rows);
        },
        getAllCustomObjects: function (type) {
            return iterator(Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }));
        }
    };

    var Site = {
        getCurrent: function () {
            return {
                getCustomPreferenceValue: function (id) { return Object.prototype.hasOwnProperty.call(preferences, id) ? preferences[id] : null; },
                getDefaultCurrency: function () { return state.siteCurrency; },
                getID: function () { return 'TestSite'; }
            };
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

    var secrets = Object.assign({ 'plugin-wallet.hmac': 'k'.repeat(40), 'plugin-wallet.webhook': 'w'.repeat(40) }, opts.secrets || {});

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
    File.CATALOGS = 'CATALOGS';
    File.prototype.exists = function () { return this.fullPath in files || Object.keys(files).some(function (p) { return p.indexOf(this.fullPath + '/') === 0; }, this) || !!files[this.fullPath + '/'] ; };
    File.prototype.isFile = function () { return Buffer.isBuffer(files[this.fullPath]); };
    File.prototype.isDirectory = function () { return !this.isFile(); };
    File.prototype.mkdirs = function () { files[this.fullPath + '/'] = true; return true; };
    File.prototype.length = function () { return Buffer.isBuffer(files[this.fullPath]) ? files[this.fullPath].length : 0; };
    File.prototype.remove = function () { var had = this.fullPath in files; delete files[this.fullPath]; return had; };
    File.prototype.renameTo = function (target) { files[target.fullPath] = files[this.fullPath]; delete files[this.fullPath]; return true; };
    File.prototype.copyTo = function (target) { files[target.fullPath] = Buffer.from(files[this.fullPath]); return target; };
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
        createSuccess: function (body, status) {
            return { render: function () { state.responses.push({ status: status || 200, body: body }); } };
        },
        createError: function (status, type, title, detail) {
            var error = { custom: {}, render: function () { state.responses.push({ status: status, type: type, title: title, detail: detail, custom: error.custom }); } };
            return error;
        }
    };

    var mocks = {
        'dw/system/RESTResponseMgr': RESTResponseMgr,
        'dw/io/File': File,
        'dw/io/FileWriter': FileWriter,
        'dw/io/RandomAccessFileReader': RandomAccessFileReader,
        'dw/object/CustomObjectMgr': CustomObjectMgr,
        'dw/system/Transaction': { wrap: transactionWrap, begin: function () {}, commit: function () {}, rollback: function () {} },
        'dw/system/Site': Site,
        'dw/system/Logger': { getLogger: logger },
        'dw/system/HookMgr': {
            hasHook: function (name) { return !!state.hooks[name]; },
            callHook: function (name, fn) { return state.hooks[name][fn].apply(null, Array.prototype.slice.call(arguments, 2)); }
        },
        'dw/system/Status': function (status, code, message) { this.status = status; this.code = code; this.message = message; },
        'dw/crypto/SecureRandom': function () {
            this.nextBytes = function (n) { return new Bytes(crypto.randomBytes(n)); };
            this.nextInt = function (n) { return crypto.randomInt(n); };
        },
        'dw/crypto/Encoding': {
            toHex: function (bytes) { return bytes.buffer.toString('hex'); },
            toBase64: function (bytes) { return bytes.buffer.toString('base64'); }
        },
        'dw/crypto/Mac': Object.assign(function () {
            this.digest = function (input, key) { return new Bytes(crypto.createHmac('sha256', String(key)).update(String(input), 'utf8').digest()); };
        }, { HMAC_SHA_256: 'HmacSHA256' }),
        'dw/crypto/MessageDigest': Object.assign(function () {
            var hash = crypto.createHash('sha256');
            this.digestBytes = function (bytes) { return new Bytes(crypto.createHash('sha256').update(bytes.buffer).digest()); };
            this.updateBytes = function (bytes) { hash.update(bytes.buffer); };
            this.digest = function () { return new Bytes(hash.digest()); };
        }, { DIGEST_SHA_256: 'SHA-256' }),
        'dw/util/Bytes': Bytes,
        'dw/svc/LocalServiceRegistry': {
            createService: function (id) {
                return {
                    getConfiguration: function () {
                        return { getCredential: function () { return secrets[id] ? { getPassword: function () { return secrets[id]; } } : null; } };
                    },
                    call: function () { return { ok: false, error: 503 }; }
                };
            }
        },
        'dw/web/Resource': {
            msg: function (key, bundle, fallback) {
                if (bundle === 'wallet' && Object.prototype.hasOwnProperty.call(MESSAGES, key)) return MESSAGES[key];
                return fallback === null || fallback === undefined ? key : fallback;
            },
            msgf: function (key) { return key + ':' + Array.prototype.slice.call(arguments, 3).join('|'); }
        },
        'dw/value/Money': Money,
        'dw/catalog/ProductMgr': { getProduct: function (id) { return state.products[id] || null; } },
        'dw/catalog/CatalogMgr': { getCategory: function (id) { return state.categories[id] || null; } },
        'dw/catalog/ProductInventoryMgr': {
            getInventoryList: function (id) {
                var list = state.inventory[id];
                if (!list) return null;
                return { getRecord: function (p) { var key = typeof p === 'string' ? p : p.ID; return list[key] !== undefined ? { ATS: { value: list[key] } } : null; } };
            }
        },
        'dw/order/OrderMgr': {
            getOrder: function (no) { return state.orders[no] || null; },
            searchOrder: function () { return null; }
        },
        'dw/order/BasketMgr': { getCurrentBasket: function () { throw new Error('BasketMgr must not be used here'); } },
        'dw/system/System': { PRODUCTION_SYSTEM: 2, STAGING_SYSTEM: 1, DEVELOPMENT_SYSTEM: 0, getInstanceType: function () { return state.instanceType; } },
        'dw/util/StringUtils': {
            formatMoney: function (money) {
                var cents = Math.round(Math.abs(money.value) * 100);
                var text = '$' + Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + String(cents % 100 + 100).slice(1);
                return money.value < 0 ? '-' + text : text;
            }
        },
        'dw/order/Order': { ORDER_STATUS_CREATED: 0, ORDER_STATUS_NEW: 3, ORDER_STATUS_OPEN: 4, ORDER_STATUS_COMPLETED: 5, ORDER_STATUS_CANCELLED: 6, ORDER_STATUS_FAILED: 8, PAYMENT_STATUS_NOTPAID: 0, PAYMENT_STATUS_PAID: 2, SHIPPING_STATUS_SHIPPED: 2 },
        'dw/order/Basket': function Basket() {},
        'dw/order/TaxMgr': { defaultTaxClassID: 'standard' },
        'dw/campaign/PromotionMgr': { applyDiscounts: function () { state.discounts = (state.discounts || 0) + 1; } },
        'dw/web/URLUtils': { url: function () { return Array.prototype.join.call(arguments, '/'); }, https: function () { return Array.prototype.join.call(arguments, '/'); } },
        'dw/customer/CustomerMgr': { getCustomerByCustomerNumber: function (no) { return { profile: { customerNo: no, email: no.toLowerCase() + '@example.com' } }; } },
        '*/cartridge/scripts/helpers/basketCalculationHelpers': { calculateTotals: function () { state.recalculated = (state.recalculated || 0) + 1; } },
        '*/cartridge/scripts/helpers/emailHelpers': { sendEmail: function (mail, template, context) { state.mails.push({ mail: mail, template: template, context: context }); } }
    };
    Object.keys(active).forEach(function (k) { delete active[k]; });
    Object.assign(active, mocks, opts.mocks || {});
    Object.keys(require.cache).forEach(function (k) { if (k.indexOf(root) === 0) delete require.cache[k]; });
    global.session = { custom: {}, sessionID: 'session-1', userName: 'admin', userAuthenticated: true };
    global.request = { custom: {} };

    return {
        db: db,
        state: state,
        preferences: preferences,
        Money: Money,
        Bytes: Bytes,
        Basket: mocks['dw/order/Basket'],
        File: File,
        require: function (rel) { return require(path.join(root, rel)); },
        typedCustom: typedCustom,
        mock: function (name) { return active[name]; },
        get: function (type, key) { return CustomObjectMgr.getCustomObject(type, key); },
        create: function (type, key, fields) {
            var record = CustomObjectMgr.createCustomObject(type, key);
            Object.keys(fields || {}).forEach(function (name) { record.custom[name] = fields[name]; });
            return record;
        },
        /**
         * Sets the request and customer globals of a Custom API call.
         * @param {Object} call - {customer, query, path, body}
         */
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
        rows: function (type) { return Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }); },
        customer: function (customerNo) {
            return { authenticated: true, registered: true, profile: { customerNo: customerNo, email: customerNo.toLowerCase() + '@example.com' } };
        }
    };
}

harness.messages = MESSAGES;

module.exports = harness;
