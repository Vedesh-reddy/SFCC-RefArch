'use strict';

// Small in-memory Script API double. It verifies domain transitions, not SFCC isolation.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var root = path.resolve(__dirname, '../../../cartridges/plugin_socialgifting/cartridge');
function harness() {
    var db = {};
    var lists = {};
    var products = {};
    var modules = {};
    var preferences = { SocialGiftingEnabled: true, WeddingRegistryEnabled: true, GroupGiftingEnabled: true,
        RegistryCommentsEnabled: true, RegistryPollsEnabled: true, RegistryReservationEnabled: true, RegistryPurchaseEnabled: true,
        AnonymousGiftingEnabled: true, GuestVotingEnabled: true, customerServiceEmail: 'shop@example.test' };
    var counter = 0;
    var closed = 0;
    var csrfValid = true;
    function array(values) { Object.defineProperty(values, 'toArray', { value: function () { return values.slice(); } }); return values; }
    function transaction(fn) {
        var snapshots = {};
        Object.keys(db).forEach(function (key) { snapshots[key] = structuredClone(db[key].custom); });
        try { return fn(); } catch (error) {
            Object.keys(db).forEach(function (key) { if (!(key in snapshots)) delete db[key]; else db[key].custom = snapshots[key]; });
            throw error;
        }
    }
    function Decimal(value) {
        if (value instanceof Decimal) { this.units = value.units; return; }
        var text = String(value || '0');
        var negative = text.charAt(0) === '-';
        var parts = text.replace(/^-/, '').split('.');
        this.units = (BigInt(parts[0]) * 1000000n + BigInt(((parts[1] || '') + '000000').slice(0, 6))) * (negative ? -1n : 1n);
    }
    Decimal.from = function (units) { var result = new Decimal(0); result.units = units; return result; };
    Decimal.prototype.add = function (b) { return Decimal.from(this.units + new Decimal(b).units); };
    Decimal.prototype.subtract = function (b) { return Decimal.from(this.units - new Decimal(b).units); };
    Decimal.prototype.multiply = function (b) { return Decimal.from(this.units * new Decimal(b).units / 1000000n); };
    Decimal.prototype.equals = function (b) { return this.units === b.units; };
    Decimal.prototype.toString = function () {
        var units = this.units < 0 ? -this.units : this.units;
        var fraction = String(units % 1000000n).padStart(6, '0').replace(/0+$/, '');
        return (this.units < 0 ? '-' : '') + String(units / 1000000n) + (fraction ? '.' + fraction : '');
    };
    function list(customer) {
        var record = { ID: 'list-' + (++counter), owner: customer, custom: {}, productItems: array([]),
            getItem: function (id) { return this.productItems.filter(function (item) { return item.ID === id; })[0]; },
            createProductItem: function (selectedProduct) {
                var item = { ID: 'item-' + (++counter), productID: selectedProduct.ID, product: selectedProduct, custom: {}, priority: 1,
                    setQuantityValue: function (value) { this.quantityValue = value; }, setPriority: function (value) { this.priority = value; } };
                this.productItems.push(item); return item;
            } };
        lists[record.ID] = record; return record;
    }
    var customMgr = {
        getCustomObject: function (type, key) { return db[type + ':' + key] || null; },
        createCustomObject: function (type, key) {
            var id = type + ':' + key;
            if (db[id]) throw new Error('UNIQUE_CONSTRAINT');
            db[id] = { UUID: id, custom: {}, creationDate: new Date(), lastModified: new Date() }; return db[id];
        },
        remove: function (record) { delete db[record.UUID]; },
        queryCustomObjects: function (type, query) {
            var args = Array.prototype.slice.call(arguments, 3);
            var expression = query.replace(/custom\.(\w+)/g, 'c.$1').replace(/\{(\d+)\}/g, 'args[$1]').replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/(?<![<>!])=(?!=)/g, '===');
            expression = expression.replace(/c\.(\w+) (<=|>=|<|>) args\[(\d+)\]/g, '(c.$1 != null && c.$1 $2 args[$3])');
            // Test-only evaluator of hardcoded cartridge queries, never external input.
            // eslint-disable-next-line no-new-func
            var check = new Function('c', 'args', 'return ' + expression);
            var results = Object.keys(db).filter(function (key) { return key.indexOf(type + ':') === 0 && check(db[key].custom, args); }).map(function (key) { return db[key]; });
            var offset = 0;
            return { hasNext: function () { return offset < results.length; }, next: function () { return results[offset++]; }, close: function () { closed++; } };
        }
    };
    var platform = {
        'dw/customer/CustomerMgr': { getCustomerByCustomerNumber: function () { return { profile: { firstName: 'Collaborator', email: 'member@example.test' } }; } },
        '*/cartridge/scripts/helpers/emailHelpers': { sendEmail: function () {} },
        'dw/object/CustomObjectMgr': customMgr,
        'dw/system/Transaction': { wrap: transaction },
        'dw/system/Site': { current: { getCustomPreferenceValue: function (name) { return preferences[name]; } } },
        'dw/customer/ProductList': { TYPE_GIFT_REGISTRY: 11 },
        'dw/customer/ProductListMgr': { createProductList: list, getProductList: function (id) { return lists[id]; }, getProductLists: function (customer) { return Object.values(lists).filter(function (value) { return value.owner === customer; }); } },
        'dw/catalog/ProductMgr': { getProduct: function (pid) { return products[pid] || null; } },
        'dw/crypto/SecureRandom': function () { this.nextBytes = crypto.randomBytes; },
        'dw/crypto/Encoding': { toHex: function (value) { return value.toString('hex'); } },
        'dw/util/Bytes': function (value) { return Buffer.from(value); },
        'dw/crypto/MessageDigest': function () { this.digestBytes = function (value) { return crypto.createHash('sha256').update(value).digest(); }; },
        'dw/util/Decimal': Decimal,
        'dw/util/Currency': { getCurrency: function (code) { return ['INR', 'USD', 'JPY', 'KWD'].includes(code) ? { defaultFractionDigits: { INR: 2, USD: 2, JPY: 0, KWD: 3 }[code] } : null; } },
        'dw/web/URLUtils': { https: function (route) { return { toString: function () { return 'https://example.test/' + route; } }; } },
        'dw/web/Resource': { msg: function (key, bundle, fallback) { return fallback || key; } },
        'dw/system/Logger': { getLogger: function () { return { error: function () {}, warn: function () {} }; } },
        'dw/web/CSRFProtection': { validateRequest: function () { return csrfValid; } },
        'dw/order/Order': { PAYMENT_STATUS_PAID: 2, ORDER_STATUS_NEW: 0, ORDER_STATUS_OPEN: 4, ORDER_STATUS_COMPLETED: 5, ORDER_STATUS_CANCELLED: 6 },
        'dw/system/HookMgr': { hasHook: function () { return false; } },
        'dw/system/Status': function (value) { this.status = value; }
    };
    platform['dw/system/Status'].OK = 0; platform['dw/system/Status'].ERROR = 1;
    function load(relative, superModule) {
        var file = path.resolve(root, relative);
        if (!file.endsWith('.js')) file += '.js';
        if (modules[file]) return modules[file].exports;
        var module = { exports: {}, superModule: superModule };
        modules[file] = module;
        function requireModule(name) {
            if (name in platform) return platform[name];
            if (name.indexOf('*/cartridge/') === 0) return load(name.slice(12));
            if (name.charAt(0) === '.') return load(path.relative(root, path.resolve(path.dirname(file), name)));
            throw new Error('Unmocked module ' + name);
        }
        vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})', { Date: Date, console: console }, { filename: file })(requireModule, module, module.exports);
        return module.exports;
    }
    function actor(number) {
        var customer = { profile: { customerNo: number, email: number + '@example.test' }, addressBook: { getAddress: function () { return {}; } } };
        return { customer: customer, customerNo: number, actorHash: number || 'guest-session', currency: 'INR' };
    }
    function product(id, master) { products[id] = { ID: id, name: id, online: true, master: !!master,
        priceModel: { price: { available: true, currencyCode: 'INR', decimalValue: new Decimal('1000'), toFormattedString: function () { return 'INR 1000'; } } }, getImage: function () { return null; } }; return products[id]; }
    return { load: load, db: db, lists: lists, products: products, product: product, actor: actor, preferences: preferences, platform: platform,
        setCSRF: function (value) { csrfValid = value; }, closed: function () { return closed; }, Decimal: Decimal };
}
module.exports = harness;
