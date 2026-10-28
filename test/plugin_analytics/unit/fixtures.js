'use strict';

var crypto = require('crypto');
var harness = require('./harness');

var collection = harness.collection;

/**
 * @param {Object} h - harness
 * @param {string} id - product ID
 * @param {Object} [opts] - {category, master, name, online}
 * @returns {Object} product double
 */
function product(h, id, opts) {
    var o = opts || {};
    var master = o.master ? h.state.products[o.master] : null;
    h.state.products[id] = {
        ID: id,
        name: o.name || 'Product ' + id,
        online: o.online !== false,
        variant: !!master,
        variationGroup: false,
        optionProduct: false,
        masterProduct: master,
        primaryCategory: o.category ? { ID: o.category } : null,
        classificationCategory: null
    };
    return h.state.products[id];
}

/**
 * @param {Object} h - harness
 * @param {string} id - category ID
 * @param {string} [parentId] - parent
 */
function category(h, id, parentId) {
    h.state.categories[id] = { ID: id, displayName: 'Category ' + id, root: false, parent: parentId ? { ID: parentId, root: false } : { ID: 'root', root: true } };
}

/**
 * @param {Object} h - harness
 * @param {Array} lines - [productId, quantity, unitPrice]
 * @param {Object} [opts] - {uuid}
 * @returns {Object} basket double, also set as the current basket
 */
function basket(h, lines, opts) {
    var items = lines.map(function (l, i) {
        return { UUID: 'pli-' + i, productID: l[0], quantityValue: l[1], basePrice: new h.Money(l[2]) };
    });
    var total = lines.reduce(function (sum, l) { return sum + l[1] * l[2]; }, 0);
    h.state.basket = {
        UUID: (opts && opts.uuid) || 'basket-1',
        productLineItems: collection(items),
        allProductLineItems: collection(items),
        totalGrossPrice: new h.Money(total),
        defaultShipment: { shippingMethodID: 'standard', shippingAddress: { countryCode: { value: 'US' }, firstName: 'Jane', address1: '1 Main St' } },
        shipments: collection([{}]),
        paymentInstruments: collection([{ paymentMethod: 'CREDIT_CARD', creditCardNumber: '4111111111111111' }])
    };
    return h.state.basket;
}

/**
 * @param {Object} h - harness
 * @param {string} no - order number
 * @param {Object} opts - {lines: [[productId, qty, gross, net]], status, paymentStatus, shipping, tax, created, invoices, currency, custom}
 * @returns {Object} order double
 */
function order(h, no, opts) {
    var lines = (opts.lines || []).map(function (l) {
        return { productID: l[0], product: h.state.products[l[0]] || null, quantityValue: l[1], price: new h.Money(l[2]), proratedPrice: new h.Money(l[3] === undefined ? l[2] : l[3]) };
    });
    var net = lines.reduce(function (sum, l) { return sum + l.proratedPrice.value; }, 0);
    var shipping = opts.shipping || 0;
    var tax = opts.tax || 0;
    var record = {
        orderNo: no,
        orderToken: 'token-' + no,
        status: { value: opts.status === undefined ? 3 : opts.status },
        paymentStatus: { value: opts.paymentStatus === undefined ? 0 : opts.paymentStatus },
        currencyCode: opts.currency || 'USD',
        creationDate: opts.created || new Date(),
        lastModified: opts.modified || opts.created || new Date(),
        productLineItems: collection(lines),
        totalGrossPrice: new h.Money(net + shipping + tax),
        adjustedShippingTotalPrice: new h.Money(shipping),
        totalTax: new h.Money(tax),
        invoices: collection((opts.invoices || []).map(function (i) { return { type: { value: i[0] }, refundedAmount: new h.Money(i[1]) }; }))
    };
    record.custom = harness.typedCustom('Order', opts.custom || {}, function () { record.lastModified = new Date(); });
    h.state.orders[no] = record;
    return record;
}

/**
 * Sends one beacon through Analytics-Collect.
 * @param {Object} h - harness
 * @param {Array} events - browser events
 * @param {Object} [opts] - {batchId, headers, body}
 * @returns {Object} response
 */
function beacon(h, events, opts) {
    var o = opts || {};
    h.state.body = o.body !== undefined ? o.body : JSON.stringify({ b: o.batchId || crypto.randomBytes(12).toString('hex'), e: events });
    h.state.headers = o.headers;
    return h.run('Collect', {});
}

/**
 * @param {Object} h - harness
 * @returns {Object} job steps
 */
function jobs(h) {
    return h.require('scripts/jobs/analytics');
}

module.exports = {
    product: product,
    category: category,
    basket: basket,
    order: order,
    beacon: beacon,
    jobs: jobs
};
