'use strict';

// Checkout is a placeholder: addresses, PAN, NeuCoins and payment stay in this page and no order is created.
var root = document.getElementById('beyon-checkout');
var copy = JSON.parse(root.getAttribute('data-copy'));
var subtotal = parseFloat(String(root.getAttribute('data-subtotal')).replace(/[^0-9.]/g, '')) || 0;
var symbol = String(root.getAttribute('data-subtotal')).replace(/[\d.,\s]/g, '');

var PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
var MAX_PAN_RETRIES = 3;
var PAN_DB = {
    ABCDE1234F: { ok: true, name: 'RAHUL SHARMA' },
    BXYPD5678G: { ok: true, name: 'RAHUL KUMAR SHARMA' },
    CZPQA9012H: { ok: false, title: 'panInactive', msg: 'panInactiveMsg', retry: true },
    DXYEF3456J: { ok: false, title: 'panNotFound', msg: 'panNotFoundDbMsg', retry: true },
    EABCD7890K: { ok: true, name: 'PRIYA SHARMA' },
    FGHIJ1234L: { ok: false, title: 'panInvalid', msg: 'panInvalidMsg', retry: false }
};
var PIN_LOCATIONS = {
    110001: ['Delhi', 'New Delhi'],
    400001: ['Maharashtra', 'Mumbai'],
    560001: ['Karnataka', 'Bengaluru'],
    700001: ['West Bengal', 'Kolkata'],
    600001: ['Tamil Nadu', 'Chennai']
};

var addresses = [
    { id: 'a1', type: 'HOME', firstName: 'Rahul', lastName: 'Sharma', phone: '9876543210', country: 'India', pincode: '110001', state: 'Delhi', city: 'New Delhi', building: 'B-204, Sunrise Apartments', street: 'MG Road, Connaught Place', landmark: 'Near Metro Station', isDefault: true },
    { id: 'a2', type: 'WORK', firstName: 'Rahul', lastName: 'Sharma', phone: '9876543210', country: 'India', pincode: '400001', state: 'Maharashtra', city: 'Mumbai', building: 'Office 1502, Tower A', street: 'BKC, Bandra East', landmark: '', isDefault: false },
    { id: 'a3', type: 'HOME', firstName: 'Priya', lastName: 'Sharma', phone: '9988776655', country: 'India', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', building: 'Flat 7B, Lake View Residency', street: 'Indiranagar 100ft Road', landmark: 'Opposite City Park', isDefault: false },
    { id: 'a4', type: 'OTHER', firstName: 'Rahul', lastName: 'Sharma', phone: '9876543210', country: 'India', pincode: '600001', state: 'Tamil Nadu', city: 'Chennai', building: 'No. 12, Greenways Road', street: 'Raja Annamalaipuram', landmark: 'Near Temple', isDefault: false },
    { id: 'a5', type: 'WORK', firstName: 'Priya', lastName: 'Sharma', phone: '9988776655', country: 'India', pincode: '700001', state: 'West Bengal', city: 'Kolkata', building: '3rd Floor, Camac Towers', street: 'Camac Street', landmark: '', isDefault: false }
];
var selectedAddressId = 'a1';
var editingId = null;
var addressType = 'HOME';
var neu = { balance: 500, redeemed: 0 };
var selectedPayment = 'card';
var couponDiscount = 0;
var panVerifying = false;
var panAttempts = 0;
var toastTimer = null;

var PENCIL = '<svg aria-hidden="true" width="14" height="14" fill="none" stroke="#BF0E23" stroke-width="1.8" stroke-linecap="round"><path d="M10 2l2 2-7 7H3v-2z"/></svg>';
var TRASH = '<svg aria-hidden="true" width="14" height="14" fill="none" stroke="#BF0E23" stroke-width="1.8" stroke-linecap="round"><polyline points="3 4 4 4 11 4"/><path d="M9 4V3a1 1 0 00-1-1H6a1 1 0 00-1 1v1"/><path d="M4 4l.7 8a1 1 0 001 1h2.6a1 1 0 001-1L10 4"/></svg>';
var CHECK = '<svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M2 7l3.5 3.5L12 4"/></svg>';
var SPINNER = '<svg class="spin-icon" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" stroke-dasharray="30" stroke-dashoffset="10"/></svg>';

/**
 * Finds an element by id.
 * @param {string} id - element id
 * @returns {Element} element
 */
function byId(id) {
    return document.getElementById(id);
}

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
 * Escapes text for use inside markup.
 * @param {string} value - raw text
 * @returns {string} escaped text
 */
function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Formats an amount with the site's currency symbol.
 * @param {number} amount - value
 * @returns {string} formatted money
 */
function money(amount) {
    return symbol + amount.toFixed(2);
}

/**
 * Shows or hides an element.
 * @param {string} id - element id
 * @param {boolean} visible - desired state
 */
function setVisible(id, visible) {
    byId(id).classList.toggle('d-none', !visible);
}

/**
 * Shows a toast.
 * @param {string} message - toast text
 * @param {string} [type] - success or error
 */
function showToast(message, type) {
    var toast = byId('beyon-toast');
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
 * Amount left to pay after the placeholder discounts.
 * @returns {number} total
 */
function finalTotal() {
    return Math.max(0, subtotal - couponDiscount - neu.redeemed);
}

/**
 * Finds the selected address.
 * @returns {Object} address
 */
function currentAddress() {
    return addresses.filter(function (address) {
        return address.id === selectedAddressId;
    })[0] || addresses[0];
}

/**
 * Builds the tags row of an address.
 * @param {Object} address - address
 * @returns {string} markup
 */
function addressTags(address) {
    var kind = address.type.toLowerCase();
    return '<div class="d-flex align-items-center address-tags"><span class="address-type address-type-' + kind + '">' + esc(address.type) + '</span>'
        + (address.isDefault ? '<span class="address-default">' + esc(copy.default) + '</span>' : '') + '</div>';
}

/**
 * Draws the selected address, or the no-address state with nothing saved.
 */
function renderSelectedAddress() {
    var address = currentAddress();
    var hasAddress = !!address;
    root.classList.toggle('is-no-address', !hasAddress);
    setVisible('no-address-card', !hasAddress);
    all('.sticky-btn').forEach(function (button) {
        var isAddressButton = button.classList.contains('js-needs-address-btn');
        var show = isAddressButton ? !hasAddress : hasAddress;
        button.classList.toggle('d-none', !show);
        button.classList.toggle('d-flex', show);
    });
    all('.js-needs-address').forEach(function (card) {
        card.classList.toggle('d-none', !hasAddress);
    });
    if (!hasAddress) {
        byId('selected-address').innerHTML = '';
        return;
    }
    byId('selected-address').innerHTML = '<div class="address-box is-current">'
        + '<div class="d-flex align-items-start justify-content-between address-top">' + addressTags(address)
        + '<button type="button" class="address-icon-btn js-edit-address" data-id="' + esc(address.id) + '">' + PENCIL + '</button></div>'
        + '<p class="address-name">' + esc(address.firstName + ' ' + address.lastName) + '</p>'
        + '<p class="address-line is-first">' + esc(address.building + ', ' + address.street + (address.landmark ? ', ' + address.landmark : '')) + '</p>'
        + '<p class="address-line">' + esc(address.city + ', ' + address.state + ' — ' + address.pincode) + '</p>'
        + '<p class="address-line">' + esc(address.phone) + '</p>'
        + '<p class="address-state d-flex align-items-center">' + CHECK + esc(copy.delivering) + '</p></div>';
}

/**
 * Draws every saved address in the picker.
 */
function renderAllAddresses() {
    byId('all-address-list').innerHTML = addresses.map(function (address) {
        var selected = address.id === selectedAddressId;
        return '<div class="address-box ' + (selected ? 'is-current' : 'is-other') + '">'
            + '<div class="d-flex align-items-start justify-content-between address-top">' + addressTags(address)
            + '<div class="d-flex address-actions"><button type="button" class="address-icon-btn js-edit-address" data-id="' + esc(address.id) + '">' + PENCIL + '</button>'
            + (address.isDefault ? '' : '<button type="button" class="address-icon-btn is-delete js-delete-address" data-id="' + esc(address.id) + '">' + TRASH + '</button>') + '</div></div>'
            + '<p class="address-name">' + esc(address.firstName + ' ' + address.lastName) + '</p>'
            + '<p class="address-line is-first">' + esc(address.building + ', ' + address.street) + '</p>'
            + '<p class="address-line">' + esc(address.city + ', ' + address.state + ' — ' + address.pincode) + '</p>'
            + (selected
                ? '<p class="address-state d-flex align-items-center">' + CHECK + esc(copy.selected) + '</p>'
                : '<button type="button" class="btn-cta address-use w-100 js-use-address" data-id="' + esc(address.id) + '">' + esc(copy.useAddress) + '</button>')
            + '</div>';
    }).join('');
}

/**
 * Draws the price card.
 */
function renderSummary() {
    byId('ck-subtotal').textContent = money(subtotal);
    all('.js-total').forEach(function (element) {
        var node = element;
        node.textContent = money(finalTotal());
    });
    byId('ck-coupon-row').classList.toggle('d-none', couponDiscount <= 0);
    byId('ck-coupon-row').classList.toggle('d-flex', couponDiscount > 0);
    byId('ck-coupon-disc').textContent = '-' + money(couponDiscount);
    byId('ck-neu-row').classList.toggle('d-none', neu.redeemed <= 0);
    byId('ck-neu-row').classList.toggle('d-flex', neu.redeemed > 0);
    byId('ck-neu-disc').textContent = '-' + money(neu.redeemed);
}

/**
 * Opens or closes a drawer.
 * @param {string} name - drawer name
 * @param {boolean} open - desired state
 */
function setDrawer(name, open) {
    all('.js-drawer-overlay[data-drawer="' + name + '"]').forEach(function (overlay) {
        overlay.classList.toggle('active', open);
    });
    byId(name + '-drawer').classList.toggle('open', open);
}

/**
 * Opens or closes an edge case popup.
 * @param {string} number - popup number
 * @param {boolean} open - desired state
 */
function setPopup(number, open) {
    root.querySelector('.js-popup-overlay[data-popup="' + number + '"]').classList.toggle('active', open);
    byId('popup-' + number).classList.toggle('open', open);
}

/**
 * Opens the address form for a new or existing address.
 * @param {string} [id] - address to edit
 */
function openAddressForm(id) {
    var form = byId('addr-form');
    var address = addresses.filter(function (item) {
        return item.id === id;
    })[0];
    form.reset();
    all('.error-text', form).forEach(function (error) {
        error.classList.add('d-none');
    });
    all('.input-error', form).forEach(function (field) {
        field.classList.remove('input-error');
    });
    editingId = address ? address.id : null;
    addressType = address ? address.type : 'HOME';
    byId('addr-drawer-title').textContent = address ? copy.editTitle : copy.addTitle;
    if (address) {
        byId('addr-first').value = address.firstName;
        byId('addr-last').value = address.lastName;
        byId('addr-phone').value = address.phone;
        byId('addr-pin').value = address.pincode;
        byId('addr-state').value = address.state;
        byId('addr-city').value = address.city;
        byId('addr-building').value = address.building;
        byId('addr-street').value = address.street;
        byId('addr-landmark').value = address.landmark || '';
        byId('addr-country').value = address.country;
    }
    all('.addr-tab').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-type') === addressType);
    });
    byId('default-toggle').classList.toggle('on', !!(address && address.isDefault));
    byId('default-toggle').setAttribute('aria-checked', address && address.isDefault ? 'true' : 'false');
    setDrawer('addr', true);
}

/**
 * Validates and stores the address in the page.
 */
function saveAddress() {
    var valid = true;
    [['addr-first', 'err-first'], ['addr-last', 'err-last'], ['addr-phone', 'err-phone'], ['addr-pin', 'err-pin'], ['addr-state', 'err-state'], ['addr-city', 'err-city'], ['addr-building', 'err-building'], ['addr-street', 'err-street']].forEach(function (pair) {
        var filled = !!byId(pair[0]).value.trim();
        byId(pair[0]).classList.toggle('input-error', !filled);
        byId(pair[1]).classList.toggle('d-none', filled);
        valid = valid && filled;
    });
    var phone = byId('addr-phone').value.trim();
    if (phone && !/^\d{10}$/.test(phone)) {
        byId('addr-phone').classList.add('input-error');
        byId('err-phone').classList.remove('d-none');
        valid = false;
    }
    if (!valid) {
        return;
    }
    var isDefault = byId('default-toggle').classList.contains('on');
    var address = {
        id: editingId || 'a' + Date.now(),
        type: addressType,
        firstName: byId('addr-first').value.trim(),
        lastName: byId('addr-last').value.trim(),
        phone: phone,
        country: byId('addr-country').value,
        pincode: byId('addr-pin').value.trim(),
        state: byId('addr-state').value.trim(),
        city: byId('addr-city').value.trim(),
        building: byId('addr-building').value.trim(),
        street: byId('addr-street').value.trim(),
        landmark: byId('addr-landmark').value.trim(),
        isDefault: isDefault
    };
    if (isDefault) {
        addresses = addresses.map(function (item) {
            return Object.assign({}, item, { isDefault: false });
        });
    }
    if (editingId) {
        addresses = addresses.map(function (item) {
            return item.id === editingId ? address : item;
        });
        showToast(copy.addressUpdated);
    } else {
        addresses.push(address);
        selectedAddressId = address.id;
        showToast(copy.addressAdded);
    }
    setDrawer('addr', false);
    setDrawer('all-addr', false);
    renderSelectedAddress();
}

/**
 * Enables Verify PAN once both fields are valid.
 */
function updateVerifyButton() {
    var name = byId('pan-name').value.trim();
    var pan = byId('pan-number').value.trim();
    var button = byId('pan-verify-btn');
    var valid = name.length >= 2 && PAN_REGEX.test(pan) && !/[0-9]/.test(name) && !/[^A-Za-z\s.]/.test(name);
    button.disabled = !valid;
    button.style.setProperty('opacity', valid ? '1' : '0.5');
}

/**
 * Shows the PAN error state.
 * @param {string} title - error title
 * @param {string} message - error text
 * @param {boolean} allowRetry - show Try Again
 */
function showPanError(title, message, allowRetry) {
    setVisible('pan-error', true);
    setVisible('pan-form-area', true);
    byId('pan-error-title').textContent = title;
    byId('pan-error-msg').textContent = message;
    byId('pan-retry-btn').classList.toggle('d-none', !allowRetry);
    byId('pan-retry-btn').classList.toggle('d-flex', allowRetry);
}

/**
 * Shows the PAN success state.
 * @param {string} name - verified name
 * @param {string} pan - PAN number
 */
function showPanSuccess(name, pan) {
    panAttempts = 0;
    setVisible('pan-success', true);
    setVisible('pan-form-area', false);
    byId('pan-success-name').textContent = name;
    byId('pan-success-pan').textContent = pan.slice(0, 2) + '****' + pan.slice(6);
}

/**
 * Sample PAN check copied from the design. Nothing is sent to a tax service.
 */
function verifyPan() {
    if (panVerifying) {
        return;
    }
    var name = byId('pan-name').value.trim().toUpperCase();
    var pan = byId('pan-number').value.trim().toUpperCase();
    panVerifying = true;
    panAttempts += 1;
    setVisible('pan-form-area', false);
    setVisible('pan-loading', true);
    setVisible('pan-success', false);
    setVisible('pan-error', false);
    setVisible('pan-mismatch', false);
    setTimeout(function () {
        var entry = PAN_DB[pan];
        setVisible('pan-loading', false);
        panVerifying = false;
        if (!entry) {
            if (panAttempts > MAX_PAN_RETRIES) {
                showPanError(copy.panTooMany, copy.panTooManyMsg, false);
            } else {
                showPanError(copy.panNotFound, copy.panNotFoundMsg, true);
            }
            return;
        }
        if (!entry.ok) {
            showPanError(copy[entry.title] || copy.panFailed, copy[entry.msg], entry.retry);
            return;
        }
        if (name === entry.name) {
            showPanSuccess(name, pan);
            return;
        }
        var entered = name.split(/\s+/);
        var actual = entry.name.split(/\s+/);
        var close = entered[0] === actual[0] || entered[entered.length - 1] === actual[actual.length - 1];
        setVisible('pan-mismatch', true);
        byId('mismatch-entered').textContent = name;
        byId('mismatch-actual').textContent = entry.name;
        byId('pan-mismatch-msg').textContent = close ? copy.panMinor : copy.panMajor;
    }, 2000);
}

/**
 * Validates the coin entry as it's typed.
 */
function validateNeuInput() {
    var value = parseInt(byId('neu-input').value, 10) || 0;
    var holder = byId('neu-message');
    var message = '';
    if (value > neu.balance) {
        message = copy.neuBalanceError;
    } else if (value > finalTotal() + neu.redeemed) {
        message = copy.neuTotalError;
    }
    holder.classList.toggle('d-none', !message);
    holder.innerHTML = message ? '<p>' + esc(message) + '</p>' : '';
}

/**
 * Draws the NeuCoin balance.
 * @param {number} coins - coins left
 */
function renderBalance(coins) {
    byId('neu-balance').textContent = coins + ' ' + copy.neuCoins;
}

/**
 * Redeems sample NeuCoins. Placeholder: no real balance is touched.
 */
function applyNeu() {
    var value = parseInt(byId('neu-input').value, 10) || 0;
    if (value <= 0) {
        showToast(copy.neuEnter, 'error');
        return;
    }
    if (value > neu.balance) {
        showToast(copy.neuExceed, 'error');
        return;
    }
    var coins = Math.min(value, subtotal - couponDiscount);
    neu.redeemed = coins;
    setVisible('neu-applied', true);
    byId('neu-applied-text').textContent = coins + ' ' + copy.neuRedeemed + ' (' + money(coins) + ' ' + copy.off + ')';
    renderBalance(neu.balance - coins);
    setVisible('neu-apply', false);
    renderSummary();
    showToast(coins + ' ' + copy.neuApplied);
}

/**
 * Shows the confirmation screen. Placeholder: no order is created and the basket stays as it is.
 */
function showConfirmation() {
    var address = currentAddress();
    var template = byId('confirmation-template').firstElementChild.cloneNode(true);
    template.querySelector('.js-order-number').textContent = String(Date.now()).slice(-6);
    template.querySelector('.js-confirm-line1').textContent = address.building + ', ' + address.street;
    template.querySelector('.js-confirm-line2').textContent = address.city + ', ' + address.state;
    template.querySelector('.js-confirm-amount').textContent = money(finalTotal());
    byId('checkout-main').innerHTML = '';
    byId('checkout-main').appendChild(template);
    setVisible('sticky-cta', false);
    window.scrollTo(0, 0);
}

/**
 * Runs the design's place order sequence.
 */
function placeOrder() {
    if (!addresses.length) {
        showToast(copy.needAddress, 'error');
        return;
    }
    if (!selectedPayment) {
        showToast(copy.needPayment, 'error');
        return;
    }
    all('.js-place-order').forEach(function (button) {
        var target = button;
        target.disabled = true;
        target.querySelector('.js-order-label').innerHTML = esc(copy.processing) + ' ' + SPINNER;
    });
    setTimeout(function () {
        showToast(copy.placed);
        setTimeout(showConfirmation, 800);
    }, 1500);
}

root.addEventListener('click', function (event) {
    var target = event.target;
    var match = function (selector) {
        return target.closest(selector);
    };
    if (match('.js-back')) {
        event.preventDefault();
        window.location.href = root.getAttribute('data-cart-url');
    } else if (match('.js-add-address')) {
        openAddressForm();
    } else if (match('.js-edit-address')) {
        openAddressForm(match('.js-edit-address').getAttribute('data-id'));
    } else if (match('.js-delete-address')) {
        var deleted = match('.js-delete-address').getAttribute('data-id');
        addresses = addresses.filter(function (address) {
            return address.id !== deleted;
        });
        if (selectedAddressId === deleted && addresses.length) {
            selectedAddressId = addresses[0].id;
        }
        renderAllAddresses();
        renderSelectedAddress();
        showToast(copy.addressDeleted);
    } else if (match('.js-use-address')) {
        selectedAddressId = match('.js-use-address').getAttribute('data-id');
        setDrawer('all-addr', false);
        renderSelectedAddress();
        showToast(copy.addressUpdated);
    } else if (match('#view-all-addresses')) {
        renderAllAddresses();
        setDrawer('all-addr', true);
    } else if (match('.js-drawer-close')) {
        setDrawer(match('.js-drawer-close').getAttribute('data-drawer'), false);
    } else if (target.classList.contains('js-drawer-overlay')) {
        setDrawer(target.getAttribute('data-drawer'), false);
    } else if (target.classList.contains('js-popup-overlay')) {
        setPopup(target.getAttribute('data-popup'), false);
    } else if (match('.addr-tab')) {
        addressType = match('.addr-tab').getAttribute('data-type');
        all('.addr-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab === match('.addr-tab'));
        });
    } else if (match('#default-toggle')) {
        var on = byId('default-toggle').classList.toggle('on');
        byId('default-toggle').setAttribute('aria-checked', on ? 'true' : 'false');
    } else if (match('#pan-verify-btn')) {
        verifyPan();
    } else if (match('.js-pan-retry')) {
        setVisible('pan-error', false);
        setVisible('pan-mismatch', false);
        setVisible('pan-form-area', true);
        byId('pan-number').focus();
    } else if (match('#pan-accept-name')) {
        setVisible('pan-mismatch', false);
        showPanSuccess(byId('mismatch-actual').textContent, byId('pan-number').value.trim().toUpperCase());
        showToast(copy.panUpdated);
    } else if (match('#neu-max')) {
        byId('neu-input').value = Math.floor(Math.min(neu.balance, subtotal - couponDiscount));
        validateNeuInput();
    } else if (match('#neu-apply')) {
        applyNeu();
    } else if (match('#neu-remove')) {
        neu.redeemed = 0;
        setVisible('neu-applied', false);
        setVisible('neu-apply', true);
        setVisible('neu-message', false);
        byId('neu-input').value = '';
        renderBalance(neu.balance);
        renderSummary();
        showToast(copy.neuRemoved);
    } else if (match('.js-pay')) {
        all('.js-pay').forEach(function (option) {
            option.classList.remove('selected');
        });
        match('.js-pay').classList.add('selected');
        selectedPayment = match('.js-pay').getAttribute('data-method');
    } else if (match('.js-needs-address-btn')) {
        showToast(copy.needAddressFirst, 'error');
    } else if (match('.js-place-order')) {
        placeOrder();
    } else if (match('.js-popup-close')) {
        setPopup(match('.beyon-popup').id.replace('popup-', ''), false);
        if (match('.js-add-address-all')) {
            renderAllAddresses();
            setDrawer('all-addr', true);
        } else if (match('.js-remove-continue')) {
            showToast(copy.popupRemoved);
        }
    }
});

byId('addr-form').addEventListener('submit', function (event) {
    event.preventDefault();
    saveAddress();
});
byId('addr-pin').addEventListener('input', function (event) {
    var location = PIN_LOCATIONS[event.target.value.trim()];
    if (location) {
        byId('addr-state').value = location[0];
        byId('addr-city').value = location[1];
    }
});
byId('pan-name').addEventListener('input', function () {
    var field = byId('pan-name');
    var name = field.value.trim();
    var message = '';
    if (name && /[0-9]/.test(name)) {
        message = copy.panNameNumbers;
    } else if (name && /[^A-Za-z\s.]/.test(name)) {
        message = copy.panNameChars;
    } else if (name.length === 1) {
        message = copy.panNameShort;
    }
    byId('err-pan-name').textContent = message;
    byId('err-pan-name').classList.toggle('d-none', !message);
    field.classList.toggle('input-error', !!message);
    updateVerifyButton();
});
byId('pan-number').addEventListener('input', function () {
    var field = byId('pan-number');
    field.value = field.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var complete = field.value.length === 10;
    var invalid = complete && !PAN_REGEX.test(field.value);
    byId('err-pan-number').textContent = invalid ? copy.panFormat : '';
    byId('err-pan-number').classList.toggle('d-none', !invalid);
    field.classList.toggle('input-error', invalid);
    setVisible('pan-format-hint', !complete);
    updateVerifyButton();
});
byId('neu-input').addEventListener('input', validateNeuInput);
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        setDrawer('addr', false);
        setDrawer('all-addr', false);
        ['1', '2', '3', '4'].forEach(function (number) {
            setPopup(number, false);
        });
    }
});

try {
    couponDiscount = (JSON.parse(localStorage.getItem('beyon-cart')) || {}).discount || 0;
} catch (e) {
    couponDiscount = 0;
}

// Review aid for the design's states, which have no live trigger until the backend exists.
var previewState = new URLSearchParams(window.location.search).get('preview');
if (previewState === 'no-address') {
    addresses = [];
} else if (/^popup-[1-4]$/.test(previewState || '')) {
    setPopup(previewState.replace('popup-', ''), true);
}

renderBalance(neu.balance);
renderSelectedAddress();
renderSummary();
