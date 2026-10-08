'use strict';

var config = document.getElementById('smart-commerce-config');

// The hook can render more than once on Page Designer pages; bind once.
if (config && !window.smartCommerceReady) {
    window.smartCommerceReady = true;

    var STORAGE_KEY = 'smart-compare';
    var MAX_COMPARE = 4;
    var labels = config.dataset;
    var tray = null;
    var panelHost = null;
    var productDetail = null;

    /**
     * Compare selection is a per-browser convenience; storage may be unavailable.
     * @returns {Array<Object>} Selected products: pid and name
     */
    var readSelection = function () {
        try {
            return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    };

    var writeSelection = function (items) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            // Selection then lasts for this page only.
        }
    };

    var compareUrl = function (items) {
        return labels.compareUrl + '?pids=' + encodeURIComponent(items.map(function (item) {
            return item.pid;
        }).join(','));
    };

    var syncToggles = function () {
        var selected = readSelection().map(function (item) {
            return item.pid;
        });
        document.querySelectorAll('.smart-compare-toggle').forEach(function (button) {
            var on = selected.indexOf(button.dataset.pid) > -1;
            var text = on ? labels.labelRemove : labels.labelAdd;
            button.setAttribute('aria-pressed', String(on));
            // Unchanged text must not be rewritten: the tile observer would see it as a new mutation.
            if (button.textContent !== text) {
                button.textContent = text; // eslint-disable-line no-param-reassign
            }
        });
    };

    var renderTray = function (notice) {
        var items = readSelection();
        if (!tray) {
            tray = document.createElement('div');
            tray.className = 'smart-compare-tray fixed-bottom bg-white border-top shadow-sm p-2 justify-content-center align-items-center';
            tray.setAttribute('role', 'region');
            tray.setAttribute('aria-label', labels.labelTray.replace('{0}', ''));
            document.body.appendChild(tray);
        }
        tray.classList.toggle('d-flex', items.length > 0);
        tray.classList.toggle('d-none', items.length === 0);
        tray.innerHTML = '';

        var text = document.createElement('span');
        text.className = 'me-3';
        text.setAttribute('role', 'status');
        text.textContent = notice || labels.labelTray.replace('{0}', items.length);
        tray.appendChild(text);

        var go = document.createElement('a');
        go.className = 'btn btn-primary btn-sm me-2' + (items.length < 2 ? ' disabled' : '');
        go.href = compareUrl(items);
        go.textContent = labels.labelGo;
        if (items.length < 2) {
            go.setAttribute('aria-disabled', 'true');
            go.setAttribute('tabindex', '-1');
        }
        tray.appendChild(go);

        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'btn btn-link btn-sm smart-compare-clear';
        clear.textContent = labels.labelClear;
        tray.appendChild(clear);
    };

    var toggleCompare = function (pid, name) {
        var items = readSelection();
        var index = items.map(function (item) {
            return item.pid;
        }).indexOf(pid);
        var notice = null;
        if (index > -1) {
            items.splice(index, 1);
        } else if (items.length >= MAX_COMPARE) {
            notice = labels.labelLimit;
        } else {
            items.push({ pid: pid, name: name });
        }
        writeSelection(items);
        renderTray(notice);
        syncToggles();
    };

    // Product tiles carry data-pid on .product; add a compare toggle to each, including tiles loaded by "More".
    var decorateTiles = function () {
        document.querySelectorAll('.product[data-pid] .product-tile').forEach(function (tile) {
            if (tile.querySelector('.smart-compare-toggle')) {
                return;
            }
            var link = tile.querySelector('.pdp-link a');
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-link btn-sm px-0 smart-compare-toggle';
            button.dataset.pid = tile.closest('.product').dataset.pid;
            button.dataset.name = link ? link.textContent.trim() : button.dataset.pid;
            tile.appendChild(button);
        });
        syncToggles();
    };

    var loadPanel = function (pid) {
        var separator = labels.panelUrl.indexOf('?') > -1 ? '&' : '?';
        fetch(labels.panelUrl + separator + 'pid=' + encodeURIComponent(pid), { credentials: 'same-origin' })
            .then(function (response) {
                return response.text();
            })
            .then(function (html) {
                panelHost.innerHTML = html;
                syncToggles();
            });
    };

    var anchor = document.querySelector('.product-detail[data-pid] .prices-add-to-cart-actions');
    if (anchor) {
        productDetail = anchor.closest('.product-detail');
        panelHost = document.createElement('div');
        panelHost.className = 'smart-product-panel-host';
        anchor.parentNode.insertBefore(panelHost, anchor.nextSibling);
        loadPanel(productDetail.dataset.pid);
        if (window.jQuery) {
            // Variant selection is the only signal SFRA gives for the selected SKU.
            window.jQuery('body').on('product:afterAttributeSelect', function (e, response) {
                var product = response && response.data && response.data.product;
                if (product && response.container && response.container[0] === productDetail) {
                    loadPanel(product.id);
                }
            });
        }
    }

    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('.smart-compare-toggle');
        if (toggle) {
            toggleCompare(toggle.dataset.pid, toggle.dataset.name);
            return;
        }
        if (e.target.closest('.smart-compare-clear')) {
            writeSelection([]);
            renderTray();
            syncToggles();
            return;
        }
        var remove = e.target.closest('.smart-compare-remove');
        if (remove) {
            var rest = readSelection().filter(function (item) {
                return item.pid !== remove.dataset.pid;
            });
            writeSelection(rest);
            window.location.href = compareUrl(rest);
        }
    });

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (form.matches('[data-confirm]') && !window.confirm(form.dataset.confirm)) { // eslint-disable-line no-alert
            e.preventDefault();
            return;
        }
        if (form.matches('.smart-store-search')) {
            e.preventDefault();
            var params = new URLSearchParams(new FormData(form));
            var search = function () {
                fetch(form.action + (form.action.indexOf('?') > -1 ? '&' : '?') + params.toString(), { credentials: 'same-origin' })
                    .then(function (response) {
                        return response.text();
                    })
                    .then(function (html) {
                        form.parentNode.querySelector('.smart-store-results').innerHTML = html;
                    });
            };
            // Without a postal code, prefer the browser's position; the server falls back to IP location.
            if (!params.get('postalCode') && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function (position) {
                    params.set('lat', position.coords.latitude);
                    params.set('long', position.coords.longitude);
                    search();
                }, search, { timeout: 8000 });
            } else {
                search();
            }
            return;
        }
        if (!form.matches('.smart-ajax-form')) {
            return;
        }
        e.preventDefault();
        var button = form.querySelector('[type="submit"]');
        var message = form.querySelector('.smart-form-message');
        button.disabled = true;
        fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (response) {
                return response.json();
            })
            .then(function (json) {
                if (json.redirectUrl) {
                    window.location.href = json.redirectUrl;
                    return;
                }
                if (json.reload && panelHost) {
                    loadPanel(form.closest('.smart-product-panel').dataset.pid);
                    return;
                }
                button.disabled = false;
                if (message) {
                    message.textContent = json.message || '';
                    message.classList.toggle('text-danger', !json.success);
                }
            })
            .catch(function () {
                button.disabled = false;
            });
    });

    decorateTiles();
    var grid = document.querySelector('.product-grid');
    if (grid && window.MutationObserver) {
        new window.MutationObserver(decorateTiles).observe(grid, { childList: true, subtree: true });
    }
    if (readSelection().length) {
        renderTray();
    }
}
