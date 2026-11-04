'use strict';

var promoBanner = require('./components/beyon-promo-banner');

var root = document.getElementById('beyon-cart');
var STORAGE_KEY = 'beyon-cart';
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Sample serviceability from the design. Placeholder until the backend exists.
var PINCODE_DB = {
    110001: { ok: true, date: '20 Jun' },
    400001: { ok: true, date: '19 Jun' },
    560001: { ok: true, date: '21 Jun' },
    700001: { ok: true, date: '22 Jun' },
    600001: { ok: true, date: '18 Jun' },
    500001: { ok: false }
};
var CONFETTI_COLOURS = ['#BF0E23', '#C5A575', '#E8D8BE', '#2E7D32', '#4A90D9', '#FFD700', '#FF6B9D'];

var subtotalElement = document.getElementById('summary-subtotal');
var coupon = null;
var discount = 0;
var removeTarget = null;
var pincodeState = null;
var toastTimer = null;

/**
 * Returns the matching elements as an array.
 * @param {string} selector - css selector
 * @param {Element} [scope] - search root
 * @returns {Array} elements
 */
function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
}

/**
 * Reads a message from the root data attributes.
 * @param {string} name - attribute suffix
 * @returns {string} message
 */
function msg(name) {
    return root.getAttribute('data-msg-' + name);
}

/**
 * Reads the numeric value of a formatted price.
 * @param {string} formatted - formatted money
 * @returns {number} amount
 */
function amountOf(formatted) {
    return parseFloat(String(formatted).replace(/[^0-9.]/g, '')) || 0;
}

/**
 * Formats an amount with the site's currency symbol.
 * @param {number} amount - value
 * @returns {string} formatted money
 */
function money(amount) {
    var symbol = String(subtotalElement.getAttribute('data-amount')).replace(/[\d.,\s]/g, '');
    return symbol + amount.toFixed(2);
}

/**
 * Shows a toast.
 * @param {string} message - toast text
 * @param {string} [type] - success or error
 */
function showToast(message, type) {
    var toast = document.getElementById('beyon-toast');
    toast.textContent = message;
    toast.className = 'beyon-toast ' + (type || 'success');
    window.requestAnimationFrame(function () {
        toast.classList.add('show');
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
            toast.classList.add('d-none');
        }, 500);
    }, 2800);
}

/**
 * Bursts confetti for an applied coupon.
 */
function fireConfetti() {
    var container = document.getElementById('confetti-container');
    for (var i = 0; i < 40; i++) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = (Math.random() * 100) + '%';
        piece.style.background = CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)];
        piece.style.width = ((Math.random() * 8) + 4) + 'px';
        piece.style.height = ((Math.random() * 8) + 4) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = ((Math.random() * 2) + 1.5) + 's';
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        container.appendChild(piece);
    }
    setTimeout(function () {
        container.innerHTML = '';
    }, 3500);
}

/**
 * Recomputes the placeholder coupon discount against the current subtotal.
 */
function recalculate() {
    var subtotal = amountOf(subtotalElement.getAttribute('data-amount'));
    if (!coupon) {
        discount = 0;
        return;
    }
    if (coupon.kind === 'percent') {
        discount = Math.min(subtotal * (coupon.value / 100), coupon.max);
    } else {
        discount = Math.min(coupon.value, subtotal);
    }
}

/**
 * Keeps the coupon choice for the checkout page's placeholder summary.
 */
function persistCoupon() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: coupon ? coupon.code : null, discount: discount }));
    } catch (e) {
        // Blocked storage only loses the placeholder discount.
    }
}

/**
 * Draws the order summary and the coupon card.
 */
function renderSummary() {
    var subtotal = amountOf(subtotalElement.getAttribute('data-amount'));
    var total = Math.max(0, subtotal - discount);
    var discountRow = document.getElementById('discount-row');
    var status = document.getElementById('coupon-status');

    subtotalElement.textContent = money(subtotal);
    all('.js-total').forEach(function (element) {
        var node = element;
        node.textContent = money(total);
    });
    discountRow.classList.toggle('d-none', discount <= 0);
    discountRow.classList.toggle('d-flex', discount > 0);
    document.getElementById('summary-discount').textContent = '-' + money(discount);

    document.querySelector('.coupon-chevron').classList.toggle('d-none', !!coupon);
    document.getElementById('coupon-remove').classList.toggle('d-none', !coupon);
    if (coupon) {
        status.innerHTML = '';
        var code = document.createElement('span');
        code.className = 'coupon-code-applied';
        code.textContent = coupon.code;
        status.appendChild(code);
        status.appendChild(document.createTextNode(' ' + msg('saving') + ' ' + money(discount)));
    } else {
        status.textContent = msg('status');
    }

    all('.coupon-available').forEach(function (card) {
        var applied = !!coupon && coupon.code === card.getAttribute('data-coupon');
        var button = card.querySelector('.coupon-apply-btn');
        card.classList.toggle('is-applied', applied);
        button.classList.toggle('is-applied', applied);
        button.textContent = button.getAttribute(applied ? 'data-applied-label' : 'data-apply-label');
    });
    persistCoupon();
}

/**
 * Draws the pincode result under each item.
 */
function renderDelivery() {
    all('.cart-item').forEach(function (item, position) {
        var holder = item.querySelector('.item-delivery');
        var outOfStock = item.getAttribute('data-out') === 'true';
        holder.innerHTML = '';
        if (!pincodeState) {
            return;
        }
        var box = document.createElement('div');
        var line = document.createElement('p');
        if (outOfStock || !pincodeState.ok) {
            box.className = 'delivery-bad anim-scale';
            line.textContent = outOfStock ? msg('no-stock') : msg('no-delivery') + ' ' + pincodeState.value;
            box.appendChild(line);
        } else {
            var parts = pincodeState.date.split(' ');
            var day = parseInt(parts[0], 10) + position;
            var sub = document.createElement('p');
            box.className = 'delivery-ok anim-scale';
            line.className = 'delivery-ok-title';
            line.textContent = msg('delivery-by') + ' ' + day + ' ' + parts[1];
            sub.className = 'delivery-ok-sub';
            sub.textContent = pincodeState.flag + ' ' + msg('free-express');
            box.appendChild(line);
            box.appendChild(sub);
        }
        holder.appendChild(box);
    });
}

/**
 * Switches to the empty state once no items remain.
 */
function syncEmptyState() {
    var empty = all('.cart-item').length === 0;
    document.getElementById('empty-state').classList.toggle('d-none', !empty);
    ['pincode-section', 'sidebar-wrap', 'sticky-cta'].forEach(function (id) {
        document.getElementById(id).classList.toggle('d-none', empty);
    });
    document.getElementById('header-count').textContent = all('.cart-item').length;
}

/**
 * Removes a line through the base route and updates the summary.
 * @param {Element} item - the cart line element
 * @param {string} message - toast text on success
 */
function removeLine(item, message) {
    fetch(item.getAttribute('data-remove-url'), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.json();
        })
        .then(function (data) {
            var basket = data.basket;
            if (basket && basket.totals) {
                subtotalElement.setAttribute('data-amount', basket.totals.subTotal);
            }
            item.classList.add('removing');
            setTimeout(function () {
                item.remove();
                recalculate();
                renderSummary();
                syncEmptyState();
                showToast(message);
            }, 420);
        })
        .catch(function () {
            showToast(msg('remove-failed'), 'error');
        });
}

/**
 * Opens or closes one of the drawers.
 * @param {string} name - coupon or remove
 * @param {boolean} open - desired state
 */
function setDrawer(name, open) {
    document.getElementById(name + '-overlay').classList.toggle('active', open);
    document.getElementById(name + '-drawer').classList.toggle('open', open);
}

/**
 * Shows the result line in the coupon drawer.
 * @param {string} text - message
 * @param {boolean} ok - success state
 */
function showCouponMessage(text, ok) {
    var holder = document.getElementById('coupon-message');
    var inner = document.createElement('div');
    inner.className = 'coupon-message-inner anim-scale ' + (ok ? 'is-ok' : 'is-error');
    inner.textContent = text;
    holder.innerHTML = '';
    holder.appendChild(inner);
    holder.classList.remove('d-none');
}

/**
 * Applies a sample coupon. Placeholder: discounts display only, the basket isn't changed.
 * @param {string} code - coupon code
 */
function applyCoupon(code) {
    var card = root.querySelector('.coupon-available[data-coupon="' + code + '"]');
    if (!card) {
        showCouponMessage(msg('invalid'), false);
        return;
    }
    if (coupon && coupon.code === code) {
        showCouponMessage(msg('already'), false);
        return;
    }
    coupon = {
        code: code,
        kind: card.getAttribute('data-kind'),
        value: parseFloat(card.getAttribute('data-discount')),
        max: parseFloat(card.getAttribute('data-max'))
    };
    recalculate();
    renderSummary();
    showCouponMessage(card.getAttribute('data-icon') + ' ' + msg('applied') + ' ' + money(discount), true);
    fireConfetti();
    setTimeout(function () {
        setDrawer('coupon', false);
    }, 1400);
}

/**
 * Sample pincode check copied from the design.
 */
function checkPincode() {
    var value = document.getElementById('pincode-input').value.trim();
    var select = document.getElementById('country-select');
    var option = select.options[select.selectedIndex];
    if (value.length < 3) {
        showToast(msg('postal'), 'error');
        return;
    }
    var result = select.value === 'IN' ? PINCODE_DB[value] : null;
    if (!result) {
        var future = new Date();
        future.setDate(future.getDate() + Math.floor(Math.random() * 8) + 3);
        result = { ok: Math.random() > 0.25, date: future.getDate() + ' ' + MONTHS[future.getMonth()] };
    }
    pincodeState = { ok: result.ok, date: result.date, value: value, flag: option.getAttribute('data-flag') };
    var label = option.getAttribute('data-flag') + ' ' + option.getAttribute('data-name');
    showToast((result.ok ? msg('available') : msg('unavailable')) + ' ' + label, result.ok ? 'success' : 'error');
    renderDelivery();
}

root.addEventListener('click', function (event) {
    var target = event.target;
    var match = function (selector) {
        return target.closest(selector);
    };
    if (match('.js-back')) {
        if (window.history.length > 1) {
            event.preventDefault();
            window.history.back();
        }
    } else if (match('.js-request-remove')) {
        removeTarget = match('.cart-item');
        setDrawer('remove', true);
    } else if (match('.js-move-wishlist')) {
        removeLine(match('.cart-item'), msg('moved'));
    } else if (match('.js-remove-cancel') || target.id === 'remove-overlay') {
        removeTarget = null;
        setDrawer('remove', false);
    } else if (match('#remove-confirm')) {
        setDrawer('remove', false);
        if (removeTarget) {
            removeLine(removeTarget, msg('removed'));
            removeTarget = null;
        }
    } else if (match('#coupon-remove')) {
        coupon = null;
        recalculate();
        renderSummary();
        showToast(msg('coupon-removed'));
    } else if (match('#coupon-section')) {
        document.getElementById('coupon-input').value = '';
        document.getElementById('coupon-message').classList.add('d-none');
        setDrawer('coupon', true);
    } else if (match('.js-coupon-close') || target.id === 'coupon-overlay') {
        setDrawer('coupon', false);
    } else if (match('#coupon-apply')) {
        var code = document.getElementById('coupon-input').value.trim().toUpperCase();
        if (code) {
            applyCoupon(code);
        } else {
            showToast(msg('enter-code'), 'error');
        }
    } else if (match('.coupon-apply-btn')) {
        applyCoupon(match('.coupon-available').getAttribute('data-coupon'));
    } else if (match('#pincode-check')) {
        checkPincode();
    } else if (match('.js-checkout')) {
        persistCoupon();
        window.location.href = root.getAttribute('data-checkout-url');
    }
});

document.getElementById('pincode-input').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        checkPincode();
    }
});
document.getElementById('country-select').addEventListener('change', function () {
    pincodeState = null;
    renderDelivery();
});
document.getElementById('coupon-section').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.getElementById('coupon-section').click();
    }
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        setDrawer('coupon', false);
        setDrawer('remove', false);
    }
});

all('.cart-item').forEach(function (item, position) {
    item.style.setProperty('animation-delay', ((position * 80) + 100) + 'ms');
});
renderSummary();

if (document.getElementById('promo-banner')) {
    promoBanner();
}
