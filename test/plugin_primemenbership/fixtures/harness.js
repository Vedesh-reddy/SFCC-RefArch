'use strict';

// In-memory Script API double for plugin_primemenbership. It models what the plugin relies on:
// unique custom object keys, transactions that roll back, the platform's query and creation
// quotas, temporary baskets, price adjustments, order states and the SFRA server module.
var Module = require('module');
var path = require('path');
var crypto = require('crypto');
var fs = require('fs');

var repo = path.resolve(__dirname, '../../..');
var root = path.join(repo, 'cartridges/plugin_primemenbership/cartridge');
var bmRoot = path.join(repo, 'cartridges/bm_primemenbership/cartridge');
var meta = path.join(repo, 'metadata/plugin_primemenbership/meta');
var active = {};
var superModules = {};
var original = Module._load; // eslint-disable-line no-underscore-dangle

function isOurs(file) {
    return file && (file.indexOf(root) === 0 || file.indexOf(bmRoot) === 0);
}

Module._load = function (request, parent, isMain) { // eslint-disable-line no-underscore-dangle
    var ours = parent && isOurs(parent.filename);
    if (ours && active[request]) return active[request];
    if (ours && /^[*~]\/cartridge\//.test(request)) {
        var target = request.slice(12);
        if (active['*/cartridge/' + target]) return active['*/cartridge/' + target];
        return original.call(this, path.join(root, target), parent, isMain);
    }
    return original.call(this, request, parent, isMain);
};

Object.defineProperty(Module.prototype, 'superModule', {
    configurable: true,
    get: function () { return superModules[path.basename(this.filename)] || null; }
});

function compare(a, b, op) {
    var left = a instanceof Date ? a.getTime() : a;
    var right = b instanceof Date ? b.getTime() : b;
    if (left === undefined) left = null;
    if (op === '===') return left === right;
    if (op === '!==') return left !== right;
    if (left === null || right === null) return false;
    if (op === '<') return left < right;
    if (op === '<=') return left <= right;
    if (op === '>') return left > right;
    return left >= right;
}

function predicate(condition, args) {
    var field = function (name) { return 'row.custom.' + name.replace(/^custom\./, ''); };
    var js = condition
        .replace(/(custom\.\w+)\s*(!=|=)\s*NULL/g, function (all, name, op) {
            var f = field(name);
            return op === '=' ? '(' + f + ' === null || ' + f + ' === undefined)' : '(' + f + ' !== null && ' + f + ' !== undefined)';
        })
        .replace(/(custom\.\w+)\s*(!=|>=|<=|=|<|>)\s*\{(\d+)\}/g, function (all, name, op, index) {
            return 'compare(' + field(name) + ', args[' + index + '], "' + ({ '=': '===', '!=': '!==' }[op] || op) + '")';
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

function sorter(sort) {
    var parts = sort.split(/\s+/);
    var name = parts[0].replace(/^custom\./, '');
    var dir = parts[1] === 'desc' ? -1 : 1;
    return function (a, b) {
        var x = a.custom[name];
        var y = b.custom[name];
        x = x instanceof Date ? x.getTime() : x;
        y = y instanceof Date ? y.getTime() : y;
        if (x === y) return 0;
        if (x === undefined || x === null) return -dir;
        if (y === undefined || y === null) return dir;
        return x < y ? -dir : dir;
    };
}

function schema() {
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

function preferenceDefaults() {
    var xml = fs.readFileSync(path.join(meta, 'system-objecttype-extensions.xml'), 'utf8');
    var result = {};
    xml.split('type-id="SitePreferences"')[1].replace(/<attribute-definition attribute-id="(\w+)">([\s\S]*?)<\/attribute-definition>/g, function (m, id, body) {
        var type = /<type>([^<]+)<\/type>/.exec(body)[1];
        var value = /<default-value>([^<]*)<\/default-value>/.exec(body);
        if (value && type === 'int') result[id] = Number(value[1]);
        else if (value && type === 'boolean') result[id] = value[1] === 'true';
        else if (value) result[id] = value[1];
        return m;
    });
    return result;
}
var PREFERENCE_DEFAULTS = preferenceDefaults();

var MESSAGES = {};
fs.readFileSync(path.join(root, 'templates/resources/primemembership.properties'), 'utf8').split('\n').forEach(function (line) {
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
        double: typeof value === 'number',
        boolean: typeof value === 'boolean',
        datetime: value instanceof Date
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

function Calendar(date) {
    this.ms = date ? date.getTime() : Date.now();
}
Calendar.MONTH = 2;
Calendar.prototype.setTimeZone = function () {};
Calendar.prototype.add = function (field, amount) {
    var d = new Date(this.ms);
    var day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + amount);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    this.ms = d.getTime();
};
Calendar.prototype.getTime = function () { return new Date(this.ms); };

function list(items) {
    var copy = items.slice();
    copy.toArray = function () { return items.slice(); };
    copy.iterator = function () { return iterator(items); };
    copy.contains = function (x) { return items.indexOf(x) >= 0; };
    copy.getLength = function () { return items.length; };
    return copy;
}

function Money(value, currencyCode) {
    this.value = value;
    this.currencyCode = currencyCode;
    this.available = value !== null && value !== undefined;
}
function moneyOf(cents) { return new Money(cents / 100, 'USD'); }

function adjustment(promotionID, cents) {
    return {
        promotionID: promotionID,
        price: moneyOf(-Math.abs(cents)),
        setLineItemText: function (text) { this.lineItemText = text; },
        setPriceValue: function (value) { this.price = moneyOf(Math.round(value * 100)); }
    };
}

function makeLine(h, spec) {
    var product = spec.product || h.state.products[spec.productID] || null;
    var line = {
        UUID: crypto.randomBytes(8).toString('hex'),
        productID: spec.productID,
        product: product,
        catalogProduct: !!product,
        bonusProductLineItem: !!spec.bonus,
        optionProductLineItem: false,
        bundledProductLineItem: false,
        quantityValue: spec.qty || 1,
        basePrice: moneyOf(spec.cents || 0),
        custom: spec.custom || {},
        adjustments: (spec.promotions || []).map(function (cents, i) { return adjustment('promo-' + i, cents); }),
        setProductName: function (name) { this.productName = name; },
        setLineItemText: function (text) { this.lineItemText = text; },
        setTaxClassID: function (id) { this.taxClassID = id; },
        setQuantityValue: function (q) { this.quantityValue = q; },
        setPriceValue: function (value) { this.basePrice = new Money(value, 'USD'); },
        getPriceAdjustmentByPromotionID: function (id) { return this.adjustments.filter(function (a) { return a.promotionID === id; })[0] || null; },
        removePriceAdjustment: function (a) { this.adjustments = this.adjustments.filter(function (x) { return x !== a; }); },
        // Like the platform: an adjustment has no price until setPriceValue, even with a discount argument.
        createPriceAdjustment: function (id) {
            if (this.getPriceAdjustmentByPromotionID(id)) throw new Error('duplicate adjustment ' + id);
            var a = adjustment(id, 0);
            this.adjustments.push(a);
            return a;
        }
    };
    Object.defineProperty(line, 'priceAdjustments', { get: function () { return list(line.adjustments); } });
    return line;
}

function makeAddress() {
    var address = {};
    ['FirstName', 'LastName', 'Address1', 'Address2', 'City', 'StateCode', 'PostalCode', 'CountryCode', 'Phone'].forEach(function (name) {
        address['set' + name] = function (value) { this[name.charAt(0).toLowerCase() + name.slice(1)] = value; };
    });
    return address;
}

function makeShipment(spec) {
    var s = spec || {};
    var shippingLine = {
        cents: s.cents === undefined ? 1000 : s.cents,
        adjustments: [],
        setPriceValue: function (value) { this.cents = Math.round(value * 100); },
        removeShippingPriceAdjustment: function (a) { this.adjustments = this.adjustments.filter(function (x) { return x !== a; }); },
        createShippingPriceAdjustment: function (id) {
            if (this.adjustments.some(function (x) { return x.promotionID === id; })) throw new Error('duplicate adjustment ' + id);
            var a = adjustment(id, 0);
            this.adjustments.push(a);
            return a;
        }
    };
    Object.defineProperty(shippingLine, 'shippingPriceAdjustments', { get: function () { return list(shippingLine.adjustments); } });
    Object.defineProperty(shippingLine, 'adjustedPrice', { get: function () { return moneyOf(shippingLine.cents - shippingLine.adjustments.reduce(function (sum, a) { return sum + Math.abs(Math.round(a.price.value * 100)); }, 0)); } });
    return {
        shippingMethod: s.methodID === null ? null : { ID: s.methodID || 'standard' },
        standardShippingLineItem: shippingLine,
        shippingAddress: s.country ? { countryCode: { value: s.country } } : null,
        gift: !!s.gift,
        createShippingAddress: function () {
            this.shippingAddress = makeAddress();
            return this.shippingAddress;
        }
    };
}

function Basket() {}

function makeBasket(h, spec) {
    var s = spec || {};
    var basket = new Basket();
    basket.UUID = crypto.randomBytes(8).toString('hex');
    basket.currencyCode = s.currency || 'USD';
    basket.customerNo = s.customerNo === undefined ? 'C1' : s.customerNo;
    basket.customer = s.customer !== undefined ? s.customer : {
        authenticated: s.authenticated !== false,
        registered: s.authenticated !== false,
        isMemberOfAnyCustomerGroup: function () { return (s.groups || []).some(function (g) { return Array.prototype.indexOf.call(arguments, g) >= 0; }); }
    };
    basket.custom = {};
    basket.lines = (s.lines || []).map(function (l) { return makeLine(h, l); });
    basket.shipmentList = [makeShipment(s.shipping)];
    basket.orderAdjustments = (s.orderPromotions || []).map(function (cents, i) { return adjustment('order-promo-' + i, cents); });
    basket.shippingOrderAdjustments = [];
    basket.couponCodes = s.coupons || [];
    basket.billingAddress = null;
    basket.paymentInstruments = [];
    basket.defaultShipment = basket.shipmentList[0];
    basket.getAllProductLineItems = function () { return list(this.lines); };
    Object.defineProperty(basket, 'productLineItems', { get: function () { return list(basket.lines); } });
    Object.defineProperty(basket, 'shipments', { get: function () { return list(basket.shipmentList); } });
    Object.defineProperty(basket, 'priceAdjustments', { get: function () { return list(basket.orderAdjustments); } });
    Object.defineProperty(basket, 'shippingPriceAdjustments', { get: function () { return list(basket.shippingOrderAdjustments); } });
    Object.defineProperty(basket, 'couponLineItems', { get: function () { return list(basket.couponCodes.map(function (code) { return { couponCode: code }; })); } });
    basket.removePriceAdjustment = function (a) { this.orderAdjustments = this.orderAdjustments.filter(function (x) { return x !== a; }); };
    basket.removeShippingPriceAdjustment = function (a) { this.shippingOrderAdjustments = this.shippingOrderAdjustments.filter(function (x) { return x !== a; }); };
    basket.createProductLineItem = function (productID) {
        var line = makeLine(h, { productID: productID });
        this.lines.push(line);
        return line;
    };
    basket.setCustomerEmail = function (email) { this.customerEmail = email; };
    basket.createBillingAddress = function () {
        this.billingAddress = makeAddress();
        return this.billingAddress;
    };
    return basket;
}

/**
 * What base calculate.js does, as far as the plugin can see: runs the tax hook (ours) and adds up.
 */
function calculate(h, basket) {
    h.calculateHook().calculateTax(basket);
    var net = basket.lines.reduce(function (sum, line) {
        var cents = Math.round(line.basePrice.value * 100) * line.quantityValue;
        return sum + cents - line.adjustments.reduce(function (s, a) { return s + Math.abs(Math.round(a.price.value * 100)); }, 0);
    }, 0);
    net += basket.shipmentList.reduce(function (sum, shipment) { return sum + Math.round(shipment.standardShippingLineItem.adjustedPrice.value * 100); }, 0);
    net -= basket.orderAdjustments.reduce(function (sum, a) { return sum + Math.abs(Math.round(a.price.value * 100)); }, 0);
    var tax = Math.round(net * h.state.taxRate);
    basket.totalNetPrice = moneyOf(net);
    basket.totalTax = moneyOf(tax);
    basket.totalGrossPrice = moneyOf(net + tax);
}

function harness(options) {
    var opts = options || {};
    var db = {};
    var preferences = Object.assign({}, PREFERENCE_DEFAULTS, {
        primeMembershipEnabled: true,
        primeMembershipPaymentMethods: ['CREDIT_CARD'],
        primeMembershipBillingCountries: ['US'],
        primeMembershipFromEmail: 'members@example.com'
    }, opts.preferences || {});
    var state = {
        orders: {}, mails: [], hooks: {}, products: {}, coupons: {}, content: {}, birthdays: {}, logs: [], siteCurrency: 'USD', taxRate: 0.1, nextOrder: 1000, creates: 0,
        tempBaskets: {}, forms: {}, rendered: null, declinePayment: false, fraud: 'success', placeFails: false, processorPays: false, emailFails: false, customers: {}
    };
    var h = { db: db, state: state, preferences: preferences, Money: Money, moneyOf: moneyOf };

    function transactionWrap(fn) {
        var snapshot = {};
        Object.keys(db).forEach(function (id) { snapshot[id] = { row: db[id], custom: Object.assign({}, db[id].custom) }; });
        try {
            return fn();
        } catch (e) {
            Object.keys(db).forEach(function (id) { if (!(id in snapshot)) delete db[id]; });
            Object.keys(snapshot).forEach(function (id) {
                var row = snapshot[id].row;
                db[id] = row;
                Object.keys(row.custom).forEach(function (k) { delete row.custom[k]; });
                Object.assign(row.custom, snapshot[id].custom);
            });
            throw e;
        }
    }

    var CustomObjectMgr = {
        getCustomObject: function (type, key) { return db[type + ':' + key] || null; },
        createCustomObject: function (type, key) {
            var id = type + ':' + key;
            if (db[id]) throw new Error('UNIQUE_CONSTRAINT ' + id);
            state.creates += 1;
            var custom = {};
            custom[SCHEMA.keys[type]] = key;
            db[id] = { type: type, custom: typedCustom(type, custom) };
            return db[id];
        },
        remove: function (obj) { Object.keys(db).forEach(function (id) { if (db[id] === obj) delete db[id]; }); },
        queryCustomObjects: function (type, query, sort) {
            if ((String(query).match(/custom\.\w+/g) || []).length > 4) throw new Error('QuotaLimitExceededException api.query.customAttrExpr: ' + query);
            var args = Array.prototype.slice.call(arguments, 3);
            var rows = Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }).filter(predicate(query, args));
            if (sort) rows.sort(sorter(sort));
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

    function Status(status, code, message) {
        this.status = status;
        this.code = code;
        this.message = message;
        this.isError = function () { return status === Status.ERROR; };
    }
    Status.OK = 0;
    Status.ERROR = 1;

    var Order = {
        ORDER_STATUS_CREATED: 0, ORDER_STATUS_NEW: 3, ORDER_STATUS_OPEN: 4, ORDER_STATUS_COMPLETED: 5, ORDER_STATUS_CANCELLED: 6, ORDER_STATUS_FAILED: 8,
        PAYMENT_STATUS_NOTPAID: 0, PAYMENT_STATUS_PAID: 2,
        CONFIRMATION_STATUS_NOTCONFIRMED: 0, CONFIRMATION_STATUS_CONFIRMED: 2,
        EXPORT_STATUS_NOTEXPORTED: 0, EXPORT_STATUS_READY: 2
    };

    function orderFromBasket(basket) {
        var orderNo = String(state.nextOrder++);
        var order = {
            orderNo: orderNo,
            customerNo: basket.customerNo,
            customerEmail: basket.customerEmail,
            currencyCode: basket.currencyCode,
            custom: Object.assign({}, basket.custom),
            status: { value: Order.ORDER_STATUS_CREATED },
            paymentStatus: { value: Order.PAYMENT_STATUS_NOTPAID },
            totalGrossPrice: basket.totalGrossPrice,
            totalNetPrice: basket.totalNetPrice,
            totalTax: basket.totalTax,
            lines: basket.lines,
            shipmentList: basket.shipmentList,
            getAllProductLineItems: function () { return list(basket.lines); },
            setConfirmationStatus: function (s) { this.confirmationStatus = s; },
            setExportStatus: function (s) { this.exportStatus = s; }
        };
        Object.defineProperty(order, 'shipments', { get: function () { return list(order.shipmentList); } });
        Object.defineProperty(order, 'productLineItems', { get: function () { return list(order.lines); } });
        Object.defineProperty(order, 'paymentInstruments', {
            get: function () {
                return list([{ paymentTransaction: { transactionID: 'pay-' + orderNo, amount: order.totalGrossPrice } }]);
            }
        });
        state.orders[orderNo] = order;
        delete state.tempBaskets[basket.UUID];
        return order;
    }

    var OrderMgr = {
        getOrder: function (no) { return state.orders[no] || null; },
        placeOrder: function (order) {
            if (state.placeFails) return new Status(Status.ERROR);
            order.status.value = Order.ORDER_STATUS_NEW;
            if (state.processorPays) order.paymentStatus.value = Order.PAYMENT_STATUS_PAID;
            return new Status(Status.OK);
        },
        failOrder: function (order) { order.status.value = Order.ORDER_STATUS_FAILED; }
    };

    superModules['checkoutHelpers.js'] = {
        createOrder: function (basket) {
            if (state.createOrderFails) return null;
            return orderFromBasket(basket);
        },
        handlePayments: function (order) {
            if (!state.declinePayment) return {};
            OrderMgr.failOrder(order);
            return { error: true };
        },
        placeOrder: function (order) {
            var status = OrderMgr.placeOrder(order);
            if (status.isError()) {
                OrderMgr.failOrder(order);
                return { error: true };
            }
            return { error: false };
        },
        calculatePaymentTransaction: function () { return { error: false }; },
        validatePayment: function () { return { error: false }; }
    };
    superModules['oAuthRenentryRedirectEndpoints.js'] = { 1: 'Account-Show', 9: 'LuckyDraw-Show' };

    state.hooks['app.payment.form.processor.basic_credit'] = {
        processForm: function (req, form, viewData) {
            if (form.invalidCard) return { error: true, fieldErrors: { number: 'invalid' } };
            viewData.paymentInformation = { cardNumber: { value: 'not-stored' } }; // eslint-disable-line no-param-reassign
            return { error: false, viewData: viewData };
        }
    };
    state.hooks['app.payment.processor.basic_credit'] = {
        Handle: function (basket) {
            basket.paymentInstruments.push({ method: 'CREDIT_CARD' });
            return { error: false, fieldErrors: {}, serverErrors: [] };
        }
    };

    function makeUrl(parts) {
        var text = Array.prototype.join.call(parts, '/');
        return { toString: function () { return text; }, append: function (k, v) { text += '?' + k + '=' + v; return this; } };
    }

    var mocks = {
        'dw/object/CustomObjectMgr': CustomObjectMgr,
        'dw/system/Transaction': { wrap: transactionWrap },
        'dw/system/Site': {
            getCurrent: function () {
                return {
                    getID: function () { return 'RefArch_Practice'; },
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
        'dw/system/Status': Status,
        'dw/crypto/SecureRandom': function () { this.nextBytes = function (n) { return crypto.randomBytes(n); }; },
        'dw/crypto/Encoding': { toHex: function (bytes) { return bytes.toString('hex'); } },
        'dw/util/Calendar': Calendar,
        'dw/web/Resource': {
            msg: function (key, bundle, fallback) {
                if (bundle === 'primemembership' && Object.prototype.hasOwnProperty.call(MESSAGES, key)) return MESSAGES[key];
                return fallback === null || fallback === undefined ? key : fallback;
            },
            msgf: function (key, bundle, fallback) {
                var args = Array.prototype.slice.call(arguments, 3);
                var text = bundle === 'primemembership' && MESSAGES[key] ? MESSAGES[key] : (fallback || key);
                return text.replace(/\{(\d)\}/g, function (m, i) { return args[i]; });
            }
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
        'dw/campaign/Coupon': { TYPE_SYSTEM_CODES: 'SYSTEM_CODES' },
        'dw/campaign/CouponMgr': {
            getCoupon: function (id) {
                var c = state.coupons[id];
                if (!c) return null;
                return {
                    isEnabled: function () { return c.enabled !== false; },
                    getType: function () { return c.type || 'SYSTEM_CODES'; },
                    getRedemptionLimitPerCode: function () { return c.limit === undefined ? 1 : c.limit; },
                    getNextCouponCode: function () { return c.codes.shift() || null; }
                };
            }
        },
        'dw/content/ContentMgr': { getContent: function (id) { return state.content[id] || null; } },
        'dw/order/Order': Order,
        'dw/order/OrderMgr': OrderMgr,
        'dw/order/Basket': Basket,
        'dw/order/TaxMgr': { getDefaultTaxClassID: function () { return 'standard'; } },
        'dw/order/PaymentMgr': { getPaymentMethod: function (id) { return { ID: id, paymentProcessor: { ID: 'BASIC_CREDIT' } }; } },
        'dw/order/BasketMgr': {
            getCurrentBasket: function () { return state.basket || null; },
            createTemporaryBasket: function () {
                if (Object.keys(state.tempBaskets).length >= 4) throw new Error('CreateTemporaryBasketLimitExceededException');
                var basket = makeBasket(h, { customerNo: state.sessionCustomerNo, currency: state.basketCurrency });
                state.tempBaskets[basket.UUID] = basket;
                return basket;
            },
            getTemporaryBasket: function (uuid) { return state.tempBaskets[uuid] || null; }
        },
        'dw/web/URLUtils': { url: function () { return makeUrl(arguments); }, https: function () { return makeUrl(arguments); }, staticURL: function () { return makeUrl(arguments); } },
        'dw/web/CSRFProtection': { getTokenName: function () { return 'csrf_token'; }, generateToken: function () { return 'token'; }, validateRequest: function () { return state.bmCsrfValid !== false; } },
        'dw/template/ISML': { renderTemplate: function (template, data) { state.rendered = { template: template, data: data }; } },
        'dw/template/Velocity': { render: function (template, data) { state.velocity = { template: template, data: data }; } },
        'dw/customer/CustomerMgr': {
            getCustomerByCustomerNumber: function (no) {
                if (state.customers[no] === null) return null;
                return { profile: { customerNo: no, email: no.toLowerCase() + '@example.com', birthday: state.birthdays[no] || null } };
            }
        },
        'dw/system/RESTResponseMgr': {
            createSuccess: function (body, status) { return { render: function () { state.response = { status: status || 200, body: body }; } }; },
            createError: function (status, type, title, detail) {
                var error = { custom: {}, render: function () { state.response = { status: status, type: type, title: title, detail: detail }; } };
                return error;
            }
        },
        '*/cartridge/scripts/helpers/basketCalculationHelpers': { calculateTotals: function (basket) { calculate(h, basket); } },
        '*/cartridge/scripts/helpers/emailHelpers': {
            sendEmail: function (mail, template, context) {
                if (state.emailFails) throw new Error('mail down');
                state.mails.push({ mail: mail, template: template, context: context });
            }
        },
        '*/cartridge/scripts/helpers/hooks': function (name, fn, arg, fallback) { return fallback(arg); },
        '*/cartridge/scripts/hooks/fraudDetection': { fraudDetection: function () { return { status: state.fraud }; } },
        '*/cartridge/scripts/middleware/csrf': {
            generateToken: function (req, res, next) { res.viewData.csrf = { tokenName: 'csrf_token', token: 'token' }; next(); },
            validateRequest: function (req, res, next) {
                if (req.csrfValid === false) {
                    res.redirectUrl = 'CSRF-Fail';
                    this.done(req, res);
                    return;
                }
                next();
            }
        }
    };

    // The SFRA server module: routes run their middleware chain the way server.js does.
    var routes = {};
    var serverDouble = {
        middleware: { https: function (req, res, next) { next(); } },
        forms: { getForm: function (name) { return state.forms[name] || { valid: false, clear: function () {} }; } },
        extend: function () {},
        get: function (name) { routes[name] = { method: 'GET', chain: Array.prototype.slice.call(arguments, 1) }; },
        post: function (name) { routes[name] = { method: 'POST', chain: Array.prototype.slice.call(arguments, 1) }; },
        prepend: function (name) { routes[name] = { method: 'PREPEND', chain: Array.prototype.slice.call(arguments, 1) }; },
        append: function (name) { routes[name] = { method: 'APPEND', chain: Array.prototype.slice.call(arguments, 1) }; },
        exports: function () { return routes; }
    };
    mocks.server = serverDouble;

    Object.keys(active).forEach(function (k) { delete active[k]; });
    Object.assign(active, mocks, opts.mocks || {});
    Object.keys(require.cache).forEach(function (k) { if (isOurs(k)) delete require.cache[k]; });
    global.session = { custom: {}, userName: 'admin', userAuthenticated: true, currency: { currencyCode: 'USD' } };
    global.request = { custom: {} };

    Object.assign(h, {
        Status: Status,
        Order: Order,
        require: function (rel) { return require(path.join(root, rel)); },
        requireBm: function (rel) { return require(path.join(bmRoot, rel)); },
        calculateHook: function () { return require(path.join(root, 'scripts/hooks/membershipCalculate.js')); },
        calculate: function (basket) { calculate(h, basket); },
        basket: function (spec) { return makeBasket(h, spec); },
        orderFromBasket: orderFromBasket,
        mock: function (name) { return active[name]; },
        get: function (type, key) { return CustomObjectMgr.getCustomObject(type, key); },
        rows: function (type) { return Object.keys(db).filter(function (id) { return db[id].type === type; }).map(function (id) { return db[id]; }); },
        create: function (type, key, fields) {
            var record = CustomObjectMgr.createCustomObject(type, key);
            Object.keys(fields || {}).forEach(function (name) { record.custom[name] = fields[name]; });
            return record;
        },
        /**
         * Runs a controller route the way server.js does.
         * @param {string} controller - controller file name
         * @param {string} name - route
         * @param {Object} [input] - {customerNo, query, form, csrfValid}
         * @returns {Object} response double
         */
        route: function (controller, name, input) {
            var inp = input || {};
            Object.keys(routes).forEach(function (k) { delete routes[k]; });
            delete require.cache[path.join(root, 'controllers', controller + '.js')];
            require(path.join(root, 'controllers', controller + '.js'));
            var flash = state.flash || {};
            state.flash = flash;
            var req = {
                currentCustomer: inp.customerNo ? { profile: { customerNo: inp.customerNo }, raw: { authenticated: inp.authenticated !== false, registered: true } } : { profile: null, raw: { authenticated: false } },
                querystring: inp.query || {},
                form: inp.form || {},
                csrfValid: inp.csrfValid,
                geolocation: { countryCode: 'US' },
                locale: { id: 'en_US' },
                session: { privacyCache: { get: function (k) { return flash[k] === undefined ? null : flash[k]; }, set: function (k, v) { flash[k] = v; } } }
            };
            var res = {
                viewData: {},
                statusCode: 200,
                render: function (template, data) { this.template = template; this.data = Object.assign({}, this.viewData, data || {}); },
                redirect: function (url) { this.redirectUrl = String(url); },
                json: function (data) { this.jsonData = data; },
                setStatusCode: function (code) { this.statusCode = code; },
                getViewData: function () { return this.viewData; },
                setViewData: function (d) { Object.assign(this.viewData, d); }
            };
            var route = routes[name];
            if (!route) throw new Error('No route ' + controller + '-' + name);
            res.routeMethod = route.method;
            var ctx = { done: function () { res.halted = true; } };
            var step = function (index) {
                if (index >= route.chain.length) {
                    res.completed = true;
                    return undefined;
                }
                return route.chain[index].call(ctx, req, res, function () { return step(index + 1); });
            };
            step(0);
            return res;
        }
    });
    return h;
}

harness.messages = MESSAGES;
harness.SCHEMA = SCHEMA;
harness.repo = repo;

module.exports = harness;
