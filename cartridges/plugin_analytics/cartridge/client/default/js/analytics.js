'use strict';

// Product impressions, product selections, product page views and searches, sent in small
// batches with navigator.sendBeacon. Delivery is best effort and never retried; cart, checkout
// and purchase figures are recorded by the server. The queue never grows past one batch.
(function () {
    var config = document.getElementById('analytics-config');
    if (!config || window.pluginAnalyticsLoaded) return;
    window.pluginAnalyticsLoaded = true;

    var TILE = '.product[data-pid]';
    var LIST_CONTAINER = '[data-analytics-list], .product-grid, .homepage-product-listing, .carousel';
    var FLUSH_MS = 10000;
    var REPEAT_CLICK_MS = 1000;
    var url = config.getAttribute('data-url');
    var batchSize = Math.max(1, Math.min(50, parseInt(config.getAttribute('data-batch-size'), 10) || 20));
    var page = {};
    var queue = [];
    var counted = {};
    var timer = null;
    var lastClick = { pid: null, at: 0 };

    try {
        page = JSON.parse(config.getAttribute('data-page') || '{}');
    } catch (e) {
        page = {};
    }

    /** @returns {string} random batch ID */
    function batchId() {
        var bytes = new window.Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    /** @param {Object[]} events - events of one beacon */
    function send(events) {
        var body = JSON.stringify({ b: batchId(), e: events });
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
        if (window.fetch) {
            window.fetch(url, { method: 'POST', body: body, credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
        }
    }

    /** Sends every queued event. */
    function flush() {
        clearTimeout(timer);
        timer = null;
        while (queue.length) send(queue.splice(0, batchSize));
    }

    /** @param {Object} event - event to queue */
    function push(event) {
        queue.push(event);
        if (queue.length >= batchSize) flush();
        else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    }

    /**
     * @param {Element} tile - product tile
     * @returns {string} list the tile belongs to
     */
    function listOf(tile) {
        var named = tile.closest('[data-analytics-list]');
        if (named) return named.getAttribute('data-analytics-list');
        if (page.l && tile.closest('.product-grid')) return page.l;
        if (tile.closest('.homepage-product-listing')) return 'home';
        if (tile.closest('.recommendations, .einstein-carousel, [data-recommender]')) return 'recommendations';
        return (page.type || 'page') + '-other';
    }

    /**
     * @param {Element} tile - product tile
     * @returns {Object} product, list and position
     */
    function describe(tile) {
        var container = tile.closest(LIST_CONTAINER) || document.body;
        var event = {
            p: tile.getAttribute('data-pid'),
            l: listOf(tile),
            o: Array.prototype.indexOf.call(container.querySelectorAll(TILE), tile) + 1
        };
        if (event.l === 'search' && page.t) event.t = page.t;
        return event;
    }

    var observer = window.IntersectionObserver ? new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            var event = describe(entry.target);
            // A tile that is re-rendered in the same list and position is one impression.
            var key = event.l + '|' + event.p + '|' + event.o;
            if (counted[key]) return;
            counted[key] = true;
            event.n = 'view_item_list';
            push(event);
        });
    }, { threshold: 0.5 }) : null;

    /** @param {Node} root - element whose product tiles are observed */
    function watch(root) {
        if (!observer || !root.querySelectorAll) return;
        var tiles = Array.prototype.slice.call(root.querySelectorAll(TILE));
        if (root.matches && root.matches(TILE)) tiles.push(root);
        tiles.forEach(function (tile) {
            if (tile.hasAttribute('data-analytics-watched')) return;
            tile.setAttribute('data-analytics-watched', 'true');
            observer.observe(tile);
        });
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('a[href]') : null;
        var tile = link && !link.classList.contains('quickview') ? link.closest(TILE) : null;
        if (!tile) return;
        var event = describe(tile);
        var now = Date.now();
        // Image and name links of one tile, or a double click, are one selection.
        if (lastClick.pid === event.p && now - lastClick.at < REPEAT_CLICK_MS) return;
        lastClick = { pid: event.p, at: now };
        event.n = 'select_item';
        push(event);
        flush();
    }, true);

    if (page.type === 'pdp' && page.p) push({ n: 'view_item', p: page.p });
    if (page.type === 'search' && page.t) push({ n: 'search', t: page.t, r: page.r });

    watch(document);
    if (window.MutationObserver) {
        new window.MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                Array.prototype.forEach.call(mutation.addedNodes, function (node) {
                    if (node.nodeType === 1) watch(node);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
}());
