'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Smart commerce product compare', function () {
    function Collection(items) { this.items = items; }
    Collection.prototype.toArray = function () { return this.items; };
    function EnumValue(display) { this.displayValue = display; }
    function MarkupText(markup) { this.markup = markup; }

    var products;
    var compare;

    // Script API objects throw on unknown properties; mimic that for custom attributes.
    function strictCustom(values) {
        return new Proxy(values, {
            get: function (target, name) {
                if (!(name in target)) {
                    throw new Error('Unknown dynamic property ' + String(name));
                }
                return target[name];
            }
        });
    }

    function product(id, custom) {
        return {
            ID: id,
            online: true,
            custom: strictCustom(custom),
            describe: function () {
                return {
                    getCustomAttributeDefinition: function (attr) {
                        return ['metal', 'karatage', 'stone'].indexOf(attr) > -1 ? { displayName: attr.toUpperCase() } : null;
                    }
                };
            }
        };
    }

    beforeEach(function () {
        products = {
            ring: product('ring', { metal: new EnumValue('Gold'), karatage: 22, stone: new Collection([new EnumValue('Ruby'), new EnumValue('Pearl')]) }),
            band: product('band', { metal: new EnumValue('Platinum'), karatage: null, stone: new MarkupText('<b>None</b>') })
        };
        compare = proxyquire('../../../cartridges/plugin_smartcommerce/cartridge/scripts/productCompare', {
            'dw/catalog/ProductMgr': { getProduct: function (id) { return products[id] || null; } },
            'dw/order/ShippingMgr': {
                getProductShippingModel: function () {
                    return { getApplicableShippingMethods: function () { return new Collection([{ displayName: 'Ground', custom: { storePickupEnabled: false, estimatedArrivalTime: '2 days' } }]); } };
                }
            },
            'dw/system/Site': { current: { getCustomPreferenceValue: function () { return 'metal, karatage, stone, typoAttribute'; } } },
            'dw/web/URLUtils': { url: function () { return '/pdp'; } },
            'dw/util/Collection': Collection,
            'dw/value/EnumValue': EnumValue,
            'dw/content/MarkupText': MarkupText,
            '*/cartridge/scripts/factories/product': {
                get: function (params) { return { productName: params.pid, price: {}, availability: { messages: ['In Stock'] }, promotions: [] }; }
            }
        });
    });

    it('needs at least two distinct products and caps at four', function () {
        assert.isNull(compare.build('ring'));
        assert.isNull(compare.build('ring,ring'));
        assert.lengthOf(compare.build('ring,band,missing').columns, 2);
    });

    it('renders enum, collection, number and markup values and skips undefined attributes', function () {
        var result = compare.build('ring,band');
        assert.deepEqual(result.rows.map(function (row) { return row.label; }), ['METAL', 'KARATAGE', 'STONE']);
        assert.deepEqual(result.rows[0].values, ['Gold', 'Platinum']);
        assert.deepEqual(result.rows[1].values, ['22', '']);
        assert.deepEqual(result.rows[2].values, ['Ruby, Pearl', '<b>None</b>']);
        assert.equal(result.columns[0].delivery, 'Ground (2 days)');
    });
});
