'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var harness = require('./harness');

var SCRIPT = fs.readFileSync(path.join(harness.repo, 'cartridges/plugin_analytics/cartridge/client/default/js/analytics.js'), 'utf8');

/**
 * Minimal element double: tag, classes, attributes, tree, and the simple selectors the
 * script uses (tag, .class, [attr], comma lists).
 * @param {string} tag - tag name
 * @param {Object} [attrs] - attributes, "class" included
 */
function Element(tag, attrs) {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.attributes = Object.assign({}, attrs || {});
    this.children = [];
    this.parentNode = null;
    var self = this;
    this.classList = { contains: function (c) { return (self.attributes.class || '').split(' ').indexOf(c) >= 0; } };
}
Element.prototype.append = function (child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
};
Element.prototype.getAttribute = function (n) { return Object.prototype.hasOwnProperty.call(this.attributes, n) ? this.attributes[n] : null; };
Element.prototype.hasAttribute = function (n) { return Object.prototype.hasOwnProperty.call(this.attributes, n); };
Element.prototype.setAttribute = function (n, v) { this.attributes[n] = String(v); };
Element.prototype.matches = function (selector) {
    var self = this;
    return selector.split(',').some(function (part) {
        var simple = part.trim();
        var tag = /^[a-z]+/.exec(simple);
        if (tag && self.tagName !== tag[0].toUpperCase()) return false;
        var classes = (simple.match(/\.[\w-]+/g) || []).map(function (c) { return c.slice(1); });
        var attrs = (simple.match(/\[[\w-]+\]/g) || []).map(function (a) { return a.slice(1, -1); });
        return classes.every(function (c) { return self.classList.contains(c); }) && attrs.every(function (a) { return self.hasAttribute(a); });
    });
};
Element.prototype.closest = function (selector) {
    for (var node = this; node; node = node.parentNode) if (node.matches && node.matches(selector)) return node;
    return null;
};
Element.prototype.querySelectorAll = function (selector) {
    var found = [];
    (function walk(node) {
        node.children.forEach(function (child) {
            if (child.matches(selector)) found.push(child);
            walk(child);
        });
    }(this));
    return found;
};

/**
 * Loads the storefront script into a fake page.
 * @param {Object} page - page context
 * @param {Function} build - (body) => adds markup
 * @returns {Object} {beacons, see(tile), click(element), hide(), body}
 */
function load(page, build) {
    var body = new Element('body');
    var config = body.append(new Element('div', { id: 'analytics-config', 'data-url': '/Analytics-Collect', 'data-batch-size': '20', 'data-page': JSON.stringify(page) }));
    build(body);
    var listeners = {};
    var observed = [];
    var observerCallback = null;
    var beacons = [];
    var timers = [];
    var sandbox = {
        document: {
            body: body,
            visibilityState: 'visible',
            getElementById: function (id) { return id === 'analytics-config' ? config : null; },
            querySelectorAll: function (selector) { return body.querySelectorAll(selector); },
            addEventListener: function (type, fn) { listeners[type] = (listeners[type] || []).concat([fn]); }
        },
        navigator: { sendBeacon: function (url, blob) { beacons.push({ url: url, body: JSON.parse(blob.text) }); return true; } },
        Blob: function (parts, options) { this.text = parts.join(''); this.type = options.type; },
        Uint8Array: Uint8Array,
        crypto: { getRandomValues: function (a) { return require('crypto').randomFillSync(a); } },
        IntersectionObserver: function (callback) {
            observerCallback = callback;
            this.observe = function (el) { observed.push(el); };
            this.unobserve = function (el) { observed.splice(observed.indexOf(el), 1); };
        },
        setTimeout: function (fn) { timers.push(fn); return timers.length; },
        clearTimeout: function () {},
        addEventListener: function (type, fn) { listeners['window:' + type] = (listeners['window:' + type] || []).concat([fn]); },
        Date: Date,
        JSON: JSON,
        Math: Math,
        Array: Array,
        parseInt: parseInt
    };
    sandbox.window = sandbox;
    vm.runInNewContext(SCRIPT, sandbox);
    return {
        sandbox: sandbox,
        beacons: beacons,
        events: function () { return beacons.reduce(function (all, b) { return all.concat(b.body.e); }, []); },
        see: function (element) { observerCallback([{ isIntersecting: true, target: element }]); },
        observed: observed,
        click: function (el) { (listeners.click || []).forEach(function (fn) { fn({ target: el }); }); },
        hide: function () {
            sandbox.document.visibilityState = 'hidden';
            (listeners.visibilitychange || []).forEach(function (fn) { fn(); });
        },
        reload: function () { vm.runInNewContext(SCRIPT, sandbox); }
    };
}

/**
 * @param {Element} parent - container
 * @param {string} pid - product
 * @returns {Element} product tile with image and name links and a quick view link
 */
function tile(parent, pid) {
    var product = parent.append(new Element('div', { class: 'product', 'data-pid': pid }));
    var image = product.append(new Element('a', { href: '/p/' + pid }));
    image.append(new Element('img'));
    product.append(new Element('a', { href: '/quickview/' + pid, class: 'quickview' }));
    product.name = product.append(new Element('a', { href: '/p/' + pid, class: 'link' }));
    product.image = image;
    return product;
}

describe('plugin_analytics storefront script', function () {
    it('counts a listing impression only when a tile becomes visible, once per list position', function () {
        var tiles;
        var page = load({ type: 'plp', l: 'cat:rings' }, function (body) {
            var grid = body.append(new Element('div', { class: 'row product-grid' }));
            tiles = ['A', 'B', 'C'].map(function (pid) { return tile(grid, pid); });
        });
        assert.lengthOf(page.observed, 3);
        page.see(tiles[1]);
        page.see(tiles[1]);
        page.hide();
        assert.deepEqual(page.events(), [{ p: 'B', l: 'cat:rings', o: 2, n: 'view_item_list' }], 'only the visible tile, once');
        assert.equal(page.beacons[0].url, '/Analytics-Collect');
        assert.match(page.beacons[0].body.b, /^[a-f0-9]{24}$/);
    });

    it('treats a re-rendered tile in the same place as the same impression', function () {
        var grid;
        var page = load({ type: 'plp', l: 'cat:rings' }, function (body) {
            grid = body.append(new Element('div', { class: 'product-grid' }));
            tile(grid, 'A');
        });
        page.see(grid.children[0]);
        grid.children = [];
        var again = tile(grid, 'A');
        page.see(again);
        page.hide();
        assert.lengthOf(page.events(), 1);
    });

    it('sends one selection per click on a tile link, ignores quick view and double clicks', function () {
        var product;
        var page = load({ type: 'search', l: 'search', t: 'ring', r: 3 }, function (body) {
            var grid = body.append(new Element('div', { class: 'product-grid' }));
            tile(grid, 'A');
            product = tile(grid, 'B');
        });
        page.click(product.children[1]);
        page.click(product.image.children[0]);
        page.click(product.name);
        var selections = page.events().filter(function (e) { return e.n === 'select_item'; });
        assert.deepEqual(selections, [{ p: 'B', l: 'search', o: 2, t: 'ring', n: 'select_item' }]);
        assert.deepEqual(page.events()[0], { n: 'search', t: 'ring', r: 3 }, 'the search itself, sent with the selection');
    });

    it('sends one product page view per page load, never twice when the script is included twice', function () {
        var page = load({ type: 'pdp', p: 'M1' }, function () {});
        page.reload();
        page.hide();
        assert.deepEqual(page.events(), [{ n: 'view_item', p: 'M1' }]);
    });

    it('names lists from the page and from containers', function () {
        var tiles = {};
        var page = load({ type: 'pdp', p: 'M1' }, function (body) {
            tiles.recommended = tile(body.append(new Element('div', { class: 'recommendations' })), 'R');
            tiles.named = tile(body.append(new Element('div', { 'data-analytics-list': 'recently-viewed' })), 'N');
            tiles.home = tile(body.append(new Element('div', { class: 'homepage-product-listing row' })), 'H');
            tiles.other = tile(body, 'O');
        });
        Object.keys(tiles).forEach(function (k) { page.see(tiles[k]); });
        page.hide();
        assert.deepEqual(page.events().slice(1).map(function (e) { return e.l; }), ['recommendations', 'recently-viewed', 'home', 'pdp-other']);
    });

    it('sends full batches at once, the rest after a pause or when the page is hidden', function () {
        var tiles = [];
        var page = load({ type: 'plp', l: 'cat:rings' }, function (body) {
            var grid = body.append(new Element('div', { class: 'product-grid' }));
            for (var i = 0; i < 45; i++) tiles.push(tile(grid, 'P' + i));
        });
        tiles.forEach(function (t) { page.see(t); });
        assert.deepEqual(page.beacons.map(function (b) { return b.body.e.length; }), [20, 20]);
        page.hide();
        assert.deepEqual(page.beacons.map(function (b) { return b.body.e.length; }), [20, 20, 5]);
        assert.deepEqual(page.events().map(function (e) { return e.o; }), tiles.map(function (t, i) { return i + 1; }));
    });
});
