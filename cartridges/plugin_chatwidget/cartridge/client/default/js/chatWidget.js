'use strict';

/* eslint-disable no-use-before-define */
// Screens link to each other in both directions; all are hoisted function declarations.

/**
 * Shopping and account assistant. Every flow runs inside the widget against
 * ChatWidget JSON routes and the inherited SFRA JSON routes. Each request
 * carries the X-Chat-Widget header so the server can journal widget activity.
 */
document.addEventListener('DOMContentLoaded', function () {
    var widget = document.querySelector('[data-chat-widget]');
    if (!widget) return;

    var urls = JSON.parse(widget.getAttribute('data-urls'));
    var launcher = widget.querySelector('[data-chat-launcher]');
    var panel = widget.querySelector('[data-chat-panel]');
    var closeButton = widget.querySelector('[data-chat-close]');
    var status = widget.querySelector('[data-chat-status]');
    var backButton = widget.querySelector('[data-chat-back]');
    var homeButton = widget.querySelector('[data-chat-home]');
    var scrollArea = widget.querySelector('[data-chat-body]');
    var selectionSlot = widget.querySelector('[data-chat-selection]');
    var stage = widget.querySelector('[data-chat-stage]');
    var STATUS_MS = 6000;
    var statusTimer;
    var ACTION_LABELS = {
        shop: 'Browse catalog',
        search: 'Search products',
        cart: 'View cart',
        promotions: 'Current promotions',
        login: 'Sign in',
        register: 'Create account',
        'reset-password': 'Reset password',
        checkout: 'Checkout',
        account: 'Account summary',
        profile: 'Edit profile',
        addresses: 'Addresses',
        payments: 'Saved cards',
        orders: 'Order history',
        review: 'Review your order',
        logout: 'Sign out'
    };
    var COUPON_STATUS = {
        APPLIED: 'Applied',
        NO_APPLICABLE_PROMOTION: 'Not applicable to your current cart',
        COUPON_CODE_UNKNOWN: 'Unknown code',
        COUPON_DISABLED: 'Disabled',
        CODE_ALREADY_REDEEMED: 'Already redeemed',
        REDEMPTION_LIMIT_EXCEEDED: 'Redemption limit reached',
        TIMEFRAME_REDEMPTION_LIMIT_EXCEEDED: 'Redemption limit reached for now',
        CUSTOMER_REDEMPTION_LIMIT_EXCEEDED: 'You have already used this code'
    };
    var state = {
        authenticated: false,
        checkout: null,
        resumeCheckout: false,
        selectedProduct: null,
        started: false
    };
    var history = [];
    var current = null;
    var uid = 0;

    // ---------------------------------------------------------------- network

    /**
     * Append query parameters to a URL.
     * @param {string} url base URL
     * @param {Object} params query parameters
     * @returns {string} URL with query string
     */
    function withQuery(url, params) {
        var query = Object.keys(params || {}).filter(function (key) {
            return params[key] !== undefined && params[key] !== null && params[key] !== '';
        }).map(function (key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        if (!query) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + query;
    }

    /**
     * Send a widget request and parse its JSON response.
     * @param {string} url endpoint URL
     * @param {Object} [options] method and url-encoded body
     * @returns {Promise} parsed JSON
     */
    function request(url, options) {
        var settings = options || {};
        var headers = { Accept: 'application/json', 'X-Chat-Widget': '1' };
        if (settings.body) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        return window.fetch(url, {
            body: settings.body,
            credentials: 'same-origin',
            headers: headers,
            method: settings.method || 'GET'
        }).then(function (response) {
            return response.json().catch(function () {
                throw new Error('The store returned an unexpected response.');
            }).then(function (data) {
                var error;
                if (data.csrfError) throw new Error('Your session expired for security reasons. Please try again.');
                if (!response.ok) {
                    error = new Error(data.message || data.errorMessage || 'The request could not be completed.');
                    error.data = data;
                    throw error;
                }
                return data;
            });
        });
    }

    /**
     * GET JSON.
     * @param {string} url endpoint URL
     * @param {Object} [params] query parameters
     * @returns {Promise} parsed JSON
     */
    function getJson(url, params) {
        return request(withQuery(url, params));
    }

    /**
     * Fetch a fresh CSRF token (login/logout rotate the session token).
     * @returns {Promise} tokenName and token
     */
    function token() {
        return getJson(urls.token);
    }

    /**
     * POST form fields with a fresh CSRF token.
     * @param {string} url endpoint URL
     * @param {Object} fields form fields
     * @returns {Promise} parsed JSON
     */
    function post(url, fields) {
        return token().then(function (csrf) {
            var body = new window.URLSearchParams();
            Object.keys(fields || {}).forEach(function (key) {
                body.append(key, fields[key] === undefined || fields[key] === null ? '' : fields[key]);
            });
            body.append(csrf.tokenName, csrf.token);
            return request(url, { method: 'POST', body: body.toString() });
        });
    }

    /**
     * Record a client-only journey event; failures are ignored on purpose.
     * @param {string} action allow-listed activity name
     * @param {Object} [fields] extra allow-listed fields
     */
    function trackClient(action, fields) {
        var data = fields || {};
        data.action = action;
        post(urls.activity, data).catch(function () {});
    }

    // --------------------------------------------------------------- elements

    /**
     * Create an element.
     * @param {string} tag tag name
     * @param {string} [className] classes
     * @param {string} [text] text content
     * @returns {HTMLElement} element
     */
    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    /**
     * Unique element id.
     * @param {string} prefix id prefix
     * @returns {string} id
     */
    function nextId(prefix) {
        uid += 1;
        return 'chat-widget-' + prefix + '-' + uid;
    }

    /**
     * Create a button.
     * @param {string} label button text
     * @param {Function} handler click handler
     * @param {string} [variant] primary, secondary, link or danger
     * @returns {HTMLButtonElement} button
     */
    function button(label, handler, variant) {
        var node = el('button', 'chat-widget-button chat-widget-button-' + (variant || 'secondary'), label);
        node.type = 'button';
        node.addEventListener('click', handler);
        return node;
    }

    /**
     * Show a short status line under the header (announced to screen readers).
     * @param {string} text message text
     * @param {string} [type] 'alert' for failures
     */
    function say(text, type) {
        window.clearTimeout(statusTimer);
        status.textContent = text;
        status.classList.toggle('chat-widget-status-alert', type === 'alert');
        status.hidden = false;
        statusTimer = window.setTimeout(function () { status.hidden = true; }, STATUS_MS);
    }

    /**
     * Image that removes itself when the source fails.
     * @param {string} src image URL
     * @param {string} alt alternative text
     * @returns {HTMLImageElement|null} image
     */
    function image(src, alt) {
        var node;
        if (!src) return null;
        node = el('img', 'chat-widget-image');
        node.src = src;
        node.alt = alt || '';
        node.loading = 'lazy';
        node.addEventListener('error', function () { node.remove(); });
        return node;
    }

    /**
     * A label/value row list.
     * @param {Array} rows [label, value, emphasis] tuples; empty values are skipped
     * @returns {HTMLElement} definition list
     */
    function summary(rows) {
        var list = el('dl', 'chat-widget-summary d-flex flex-column');
        rows.forEach(function (row) {
            var item;
            if (!row[1] || row[1] === '-') return;
            item = el('div', 'd-flex justify-content-between' + (row[2] ? ' chat-widget-summary-total' : ''));
            item.appendChild(el('dt', null, row[0]));
            item.appendChild(el('dd', 'mb-0', row[1]));
            list.appendChild(item);
        });
        return list;
    }

    /**
     * A row of buttons.
     * @param {Array} buttons buttons
     * @returns {HTMLElement} container
     */
    function buttonRow(buttons) {
        var row = el('div', 'chat-widget-button-row d-flex flex-wrap');
        buttons.forEach(function (node) { if (node) row.appendChild(node); });
        return row;
    }

    /**
     * Inline status/alert text.
     * @param {string} text message
     * @param {boolean} [isError] render as alert
     * @returns {HTMLElement} status node
     */
    function notice(text, isError) {
        var node = el('p', 'chat-widget-notice' + (isError ? ' chat-widget-notice-error' : ''), text);
        node.setAttribute('role', isError ? 'alert' : 'status');
        return node;
    }

    // ------------------------------------------------------------- navigation

    /**
     * Open a screen, keeping the current one for Back.
     * @param {Function} screenFn screen function
     * @param {*} [arg] screen argument
     * @param {boolean} [replace] replace current screen instead of pushing it
     */
    function open(screenFn, arg, replace) {
        if (current && !replace) history.push(current);
        if (history.length > 20) history.shift();
        current = { fn: screenFn, arg: arg };
        screenFn(arg);
    }

    /**
     * Re-render the current screen after a change.
     */
    function refresh() {
        if (current) current.fn(current.arg);
    }

    /**
     * Return to the previous screen.
     */
    function back() {
        var previous = history.pop();
        if (!previous) {
            home();
            return;
        }
        current = previous;
        previous.fn(previous.arg);
    }

    /**
     * Return to the start menu and clear the Back stack.
     */
    function home() {
        history = [];
        current = { fn: showMenu, arg: null };
        showMenu();
    }

    /**
     * Render the selected-product card above the stage.
     */
    function renderSelection() {
        var product = state.selectedProduct;
        var card;
        var details;
        var img;
        selectionSlot.innerHTML = '';
        if (!product) return;
        card = el('article', 'chat-widget-selection d-flex align-items-center');
        card.setAttribute('aria-label', 'Selected product');
        img = image(product.image, product.name);
        if (img) card.appendChild(img);
        details = el('div', 'd-flex flex-column');
        details.appendChild(el('small', 'chat-widget-eyebrow', 'SELECTED PRODUCT'));
        details.appendChild(el('strong', null, product.name));
        if (product.options) details.appendChild(el('span', 'chat-widget-muted', product.options));
        if (product.price) details.appendChild(el('span', 'chat-widget-price', product.price));
        card.appendChild(details);
        selectionSlot.appendChild(card);
    }

    /**
     * Show header Back/Menu buttons for the current navigation state.
     * @param {boolean} [noBack] hide Back
     */
    function updateNav(noBack) {
        backButton.hidden = !!noBack || !history.length;
        homeButton.hidden = !current || current.fn === showMenu;
    }

    /**
     * Start rendering a screen.
     * @param {string} title screen heading
     * @param {Object} [options] selection: keep selected product visible
     * @returns {HTMLElement} heading
     */
    function screen(title, options) {
        var heading = el('h3', 'chat-widget-screen-title', title);
        var settings = options || {};
        stage.innerHTML = '';
        stage.setAttribute('aria-busy', 'false');
        selectionSlot.hidden = !(settings.selection && state.selectedProduct);
        if (!selectionSlot.hidden) renderSelection();
        heading.tabIndex = -1;
        stage.appendChild(heading);
        updateNav(false);
        return heading;
    }

    /**
     * Finish a screen with navigation and move focus to its heading.
     * @param {Array} [extra] next-action buttons
     * @param {Object} [options] noBack: hide the Back button
     */
    function finish(extra, options) {
        var settings = options || {};
        var actions = (extra || []).filter(function (node) { return !!node; });
        if (actions.length) stage.appendChild(buttonRow(actions));
        updateNav(settings.noBack);
        if (!panel.hidden) {
            stage.querySelector('.chat-widget-screen-title').focus({ preventScroll: true });
        }
        scrollArea.scrollTop = 0;
    }

    /**
     * Render a loading state.
     * @param {string} title screen heading
     * @param {Object} [options] screen options
     */
    function loading(title, options) {
        screen(title, options);
        stage.setAttribute('aria-busy', 'true');
        stage.appendChild(notice('Loading…'));
    }

    /**
     * Render an error with retry, back and menu actions.
     * @param {string} title screen heading
     * @param {Error} error failure
     * @param {Function} retry retry handler
     */
    function failure(title, error, retry) {
        screen(title);
        stage.appendChild(notice(error && error.message ? error.message : 'Something went wrong.', true));
        finish([button('Try again', retry, 'primary')]);
    }

    /**
     * Load data for a screen and render it, handling loading and errors.
     * @param {string} title screen heading
     * @param {Function} fetchData returns a Promise of data
     * @param {Function} render receives data
     * @param {Object} [options] screen options
     */
    function load(title, fetchData, render, options) {
        var screenRef = current;
        loading(title, options);
        fetchData().then(function (data) {
            if (current === screenRef) render(data);
        }).catch(function (error) {
            if (current === screenRef) failure(title, error, refresh);
        });
    }

    // ------------------------------------------------------------------ forms

    /**
     * Add a labelled input, select or textarea to a form.
     * @param {HTMLElement} container form
     * @param {Object} config label, name, type, value, required, autocomplete, options, maxLength, inputMode, pattern
     * @returns {HTMLElement} control
     */
    function field(container, config) {
        var wrapper = el('div', 'chat-widget-field d-flex flex-column');
        var id = nextId('field');
        var label = el('label', null, config.label + (config.required ? '' : ' (optional)'));
        var control;
        label.htmlFor = id;
        if (config.options) {
            control = el('select');
            config.options.forEach(function (option) {
                var node = el('option', null, option.label);
                node.value = option.value;
                node.selected = option.value === config.value;
                control.appendChild(node);
            });
        } else if (config.type === 'textarea') {
            control = el('textarea');
            control.rows = 3;
        } else {
            control = el('input');
            control.type = config.type || 'text';
        }
        control.id = id;
        control.name = config.name;
        control.required = !!config.required;
        if (config.value !== undefined && !config.options) control.value = config.value;
        if (config.autocomplete) control.setAttribute('autocomplete', config.autocomplete);
        if (config.maxLength) control.maxLength = config.maxLength;
        if (config.inputMode) control.setAttribute('inputmode', config.inputMode);
        if (config.pattern) control.pattern = config.pattern;
        wrapper.appendChild(label);
        wrapper.appendChild(control);
        container.appendChild(wrapper);
        return control;
    }

    /**
     * Create a form with a submit handler; the submit button is disabled while busy.
     * @param {string} submitLabel submit button text
     * @param {Function} onSubmit receives (values, form) and returns a Promise
     * @returns {HTMLFormElement} form
     */
    function form(submitLabel, onSubmit) {
        var node = el('form', 'chat-widget-form d-flex flex-column');
        var submit = el('button', 'chat-widget-button chat-widget-button-primary', submitLabel);
        submit.type = 'submit';
        node.addEventListener('submit', function (event) {
            var values = {};
            event.preventDefault();
            if (submit.disabled) return;
            Array.prototype.forEach.call(node.elements, function (control) {
                if (!control.name || control.disabled) return;
                if ((control.type === 'checkbox' || control.type === 'radio') && !control.checked) return;
                values[control.name] = control.value;
            });
            submit.disabled = true;
            node.setAttribute('aria-busy', 'true');
            window.Promise.resolve(onSubmit(values, node)).catch(function (error) {
                var data = error.data || {};
                showFormErrors(node, { fields: data.fields, fieldErrors: data.fieldErrors, errorMessage: error.message });
            }).then(function () {
                submit.disabled = false;
                node.setAttribute('aria-busy', 'false');
            });
        });
        node.submitButton = submit;
        return node;
    }

    /**
     * Close a form by appending its submit button.
     * @param {HTMLFormElement} node form
     */
    function addSubmit(node) {
        node.appendChild(node.submitButton);
    }

    /**
     * Collect messages from the different SFRA error shapes.
     * @param {Object} data SFRA response
     * @returns {Object} fields map and general messages
     */
    function collectErrors(data) {
        var fields = {};
        var general = [];
        if (data.fields) Object.keys(data.fields).forEach(function (key) { fields[key] = data.fields[key]; });
        (data.fieldErrors || []).forEach(function (group) {
            Object.keys(group || {}).forEach(function (key) { fields[key] = group[key]; });
        });
        if (Array.isArray(data.error)) general = general.concat(data.error);
        if (data.errorMessage) general.push(data.errorMessage);
        if (data.customerErrorMessage) general.push(data.customerErrorMessage);
        if (data.message && data.success === false) general.push(data.message);
        (data.serverErrors || []).forEach(function (message) { general.push(message); });
        return { fields: fields, general: general };
    }

    /**
     * Mark invalid fields and show a summary alert in a form.
     * @param {HTMLFormElement} node form
     * @param {Object} data SFRA response
     * @returns {boolean} whether any error was shown
     */
    function showFormErrors(node, data) {
        var errors = collectErrors(data);
        var alertNode = node.querySelector('.chat-widget-form-alert');
        var unmatched = [];
        Array.prototype.forEach.call(node.querySelectorAll('.chat-widget-field-error'), function (item) { item.remove(); });
        Array.prototype.forEach.call(node.elements, function (control) { control.removeAttribute('aria-invalid'); });
        Object.keys(errors.fields).forEach(function (name) {
            var control = node.elements.namedItem(name);
            var message;
            if (!control || !control.parentNode) {
                unmatched.push(errors.fields[name]);
                return;
            }
            message = el('span', 'chat-widget-field-error', errors.fields[name]);
            message.id = nextId('error');
            control.setAttribute('aria-invalid', 'true');
            control.setAttribute('aria-describedby', message.id);
            control.parentNode.appendChild(message);
        });
        errors.general = errors.general.concat(unmatched);
        if (!errors.general.length && Object.keys(errors.fields).length) errors.general.push('Please correct the highlighted fields.');
        if (alertNode) alertNode.remove();
        if (!errors.general.length) return false;
        alertNode = notice(errors.general.join(' '), true);
        alertNode.classList.add('chat-widget-form-alert');
        node.insertBefore(alertNode, node.firstChild);
        return true;
    }

    /**
     * Whether an SFRA JSON response reports success.
     * @param {Object} data SFRA response
     * @returns {boolean} success
     */
    function succeeded(data) {
        var errors = collectErrors(data);
        return !data.error && data.success !== false && !errors.general.length && !Object.keys(errors.fields).length;
    }

    /**
     * Ask for confirmation inline before a destructive action.
     * @param {HTMLElement} container element to append the prompt to
     * @param {string} question confirmation question
     * @param {Function} onConfirm returns a Promise
     */
    function confirmInline(container, question, onConfirm) {
        var box = el('div', 'chat-widget-confirm d-flex flex-column');
        var yes = button('Yes, delete', function () {
            yes.disabled = true;
            onConfirm().catch(function (error) {
                box.appendChild(notice(error.message, true));
                yes.disabled = false;
            });
        }, 'danger');
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', question);
        box.appendChild(el('p', 'mb-0', question));
        box.appendChild(buttonRow([yes, button('Cancel', function () { box.remove(); }, 'link')]));
        container.appendChild(box);
        yes.focus();
    }

    // ------------------------------------------------------------------- menu

    /**
     * Start menu built from the capabilities available to this shopper.
     */
    function showMenu() {
        load('How can I help?', function () { return getJson(urls.capabilities); }, function (data) {
            var list = el('div', 'chat-widget-menu d-flex flex-wrap');
            state.authenticated = data.authenticated;
            screen(data.firstName ? 'Hi ' + data.firstName + ', how can I help?' : 'How can I help?');
            data.actions.forEach(function (action) {
                var label = ACTION_LABELS[action] || action;
                if (action === 'cart' && data.itemCount) label += ' (' + data.itemCount + ')';
                list.appendChild(button(label, function () { runAction(action, data); }, action === 'checkout' ? 'primary' : 'secondary'));
            });
            stage.appendChild(el('p', 'chat-widget-muted mb-0', 'Your personal shopping assistant. Everything here uses live store data.'));
            stage.appendChild(list);
            finish([], { noBack: true });
        });
    }

    // ---------------------------------------------------------------- catalog

    /**
     * Load a product carousel page for a category or a search phrase.
     * @param {Object} query cgid/name or q
     */
    function showProducts(query) {
        var title = query.q ? 'Results for “' + query.q + '”' : query.name;
        load(title, function () {
            return getJson(urls.products, { cgid: query.cgid, q: query.q, start: 0 });
        }, function (data) {
            var carousel = el('ul', 'chat-widget-carousel d-flex list-unstyled mb-0');
            var more;
            var loadingMore = false;
            screen(title);
            if (!data.products.length) {
                stage.appendChild(notice(query.q ? 'No products match that search.' : 'No products are available in this category.'));
                finish([button('Search products', function () { open(showSearch); }, 'primary'), button('Browse catalog', function () { open(showCategories, null); })]);
                return;
            }
            carousel.setAttribute('aria-label', title + ' products');

            /**
             * Append product cards.
             * @param {Array} products product payloads
             */
            function addCards(products) {
                products.forEach(function (product) {
                    var item = el('li', 'chat-widget-product d-flex flex-column');
                    var img = image(product.image, product.name);
                    if (img) item.appendChild(img);
                    item.appendChild(el('strong', 'chat-widget-product-name', product.name));
                    item.appendChild(el('span', 'chat-widget-price', product.price));
                    item.appendChild(button(product.hasVariations ? 'Choose options' : 'Select', function () {
                        selectProduct(product);
                    }, 'primary'));
                    carousel.appendChild(item);
                });
            }

            /**
             * Lazy-load the next carousel page.
             */
            function loadMore() {
                if (loadingMore || !more) return;
                loadingMore = true;
                more.disabled = true;
                getJson(urls.products, { cgid: query.cgid, q: query.q, start: carousel.children.length }).then(function (page) {
                    addCards(page.products);
                    if (!page.hasMore) {
                        more.remove();
                        more = null;
                    }
                }).catch(function () {
                    say('I could not load more products. Use “Show more” to try again.', 'alert');
                }).then(function () {
                    loadingMore = false;
                    if (more) more.disabled = false;
                });
            }

            addCards(data.products);
            stage.appendChild(el('p', 'chat-widget-muted mb-0', data.total + ' products'));
            stage.appendChild(carousel);
            if (data.hasMore) {
                more = button('Show more products', loadMore);
                stage.appendChild(more);
                carousel.addEventListener('scroll', function () {
                    if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 48) loadMore();
                });
            }
            finish([button('View cart', function () { open(showCart); })]);
        });
    }

    /**
     * Category level browser; leaf categories open the product carousel.
     * @param {Object|null} parent id and name of the parent category
     */
    function showCategories(parent) {
        var title = parent ? parent.name : 'What would you like to shop for?';
        load(title, function () {
            return getJson(urls.categories, { parent: parent ? parent.id : '' });
        }, function (data) {
            var list = el('div', 'chat-widget-menu d-flex flex-wrap');
            if (!data.categories.length && parent) {
                open(showProducts, { cgid: parent.id, name: parent.name }, true);
                return;
            }
            screen(title);
            if (!data.categories.length) {
                stage.appendChild(notice('The catalog has no categories to browse right now.'));
            }
            if (parent) {
                list.appendChild(button('All ' + parent.name, function () { open(showProducts, { cgid: parent.id, name: parent.name }); }, 'primary'));
            }
            data.categories.forEach(function (category) {
                list.appendChild(button(category.name, function () {
                    open(showCategories, category);
                }));
            });
            stage.appendChild(list);
            finish([button('Search products', function () { open(showSearch); })]);
        });
    }

    /**
     * Product search form.
     */
    function showSearch() {
        var node = form('Search', function (values) {
            var phrase = (values.q || '').trim();
            if (!phrase) return window.Promise.reject(new Error('Enter a product name or keyword.'));
            open(showProducts, { q: phrase });
            return null;
        });
        screen('Search products');
        field(node, { label: 'Product name or keyword', name: 'q', type: 'search', required: true, maxLength: 100 });
        addSubmit(node);
        stage.appendChild(node);
        finish([button('Browse catalog', function () { open(showCategories, null); })]);
    }

    /**
     * Option summary derived from the variation attributes.
     * @param {Array} attributes variation attributes
     * @returns {string} e.g. "Color: Blue, Size: M"
     */
    function optionText(attributes) {
        return (attributes || []).filter(function (attribute) {
            return attribute.displayValue;
        }).map(function (attribute) {
            return attribute.displayName + ': ' + attribute.displayValue;
        }).join(', ');
    }

    /**
     * Add the selected product to the basket.
     * @param {string} productId orderable product ID
     */
    function addToCart(productId) {
        loading('Adding to cart', { selection: true });
        post(urls.addToCart, { pid: productId, quantity: 1 }).then(function (data) {
            screen(data.error ? 'Could not add to cart' : 'Added to cart', { selection: true });
            stage.appendChild(notice(data.message || (data.error ? 'This item could not be added.' : 'The item is in your cart.'), !!data.error));
            say(data.error ? data.message || 'I could not add that item.' : 'Added ' + state.selectedProduct.name + ' to your cart.');
            finish([
                button('View cart', function () { open(showCart); }, 'primary'),
                button('Keep shopping', function () { open(showCategories, null); }),
                button('Checkout', function () { open(startCheckout); })
            ]);
        }).catch(function (error) {
            failure('Could not add to cart', error, function () { addToCart(productId); });
        });
    }

    /**
     * Variation chooser; every attribute stays visible and the selected
     * product card is updated after each choice.
     * @param {Object} product SFRA product model (id, variationAttributes, readyToOrder)
     */
    function showVariations(product) {
        var attributes = product.variationAttributes || [];
        screen('Choose your options', { selection: true });
        attributes.forEach(function (attribute) {
            var group = el('div', 'chat-widget-option-group d-flex flex-column');
            var labelId = nextId('attribute');
            var values = el('div', 'd-flex flex-wrap chat-widget-option-values');
            group.setAttribute('role', 'group');
            group.setAttribute('aria-labelledby', labelId);
            group.appendChild(el('span', 'chat-widget-option-label', attribute.displayName + (attribute.displayValue ? ': ' + attribute.displayValue : '')));
            group.firstChild.id = labelId;
            attribute.values.forEach(function (value) {
                var option = button(value.displayValue, function () {
                    loading('Updating options', { selection: true });
                    request(value.url).then(function (data) {
                        var updated = data.product;
                        state.selectedProduct = {
                            id: updated.id,
                            name: updated.productName || state.selectedProduct.name,
                            image: updated.images && updated.images.medium && updated.images.medium.length ? updated.images.medium[0].url : state.selectedProduct.image,
                            price: updated.price && updated.price.sales && updated.price.sales.formatted ? updated.price.sales.formatted : state.selectedProduct.price,
                            options: optionText(updated.variationAttributes)
                        };
                        open(showVariations, updated, true);
                    }).catch(function (error) {
                        failure('Choose your options', error, function () { open(showVariations, product, true); });
                    });
                }, 'option');
                option.setAttribute('aria-pressed', String(!!value.selected));
                option.disabled = !value.selectable && !value.selected;
                values.appendChild(option);
            });
            group.appendChild(values);
            stage.appendChild(group);
        });
        if (product.readyToOrder) {
            stage.appendChild(notice('Your selection is ready to add.'));
        } else if (attributes.some(function (attribute) { return !attribute.displayValue; })) {
            stage.appendChild(notice('Choose ' + attributes.filter(function (attribute) { return !attribute.displayValue; }).map(function (attribute) {
                return attribute.displayName.toLowerCase();
            }).join(' and ') + ' to continue.'));
        } else {
            stage.appendChild(notice('This combination is not available. Choose different options.', true));
        }
        finish([
            product.readyToOrder ? button('Add to cart', function () { addToCart(product.id); }, 'primary') : null,
            button('View cart', function () { open(showCart); })
        ]);
    }

    /**
     * Select a product card and load its options.
     * @param {Object} product carousel product payload
     */
    function selectProduct(product) {
        state.selectedProduct = { id: product.id, name: product.name, image: product.image, price: product.price, options: '' };
        open(function () {
            load('Choose your options', function () {
                return getJson(urls.product, { pid: product.id });
            }, function (data) {
                state.selectedProduct.options = optionText(data.variationAttributes);
                current = { fn: showVariations, arg: data };
                showVariations(data);
            }, { selection: true });
        });
    }

    // ------------------------------------------------------------------- cart

    /**
     * Totals summary rows.
     * @param {Object} totals totals payload
     * @returns {HTMLElement} summary list
     */
    function totalsSummary(totals) {
        return summary([
            ['Subtotal', totals.subTotal],
            ['Order discount', totals.orderDiscount ? '−' + totals.orderDiscount : ''],
            ['Shipping', totals.shipping],
            ['Shipping discount', totals.shippingDiscount ? '−' + totals.shippingDiscount : ''],
            ['Tax', totals.tax],
            ['Total', totals.grandTotal, true]
        ]);
    }

    /**
     * Run a mutation (cart, address) and refresh the screen, showing failures inline.
     * @param {Promise} action pending request
     * @param {string} successMessage message for the conversation log
     */
    function applyChange(action, successMessage) {
        stage.setAttribute('aria-busy', 'true');
        action.then(function (data) {
            if (data.error || data.errorMessage) throw new Error(data.errorMessage || data.message || 'That change could not be made.');
            if (successMessage) say(successMessage);
            refresh();
        }).catch(function (error) {
            stage.setAttribute('aria-busy', 'false');
            stage.insertBefore(notice(error.message, true), stage.children[1] || null);
        });
    }

    /**
     * One basket line with quantity and remove controls.
     * @param {Object} item line item payload
     * @returns {HTMLElement} line card
     */
    function cartLine(item) {
        var card = el('li', 'chat-widget-line d-flex');
        var details = el('div', 'd-flex flex-column flex-grow-1');
        var img = image(item.image, item.name);
        var controls = el('div', 'chat-widget-quantity d-flex align-items-center');

        /**
         * Change the line quantity through Cart-UpdateQuantity.
         * @param {number} quantity new quantity
         */
        function setQuantity(quantity) {
            applyChange(getJson(urls.updateQuantity, { pid: item.id, uuid: item.uuid, quantity: quantity }), 'Updated ' + item.name + ' to ' + quantity + '.');
        }

        if (img) card.appendChild(img);
        details.appendChild(el('strong', null, item.name));
        if (item.options) details.appendChild(el('span', 'chat-widget-muted', item.options));
        details.appendChild(el('span', 'chat-widget-price', item.price));
        item.promotions.forEach(function (promotion) {
            if (promotion) details.appendChild(el('span', 'chat-widget-promo', promotion));
        });
        if (!item.bonus) {
            var minus = button('−', function () { setQuantity(item.quantity - 1); }, 'icon');
            var plus = button('+', function () { setQuantity(item.quantity + 1); }, 'icon');
            minus.setAttribute('aria-label', 'Decrease quantity of ' + item.name);
            plus.setAttribute('aria-label', 'Increase quantity of ' + item.name);
            minus.classList.add('p-0');
            plus.classList.add('p-0');
            minus.disabled = item.quantity <= (item.minQuantity || 1);
            plus.disabled = item.quantity >= (item.maxQuantity || item.quantity);
            controls.appendChild(minus);
            controls.appendChild(el('span', 'chat-widget-quantity-value', 'Qty ' + item.quantity));
            controls.appendChild(plus);
            controls.appendChild(button('Remove', function () {
                applyChange(getJson(urls.removeLine, { pid: item.id, uuid: item.uuid }), 'Removed ' + item.name + '.');
            }, 'link'));
            details.appendChild(controls);
        } else {
            details.appendChild(el('span', 'chat-widget-muted', 'Bonus item'));
        }
        card.appendChild(details);
        return card;
    }

    /**
     * Coupon list and entry form.
     * @param {Object} promotions promotions payload
     * @returns {HTMLElement} coupon section
     */
    function couponSection(promotions) {
        var section = el('section', 'chat-widget-section d-flex flex-column');
        var node = form('Apply', function (values) {
            var code = (values.couponCode || '').trim();
            if (!code) return window.Promise.reject(new Error('Enter a promo code.'));
            return token().then(function (csrf) {
                var params = { couponCode: code };
                params[csrf.tokenName] = csrf.token;
                return getJson(urls.addCoupon, params);
            }).then(function (data) {
                if (data.error) {
                    showFormErrors(node, { errorMessage: data.errorMessage || 'That code could not be applied.' });
                    return;
                }
                say('Promo code ' + code + ' added.');
                refresh();
            });
        });
        section.appendChild(el('h4', 'chat-widget-section-title', 'Promo codes'));
        promotions.coupons.forEach(function (coupon) {
            var row = el('div', 'd-flex align-items-center justify-content-between chat-widget-coupon');
            row.appendChild(el('span', null, coupon.code + ' · ' + (COUPON_STATUS[coupon.status] || (coupon.applied ? 'Applied' : 'Not applied'))));
            row.appendChild(button('Remove', function () {
                applyChange(getJson(urls.removeCoupon, { code: coupon.code, uuid: coupon.uuid }), 'Promo code ' + coupon.code + ' removed.');
            }, 'link'));
            section.appendChild(row);
        });
        field(node, { label: 'Promo code', name: 'couponCode', required: true, maxLength: 50, autocomplete: 'off' });
        addSubmit(node);
        section.appendChild(node);
        return section;
    }

    /**
     * Shipping method radio group; selection calls Cart-SelectShippingMethod.
     * @param {Array} methods shipping method payloads
     * @param {Function} onChange receives the method ID
     * @returns {HTMLElement} fieldset
     */
    function shippingMethods(methods, onChange) {
        var fieldset = el('fieldset', 'chat-widget-section d-flex flex-column');
        var name = nextId('shipping');
        fieldset.appendChild(el('legend', 'chat-widget-section-title', 'Shipping method'));
        methods.forEach(function (method) {
            var label = el('label', 'chat-widget-choice d-flex align-items-start');
            var input = el('input');
            var text = el('span', 'd-flex flex-column');
            input.type = 'radio';
            input.name = name;
            input.value = method.id;
            input.checked = method.selected;
            input.addEventListener('change', function () { onChange(method.id); });
            text.appendChild(el('strong', null, method.name + (method.cost ? ' · ' + method.cost : '')));
            if (method.arrival) text.appendChild(el('span', 'chat-widget-muted', method.arrival));
            label.appendChild(input);
            label.appendChild(text);
            fieldset.appendChild(label);
        });
        return fieldset;
    }

    /**
     * Basket view with all supported cart management.
     */
    function showCart() {
        load('Your cart', function () { return getJson(urls.cart); }, function (cart) {
            var list = el('ul', 'chat-widget-lines list-unstyled mb-0 d-flex flex-column');
            screen('Your cart (' + cart.numItems + ')');
            if (!cart.items.length) {
                stage.appendChild(notice('Your cart is empty.'));
                finish([
                    button('Browse catalog', function () { open(showCategories, null); }, 'primary'),
                    button('Search products', function () { open(showSearch); })
                ]);
                return;
            }
            if (cart.valid.error && cart.valid.message) stage.appendChild(notice(cart.valid.message, true));
            cart.items.forEach(function (item) { list.appendChild(cartLine(item)); });
            stage.appendChild(list);
            cart.promotions.applied.forEach(function (promotion) {
                if (promotion.scope !== 'product' && promotion.message) stage.appendChild(el('p', 'chat-widget-promo mb-0', promotion.message + (promotion.amount ? ' (' + promotion.amount + ')' : '')));
            });
            cart.approaching.forEach(function (message) {
                if (message) stage.appendChild(el('p', 'chat-widget-muted mb-0', message));
            });
            stage.appendChild(couponSection(cart.promotions));
            if (cart.shippingMethods.length) {
                stage.appendChild(shippingMethods(cart.shippingMethods, function (methodId) {
                    applyChange(post(withQuery(urls.selectShippingMethod, { methodID: methodId }), {}), 'Shipping method updated.');
                }));
            }
            if (cart.totals) stage.appendChild(totalsSummary(cart.totals));
            finish([
                button(state.authenticated ? 'Checkout' : 'Sign in to checkout', function () { open(startCheckout); }, 'primary'),
                button('Keep shopping', function () { open(showCategories, null); }),
                button('Promotions', function () { open(showPromotions); })
            ]);
        });
    }

    /**
     * Applied adjustments, coupon states and active promotions.
     */
    function showPromotions() {
        load('Promotions', function () { return getJson(urls.promotions); }, function (data) {
            var hasAny = data.applied.length || data.coupons.length || data.active.length;
            screen('Promotions');
            if (!hasAny) {
                stage.appendChild(notice('There are no promotions available to you right now.'));
            }
            if (data.applied.length) {
                stage.appendChild(el('h4', 'chat-widget-section-title', 'Applied to your cart'));
                data.applied.forEach(function (promotion) {
                    stage.appendChild(el('p', 'chat-widget-promo mb-0', (promotion.message || promotion.id) + (promotion.amount ? ' · ' + promotion.amount : '') + ' (' + promotion.scope + ')'));
                });
            }
            if (data.coupons.length) {
                stage.appendChild(el('h4', 'chat-widget-section-title', 'Your promo codes'));
                data.coupons.forEach(function (coupon) {
                    stage.appendChild(el('p', 'mb-0', coupon.code + ' · ' + (COUPON_STATUS[coupon.status] || (coupon.applied ? 'Applied' : 'Not applied'))));
                });
            }
            if (data.active.length) {
                stage.appendChild(el('h4', 'chat-widget-section-title', 'Available promotions'));
                data.active.forEach(function (promotion) {
                    stage.appendChild(el('p', 'mb-0', promotion.message + (promotion.requiresCoupon ? ' (promo code required)' : '')));
                });
            }
            finish([button('View cart', function () { open(showCart); }, 'primary'), button('Browse catalog', function () { open(showCategories, null); })]);
        });
    }

    // ------------------------------------------------------- authentication

    /**
     * After sign-in or registration, continue checkout or return to the menu.
     * @param {string} message confirmation message
     */
    function afterAuthentication(message) {
        state.authenticated = true;
        say(message);
        if (state.resumeCheckout) {
            state.resumeCheckout = false;
            history = [];
            current = null;
            open(startCheckout);
        } else {
            home();
        }
    }

    /**
     * Sign-in form posting to Account-Login.
     */
    function showLogin() {
        var node = form('Sign in', function (values) {
            return post(urls.login, values).then(function (data) {
                if (!succeeded(data)) {
                    showFormErrors(node, data);
                    return;
                }
                afterAuthentication('You are signed in.');
            });
        });
        screen('Sign in');
        field(node, { label: 'Email address', name: 'loginEmail', type: 'email', required: true, autocomplete: 'username' });
        field(node, { label: 'Password', name: 'loginPassword', type: 'password', required: true, autocomplete: 'current-password' });
        addSubmit(node);
        stage.appendChild(node);
        finish([
            button('Forgot password?', function () { open(showPasswordReset); }, 'link'),
            button('Create account', function () { open(showRegister); })
        ]);
    }

    /**
     * Registration form posting to Account-SubmitRegistration.
     */
    function showRegister() {
        var node = form('Create account', function (values) {
            return post(urls.register, values).then(function (data) {
                if (!succeeded(data)) {
                    showFormErrors(node, data);
                    return;
                }
                afterAuthentication('Your account is ready and you are signed in.');
            });
        });
        screen('Create account');
        field(node, { label: 'First name', name: 'dwfrm_profile_customer_firstname', required: true, autocomplete: 'given-name', maxLength: 50 });
        field(node, { label: 'Last name', name: 'dwfrm_profile_customer_lastname', required: true, autocomplete: 'family-name', maxLength: 50 });
        field(node, { label: 'Phone number', name: 'dwfrm_profile_customer_phone', type: 'tel', required: true, autocomplete: 'tel' });
        field(node, { label: 'Email address', name: 'dwfrm_profile_customer_email', type: 'email', required: true, autocomplete: 'email', maxLength: 50 });
        field(node, { label: 'Confirm email', name: 'dwfrm_profile_customer_emailconfirm', type: 'email', required: true, autocomplete: 'email', maxLength: 50 });
        field(node, { label: 'Password', name: 'dwfrm_profile_login_password', type: 'password', required: true, autocomplete: 'new-password' });
        field(node, { label: 'Confirm password', name: 'dwfrm_profile_login_passwordconfirm', type: 'password', required: true, autocomplete: 'new-password' });
        addSubmit(node);
        stage.appendChild(node);
        finish([button('I already have an account', function () { open(showLogin); }, 'link')]);
    }

    /**
     * Password reset request form.
     */
    function showPasswordReset() {
        var node = form('Send reset link', function (values) {
            return post(urls.passwordReset, values).then(function (data) {
                if (!data.success) {
                    showFormErrors(node, { fields: { loginEmail: data.message } });
                    return;
                }
                screen('Check your email');
                stage.appendChild(notice(data.message));
                finish([button('Sign in', function () { open(showLogin); }, 'primary')]);
            });
        });
        screen('Reset password');
        field(node, { label: 'Email address', name: 'loginEmail', type: 'email', required: true, autocomplete: 'username' });
        addSubmit(node);
        stage.appendChild(node);
        finish([]);
    }

    /**
     * Sign out through ChatWidget-Logout.
     */
    function logout() {
        loading('Signing out');
        post(urls.logout, {}).then(function () {
            state.authenticated = false;
            state.checkout = null;
            say('You are signed out.');
            home();
        }).catch(function (error) {
            failure('Sign out', error, logout);
        });
    }

    // ---------------------------------------------------------------- account

    /**
     * Account summary with links to every account feature.
     */
    function showAccount() {
        load('Your account', function () { return getJson(urls.account); }, function (data) {
            var profile = data.profile;
            screen('Your account');
            stage.appendChild(summary([
                ['Name', [profile.firstName, profile.lastName].join(' ').trim()],
                ['Email', profile.email],
                ['Phone', profile.phone],
                ['Saved addresses', String(data.counts.addresses)],
                ['Saved cards', String(data.counts.payments)],
                ['Orders (last 6 months)', String(data.counts.recentOrders)],
                ['Orders (all time)', String(data.counts.orders)]
            ]));
            finish([
                button('Edit profile', function () { open(showProfileForm); }, 'primary'),
                button('Addresses', function () { open(showAddresses); }),
                data.counts.payments ? button('Saved cards', function () { open(showPayments); }) : null,
                data.counts.orders ? button('Order history', function () { open(showOrders); }) : null,
                button('Sign out', logout, 'link')
            ]);
        });
    }

    /**
     * Profile edit form posting to Account-SaveProfile (requires the current password).
     */
    function showProfileForm() {
        load('Edit profile', function () { return getJson(urls.account); }, function (data) {
            var profile = data.profile;
            var node = form('Save profile', function (values) {
                return post(urls.saveProfile, values).then(function (result) {
                    if (!succeeded(result)) {
                        showFormErrors(node, result);
                        return;
                    }
                    say('Your profile was updated.');
                    open(showAccount, null, true);
                });
            });
            screen('Edit profile');
            field(node, { label: 'First name', name: 'dwfrm_profile_customer_firstname', value: profile.firstName, required: true, autocomplete: 'given-name', maxLength: 50 });
            field(node, { label: 'Last name', name: 'dwfrm_profile_customer_lastname', value: profile.lastName, required: true, autocomplete: 'family-name', maxLength: 50 });
            field(node, { label: 'Phone number', name: 'dwfrm_profile_customer_phone', type: 'tel', value: profile.phone, required: true, autocomplete: 'tel' });
            field(node, { label: 'Email address', name: 'dwfrm_profile_customer_email', type: 'email', value: profile.email, required: true, autocomplete: 'email', maxLength: 50 });
            field(node, { label: 'Confirm email', name: 'dwfrm_profile_customer_emailconfirm', type: 'email', value: profile.email, required: true, autocomplete: 'email', maxLength: 50 });
            field(node, { label: 'Current password', name: 'dwfrm_profile_login_password', type: 'password', required: true, autocomplete: 'current-password' });
            addSubmit(node);
            stage.appendChild(node);
            finish([]);
        });
    }

    /**
     * Single-line address text.
     * @param {Object} address address payload
     * @returns {string} address text
     */
    function addressText(address) {
        return [address.address1, address.address2, address.city, address.stateCode, address.postalCode, address.countryCode]
            .filter(function (value) { return !!value; }).join(', ');
    }

    /**
     * Add/edit address form posting to Address-SaveAddress.
     * @param {Object} config address (optional), options, returnTo ('checkout' or 'addresses')
     */
    function showAddressForm(config) {
        var address = config.address || {};
        var options = config.options || { countries: [], states: [] };
        var node = form(address.id ? 'Save address' : 'Add address', function (values) {
            return post(withQuery(urls.saveAddress, { addressId: address.id }), values).then(function (data) {
                if (!succeeded(data)) {
                    showFormErrors(node, data);
                    return;
                }
                say(address.id ? 'Address updated.' : 'Address added.');
                if (config.returnTo === 'checkout') {
                    history.pop();
                    open(startCheckout, null, true);
                } else {
                    open(showAddresses, null, true);
                }
            });
        });
        screen(address.id ? 'Edit address' : 'Add an address');
        field(node, { label: 'Address name (e.g. Home)', name: 'dwfrm_address_addressId', value: address.id || '', required: true, maxLength: 20 });
        field(node, { label: 'First name', name: 'dwfrm_address_firstName', value: address.firstName, required: true, autocomplete: 'given-name', maxLength: 50 });
        field(node, { label: 'Last name', name: 'dwfrm_address_lastName', value: address.lastName, required: true, autocomplete: 'family-name', maxLength: 50 });
        field(node, { label: 'Address', name: 'dwfrm_address_address1', value: address.address1, required: true, autocomplete: 'address-line1', maxLength: 50 });
        field(node, { label: 'Address line 2', name: 'dwfrm_address_address2', value: address.address2, autocomplete: 'address-line2', maxLength: 50 });
        field(node, { label: 'City', name: 'dwfrm_address_city', value: address.city, required: true, autocomplete: 'address-level2', maxLength: 50 });
        if (options.states.length) {
            field(node, { label: 'State', name: 'dwfrm_address_states_stateCode', value: address.stateCode, required: true, options: options.states, autocomplete: 'address-level1' });
        }
        field(node, { label: 'Postal code', name: 'dwfrm_address_postalCode', value: address.postalCode, required: true, autocomplete: 'postal-code', maxLength: 10 });
        field(node, { label: 'Country', name: 'dwfrm_address_country', value: address.countryCode, required: true, options: options.countries, autocomplete: 'country' });
        field(node, { label: 'Phone number', name: 'dwfrm_address_phone', type: 'tel', value: address.phone, required: true, autocomplete: 'tel' });
        addSubmit(node);
        stage.appendChild(node);
        finish([]);
    }

    /**
     * Address book with add, edit, delete and set-default.
     */
    function showAddresses() {
        load('Addresses', function () { return getJson(urls.addresses); }, function (data) {
            var list = el('ul', 'chat-widget-lines list-unstyled mb-0 d-flex flex-column');
            screen('Addresses');
            if (!data.addresses.length) stage.appendChild(notice('You have no saved addresses yet.'));
            data.addresses.forEach(function (address) {
                var card = el('li', 'chat-widget-card d-flex flex-column');
                card.appendChild(el('strong', null, address.id + (address.isDefault ? ' · Default' : '')));
                card.appendChild(el('span', null, [address.firstName, address.lastName].join(' ')));
                card.appendChild(el('span', 'chat-widget-muted', addressText(address)));
                card.appendChild(buttonRow([
                    button('Edit', function () { open(showAddressForm, { address: address, options: data.options }); }),
                    address.isDefault ? null : button('Set as default', function () {
                        applyChange(post(urls.defaultAddress, { addressId: address.id }), address.id + ' is now your default address.');
                    }),
                    button('Delete', function () {
                        confirmInline(card, 'Delete the address “' + address.id + '”?', function () {
                            return post(withQuery(urls.deleteAddress, { addressId: address.id, isDefault: address.isDefault ? 'true' : '' }), {}).then(function () {
                                say('Address deleted.');
                                refresh();
                            });
                        });
                    }, 'link')
                ]));
                list.appendChild(card);
            });
            stage.appendChild(list);
            finish([button('Add an address', function () { open(showAddressForm, { options: data.options }); }, 'primary')]);
        });
    }

    /**
     * Saved cards with delete. New cards are not entered here: they must go
     * through the payment provider's tokenisation form.
     */
    function showPayments() {
        load('Saved cards', function () { return getJson(urls.payments); }, function (data) {
            var list = el('ul', 'chat-widget-lines list-unstyled mb-0 d-flex flex-column');
            screen('Saved cards');
            if (!data.payments.length) stage.appendChild(notice('You have no saved cards.'));
            data.payments.forEach(function (payment) {
                var card = el('li', 'chat-widget-card d-flex flex-column');
                card.appendChild(el('strong', null, payment.type + ' ' + payment.masked));
                card.appendChild(el('span', 'chat-widget-muted', 'Expires ' + payment.expiry + (payment.expired ? ' · Expired' : '')));
                card.appendChild(buttonRow([button('Delete', function () {
                    confirmInline(card, 'Delete the ' + payment.type + ' card ' + payment.masked + '?', function () {
                        return post(withQuery(urls.deletePayment, { UUID: payment.uuid }), {}).then(function () {
                            say('Card deleted.');
                            refresh();
                        });
                    });
                }, 'link')]));
                list.appendChild(card);
            });
            stage.appendChild(list);
            stage.appendChild(el('p', 'chat-widget-muted mb-0', 'New cards are added through the store\'s secure card form so the payment provider can tokenise them; the assistant never collects card numbers.'));
            finish([]);
        });
    }

    /**
     * Details of one order.
     * @param {string} orderNo order number
     */
    function showOrder(orderNo) {
        load('Order ' + orderNo, function () { return getJson(urls.order, { orderID: orderNo }); }, function (order) {
            var list = el('ul', 'chat-widget-lines list-unstyled mb-0 d-flex flex-column');
            screen('Order ' + order.orderNo);
            stage.appendChild(summary([
                ['Placed', new Date(order.date).toLocaleDateString()],
                ['Status', order.status],
                ['Ship to', order.shipTo],
                ['Shipping method', order.shippingMethod],
                ['Payment', order.payments.join(', ')]
            ]));
            order.items.forEach(function (item) {
                var line = el('li', 'chat-widget-line d-flex');
                var details = el('div', 'd-flex flex-column');
                var img = image(item.image, item.name);
                if (img) line.appendChild(img);
                details.appendChild(el('strong', null, item.name));
                details.appendChild(el('span', 'chat-widget-muted', 'Qty ' + item.quantity + ' · ' + item.price));
                line.appendChild(details);
                list.appendChild(line);
            });
            stage.appendChild(list);
            stage.appendChild(totalsSummary(order.totals));
            finish([]);
        });
    }

    /**
     * Recent order history.
     */
    function showOrders() {
        load('Order history', function () { return getJson(urls.orders); }, function (data) {
            var list = el('div', 'd-flex flex-column chat-widget-stack');
            screen('Order history');
            if (!data.orders.length) stage.appendChild(notice('You have no orders yet.'));
            data.orders.forEach(function (order) {
                var item = button('', function () { open(showOrder, order.orderNo); }, 'card');
                item.appendChild(el('strong', 'd-block', 'Order ' + order.orderNo + ' · ' + order.total));
                item.appendChild(el('span', 'chat-widget-muted', new Date(order.date).toLocaleDateString() + ' · ' + order.status + ' · ' + order.itemCount + ' items'));
                list.appendChild(item);
            });
            stage.appendChild(list);
            finish([]);
        });
    }

    // --------------------------------------------------------------- checkout

    /**
     * SFRA form fields for an address under a form prefix.
     * @param {string} prefix e.g. dwfrm_shipping_shippingAddress_addressFields_
     * @param {Object} address address payload
     * @returns {Object} form fields
     */
    function addressFields(prefix, address) {
        var fields = {};
        fields[prefix + 'firstName'] = address.firstName;
        fields[prefix + 'lastName'] = address.lastName;
        fields[prefix + 'address1'] = address.address1;
        fields[prefix + 'address2'] = address.address2;
        fields[prefix + 'city'] = address.city;
        fields[prefix + 'postalCode'] = address.postalCode;
        fields[prefix + 'country'] = address.countryCode;
        fields[prefix + 'states_stateCode'] = address.stateCode;
        return fields;
    }

    /**
     * Payment step: saved card plus security code, submitted to CheckoutServices-SubmitPayment.
     */
    function showPaymentStep() {
        var checkout = state.checkout;
        var payment = checkout.payment;
        var node;
        screen('Payment');
        trackClient('checkout_step_entered', { step: 'payment' });
        if (!payment.available) {
            var link = el('a', 'chat-widget-button chat-widget-button-primary', 'Go to secure checkout');
            stage.appendChild(notice(payment.reason, true));
            link.href = checkout.secureCheckoutUrl;
            finish([link, button('View cart', function () { open(showCart); })]);
            return;
        }
        node = form('Review order', function (values) {
            var card = payment.cards.filter(function (item) { return item.uuid === values.storedPaymentUUID; })[0];
            var fields = addressFields('dwfrm_billing_addressFields_', checkout.address);
            if (!card) return window.Promise.reject(new Error('Choose a saved card.'));
            fields.dwfrm_billing_contactInfoFields_phone = checkout.address.phone || checkout.phone;
            fields.dwfrm_billing_paymentMethod = 'CREDIT_CARD';
            fields.storedPaymentUUID = card.uuid;
            fields.securityCode = values.securityCode;
            return post(urls.submitPayment, fields).then(function (data) {
                node.elements.namedItem('securityCode').value = '';
                if (!succeeded(data)) {
                    if (data.cartError) {
                        say('Your cart changed. Please review it before checking out.', 'alert');
                        open(showCart, null, true);
                        return;
                    }
                    showFormErrors(node, data);
                    return;
                }
                checkout.card = card;
                checkout.order = data.order;
                say('Payment method selected: ' + card.type + ' ' + card.masked + '.');
                open(showReviewStep);
            });
        });
        var fieldset = el('fieldset', 'chat-widget-section d-flex flex-column');
        fieldset.appendChild(el('legend', 'chat-widget-section-title', 'Saved card'));
        payment.cards.forEach(function (card, index) {
            var label = el('label', 'chat-widget-choice d-flex align-items-center');
            var input = el('input');
            input.type = 'radio';
            input.name = 'storedPaymentUUID';
            input.value = card.uuid;
            input.required = true;
            input.checked = index === 0;
            label.appendChild(input);
            label.appendChild(el('span', null, card.type + ' ' + card.masked + ' · exp ' + card.expiry));
            fieldset.appendChild(label);
        });
        node.appendChild(fieldset);
        field(node, { label: 'Security code (CVV)', name: 'securityCode', type: 'password', required: true, autocomplete: 'cc-csc', inputMode: 'numeric', pattern: '[0-9]{3,4}', maxLength: 4 });
        node.appendChild(el('p', 'chat-widget-muted mb-0', 'Your security code is sent only to the store\'s payment service for this order and is never saved.'));
        addSubmit(node);
        stage.appendChild(node);
        finish([]);
    }

    /**
     * Delivery step after an address was submitted: shipping method choice.
     * @param {Object} shipping shipping model of the submitted shipment
     */
    function showShippingStep(shipping) {
        var checkout = state.checkout;
        screen('Shipping method');
        stage.appendChild(summary([['Deliver to', [checkout.address.firstName, checkout.address.lastName].join(' ') + ', ' + addressText(checkout.address)]]));
        stage.appendChild(shippingMethods((shipping.applicableShippingMethods || []).map(function (method) {
            return {
                id: method.ID,
                name: method.displayName,
                cost: method.shippingCost,
                arrival: method.estimatedArrivalTime,
                selected: shipping.selectedShippingMethod && shipping.selectedShippingMethod.ID === method.ID
            };
        }), function (methodId) {
            submitShipping(checkout.address, methodId, true);
        }));
        if (checkout.order && checkout.order.totals) {
            stage.appendChild(summary([['Shipping', checkout.order.totals.totalShippingCost], ['Total', checkout.order.totals.grandTotal, true]]));
        }
        finish([button('Continue to payment', function () { open(showPaymentStep); }, 'primary')]);
    }

    /**
     * Submit the chosen saved address (and shipping method) to CheckoutShippingServices-SubmitShipping.
     * @param {Object} address saved address payload
     * @param {string} methodId shipping method ID
     * @param {boolean} replace replace the current screen
     */
    function submitShipping(address, methodId, replace) {
        var fields = addressFields('dwfrm_shipping_shippingAddress_addressFields_', address);
        fields.dwfrm_shipping_shippingAddress_addressFields_phone = address.phone || state.checkout.phone;
        fields.dwfrm_shipping_shippingAddress_shippingMethodID = methodId || state.checkout.selectedShippingMethodId;
        loading('Delivery');
        post(urls.submitShipping, fields).then(function (data) {
            var errors;
            if (!succeeded(data)) {
                errors = collectErrors(data);
                screen('Delivery address needs attention');
                stage.appendChild(notice(errors.general.concat(Object.keys(errors.fields).map(function (key) { return errors.fields[key]; })).join(' ') || 'This address cannot be used for delivery.', true));
                finish([
                    button('Edit this address', function () { open(showAddressForm, { address: address, options: state.checkout.options, returnTo: 'checkout' }); }, 'primary'),
                    button('Choose another address', refresh)
                ]);
                return;
            }
            state.checkout.address = address;
            state.checkout.order = data.order;
            state.checkout.selectedShippingMethodId = data.order.shipping[0].selectedShippingMethod ? data.order.shipping[0].selectedShippingMethod.ID : '';
            open(showShippingStep, data.order.shipping[0], replace);
        }).catch(function (error) {
            failure('Delivery', error, function () { submitShipping(address, methodId, replace); });
        });
    }

    /**
     * Order review and place-order step (CheckoutServices-PlaceOrder).
     */
    function showReviewStep() {
        var checkout = state.checkout;
        var totals = checkout.order.totals;
        var place;
        screen('Review and place order');
        trackClient('checkout_step_entered', { step: 'review' });
        stage.appendChild(summary([
            ['Items', String(checkout.order.items ? checkout.order.items.totalQuantity : '')],
            ['Deliver to', addressText(checkout.address)],
            ['Shipping method', checkout.order.shipping[0].selectedShippingMethod ? checkout.order.shipping[0].selectedShippingMethod.displayName : ''],
            ['Card', checkout.card.type + ' ' + checkout.card.masked]
        ]));
        stage.appendChild(totalsSummary({
            subTotal: totals.subTotal,
            orderDiscount: totals.orderLevelDiscountTotal.value > 0 ? totals.orderLevelDiscountTotal.formatted : '',
            shipping: totals.totalShippingCost,
            shippingDiscount: totals.shippingLevelDiscountTotal.value > 0 ? totals.shippingLevelDiscountTotal.formatted : '',
            tax: totals.totalTax,
            grandTotal: totals.grandTotal
        }));
        place = button('Place order', function () {
            place.disabled = true;
            stage.setAttribute('aria-busy', 'true');
            post(urls.placeOrder, {}).then(function (data) {
                stage.setAttribute('aria-busy', 'false');
                if (data.error !== false || !data.orderID) {
                    place.disabled = false;
                    say(data.errorMessage || 'The order could not be placed.', 'alert');
                    if (data.cartError) open(showCart, null, true);
                    else if (data.errorStage && data.errorStage.stage === 'shipping') open(startCheckout, null, true);
                    else if (data.errorStage && data.errorStage.stage === 'payment') open(showPaymentStep, null, true);
                    else stage.insertBefore(notice(data.errorMessage || 'The order could not be placed.', true), stage.children[1] || null);
                    return;
                }
                state.checkout = null;
                history = [];
                current = null;
                open(showConfirmation, data.orderID);
            }).catch(function (error) {
                stage.setAttribute('aria-busy', 'false');
                place.disabled = false;
                stage.insertBefore(notice(error.message + ' Your order was not placed.', true), stage.children[1] || null);
            });
        }, 'primary');
        stage.appendChild(notice('Payment is authorised only when you place the order.'));
        finish([place, button('Change payment', back)]);
    }

    /**
     * Enter checkout: guests are asked to sign in; signed-in shoppers choose a saved address.
     */
    function startCheckout() {
        if (!state.authenticated) {
            state.resumeCheckout = true;
            screen('Sign in to checkout');
            stage.appendChild(notice('Checkout in the assistant is available to signed-in shoppers.'));
            finish([
                button('Sign in', function () { open(showLogin); }, 'primary'),
                button('Create account', function () { open(showRegister); }),
                button('View cart', function () { open(showCart); })
            ]);
            return;
        }
        load('Delivery address', function () { return getJson(urls.checkout); }, function (data) {
            var list = el('div', 'd-flex flex-column chat-widget-stack');
            state.checkout = data;
            screen('Delivery address');
            if (data.cart.totals) stage.appendChild(summary([['Items', String(data.cart.numItems)], ['Subtotal', data.cart.totals.subTotal]]));
            if (!data.payment.available) stage.appendChild(notice(data.payment.reason));
            if (!data.addresses.length) stage.appendChild(notice('Add a delivery address to continue.'));
            data.addresses.forEach(function (address) {
                var item = button('', function () {
                    submitShipping(address, data.selectedShippingMethodId, false);
                }, 'card');
                item.appendChild(el('strong', 'd-block', address.id + (address.isDefault ? ' · Default' : '')));
                item.appendChild(el('span', 'chat-widget-muted', [address.firstName, address.lastName].join(' ') + ', ' + addressText(address)));
                list.appendChild(item);
            });
            stage.appendChild(list);
            finish([
                button('Add an address', function () { open(showAddressForm, { options: data.options, returnTo: 'checkout' }); }, data.addresses.length ? 'secondary' : 'primary'),
                button('View cart', function () { open(showCart); })
            ]);
        });
    }

    // ---------------------------------------------------- confirmation/review

    /**
     * Review form for a confirmed order.
     * @param {string} orderNo order number
     * @returns {HTMLFormElement} review form
     */
    function reviewForm(orderNo) {
        var node = form('Submit review', function (values) {
            if (values.comment && values.commentConsent !== 'true') {
                return window.Promise.reject(new Error('Please agree to storing your comment, or remove it.'));
            }
            return post(urls.review, {
                orderNo: orderNo,
                rating: values.rating,
                comment: values.comment || '',
                commentConsent: values.commentConsent === 'true' ? 'true' : 'false'
            }).then(function () {
                say('Thank you for reviewing order ' + orderNo + '.');
                screen('Thank you');
                stage.appendChild(notice('Your review was saved.'));
                finish([button('Keep shopping', function () { open(showCategories, null); }, 'primary'), button('Order history', function () { open(showOrders); })], { noBack: true });
            });
        });
        var ratings = el('fieldset', 'chat-widget-section d-flex flex-column');
        var options = el('div', 'd-flex flex-wrap chat-widget-rating');
        var consent = el('label', 'chat-widget-choice d-flex align-items-start');
        var consentInput = el('input');
        ratings.appendChild(el('legend', 'chat-widget-section-title', 'How was your experience?'));
        [1, 2, 3, 4, 5].forEach(function (value) {
            var label = el('label', 'chat-widget-rating-option d-flex align-items-center');
            var input = el('input');
            input.type = 'radio';
            input.name = 'rating';
            input.value = String(value);
            input.required = true;
            label.appendChild(input);
            label.appendChild(el('span', null, value + (value === 1 ? ' star' : ' stars')));
            options.appendChild(label);
        });
        ratings.appendChild(options);
        node.appendChild(ratings);
        field(node, { label: 'Comment', name: 'comment', type: 'textarea', maxLength: 1000 });
        consentInput.type = 'checkbox';
        consentInput.name = 'commentConsent';
        consentInput.value = 'true';
        consent.appendChild(consentInput);
        consent.appendChild(el('span', null, 'I agree that my comment is stored with my review.'));
        node.appendChild(consent);
        addSubmit(node);
        return node;
    }

    /**
     * Confirmation state from ChatWidget-Confirmation, with review form when allowed.
     * @param {string} orderNo order number
     */
    function showConfirmation(orderNo) {
        load('Order confirmation', function () { return getJson(urls.confirmation, { orderID: orderNo }); }, function (data) {
            screen(data.placed ? 'Order placed' : 'Order not completed');
            stage.appendChild(summary([
                ['Order number', data.orderNo],
                ['Total', data.total, true],
                ['Status', data.status],
                ['Confirmation', data.confirmed ? 'Confirmed' : 'Awaiting confirmation']
            ]));
            if (!data.placed) {
                stage.appendChild(notice('This order was not completed, so no payment was taken.', true));
                finish([button('View cart', function () { open(showCart); }, 'primary')], { noBack: true });
                return;
            }
            say('Order ' + data.orderNo + ' is placed. Total ' + data.total + '.');
            if (data.canReview) {
                stage.appendChild(reviewForm(data.orderNo));
            } else if (data.reviewed) {
                stage.appendChild(notice('You have already reviewed this order. Thank you!'));
            } else if (!state.authenticated) {
                stage.appendChild(notice('Reviews are available for orders placed while signed in to an account.'));
            }
            finish([button('Keep shopping', function () { open(showCategories, null); })], { noBack: true });
        });
    }

    // --------------------------------------------------------------- dispatch

    /**
     * Run a start-menu action.
     * @param {string} action capability ID
     * @param {Object} capabilities capabilities payload
     */
    function runAction(action, capabilities) {
        var screens = {
            shop: function () { open(showCategories, null); },
            search: function () { open(showSearch); },
            cart: function () { open(showCart); },
            promotions: function () { open(showPromotions); },
            login: function () { open(showLogin); },
            register: function () { open(showRegister); },
            'reset-password': function () { open(showPasswordReset); },
            checkout: function () { open(startCheckout); },
            account: function () { open(showAccount); },
            profile: function () { open(showProfileForm); },
            addresses: function () { open(showAddresses); },
            payments: function () { open(showPayments); },
            orders: function () { open(showOrders); },
            review: function () { open(showConfirmation, capabilities.reviewOrderNo); },
            logout: logout
        };
        if (screens[action]) screens[action]();
    }

    /**
     * Show or hide the panel.
     * @param {boolean} isOpen panel visibility
     * @param {boolean} [silent] skip journey tracking
     */
    function setOpen(isOpen, silent) {
        if (isOpen === !panel.hidden) return;
        panel.hidden = !isOpen;
        launcher.setAttribute('aria-expanded', String(isOpen));
        if (!silent) trackClient(isOpen ? 'widget_opened' : 'widget_closed');
        if (!isOpen) {
            launcher.focus();
            return;
        }
        if (!state.started) {
            state.started = true;
            home();
        } else {
            var heading = stage.querySelector('.chat-widget-screen-title');
            if (heading) heading.focus({ preventScroll: true });
        }
    }

    launcher.addEventListener('click', function () { setOpen(panel.hidden); });
    closeButton.addEventListener('click', function () { setOpen(false); });
    backButton.addEventListener('click', back);
    homeButton.addEventListener('click', home);
    panel.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setOpen(false);
    });

    (function autoOpen() {
        var confirmedOrder = widget.getAttribute('data-confirmed-order');
        var seen = false;
        if (confirmedOrder) {
            state.started = true;
            setOpen(true);
            open(showConfirmation, confirmedOrder);
            return;
        }
        try {
            seen = window.sessionStorage.getItem('chat-widget-greeted') === '1';
            window.sessionStorage.setItem('chat-widget-greeted', '1');
        } catch (e) {
            seen = true;
        }
        if (!seen) window.setTimeout(function () { setOpen(true); }, 800);
    }());
});
