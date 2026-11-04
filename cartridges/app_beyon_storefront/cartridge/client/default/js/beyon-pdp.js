'use strict';

var root = document.getElementById('beyon-pdp');
var images = JSON.parse(root.getAttribute('data-images'));
var galleryIndex = 0;
var lightboxIndex = 0;
var added = false;
var toastTimer = null;
var lastFocus = null;

// Sample serviceability from the design. Placeholder until the backend exists.
var PINCODE_DB = {
    110001: { ok: true, date: '27 Jun' },
    400001: { ok: true, date: '26 Jun' },
    560001: { ok: true, date: '28 Jun' },
    700001: { ok: true, date: '29 Jun' },
    600001: { ok: true, date: '25 Jun' },
    500001: { ok: false },
    999999: { ok: false }
};
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
 * Sets the text of every matching element.
 * @param {string} selector - css selector
 * @param {string} text - new text
 */
function setText(selector, text) {
    all(selector).forEach(function (element) {
        var node = element;
        node.textContent = text;
    });
}

/**
 * Shows the top toast.
 * @param {string} message - toast text
 */
function toast(message) {
    var element = document.getElementById('pdp-toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        element.classList.remove('show');
    }, 2200);
}

/**
 * Moves the phone and tablet carousel.
 * @param {number} index - image position
 */
function setGallery(index) {
    galleryIndex = (index + images.length) % images.length;
    all('.gallery-slide').forEach(function (slide, position) {
        slide.classList.toggle('active', position === galleryIndex);
    });
    all('.gallery-thumb, .gallery-dot').forEach(function (button) {
        button.classList.toggle('active', parseInt(button.getAttribute('data-gallery-index'), 10) === galleryIndex);
    });
}

/**
 * Draws the current lightbox image.
 */
function drawLightbox() {
    var image = document.getElementById('lightbox-image');
    var dots = document.getElementById('lightbox-dots');
    image.src = images[lightboxIndex].url;
    image.alt = images[lightboxIndex].alt;
    document.getElementById('lightbox-counter').textContent = (lightboxIndex + 1) + ' / ' + images.length;
    dots.innerHTML = '';
    images.forEach(function (item, position) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', item.alt);
        dot.className = position === lightboxIndex ? 'active' : '';
        dot.addEventListener('click', function () {
            lightboxIndex = position;
            drawLightbox();
        });
        dots.appendChild(dot);
    });
}

/**
 * Opens a dialog and remembers where focus was.
 * @param {Element} dialog - the dialog
 */
function openDialog(dialog) {
    lastFocus = document.activeElement;
    dialog.classList.remove('d-none');
    document.body.style.overflow = 'hidden';
    var first = dialog.querySelector('button, input, textarea, select');
    if (first) {
        first.focus();
    }
}

/**
 * Closes a dialog and restores focus.
 * @param {Element} dialog - the dialog
 */
function closeDialog(dialog) {
    dialog.classList.add('d-none');
    document.body.style.overflow = '';
    if (lastFocus) {
        lastFocus.focus();
    }
}

/**
 * Opens the lightbox on an image.
 * @param {number} index - image position
 */
function openLightbox(index) {
    lightboxIndex = index;
    drawLightbox();
    openDialog(document.getElementById('lightbox'));
}

/**
 * Steps through the lightbox.
 * @param {number} step - +1 or -1
 */
function stepLightbox(step) {
    lightboxIndex = (lightboxIndex + step + images.length) % images.length;
    drawLightbox();
}

/**
 * Bursts particles out of a wishlist heart.
 * @param {Element} button - heart button
 */
function spawnParticles(button) {
    var rect = button.getBoundingClientRect();
    var cx = rect.left + (rect.width / 2);
    var cy = rect.top + (rect.height / 2);
    for (var i = 0; i < 6; i++) {
        var dot = document.createElement('div');
        var angle = ((Math.PI * 2) / 6) * i;
        var dist = 18 + (Math.random() * 10);
        dot.className = 'pdp-particle' + (i % 2 ? ' is-red' : '');
        dot.style.left = cx + 'px';
        dot.style.top = cy + 'px';
        dot.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + (Math.cos(angle) * dist) + 'px,' + (Math.sin(angle) * dist) + 'px) scale(0)', opacity: 0 }
        ], { duration: 450, easing: 'ease-out' }).onfinish = dot.remove.bind(dot);
        document.body.appendChild(dot);
    }
}

/**
 * Toggles a heart. Client-side placeholder.
 * @param {Element} button - heart button
 */
function toggleWishlist(button) {
    var svg = button.querySelector('svg');
    var on = svg.getAttribute('fill') === 'none';
    svg.setAttribute('fill', on ? '#d30b39' : 'none');
    svg.setAttribute('stroke', on ? '#d30b39' : '#3c3c3c');
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.classList.remove('wishlist-pop');
    button.getBoundingClientRect();
    button.classList.add('wishlist-pop');
    button.addEventListener('animationend', function () {
        button.classList.remove('wishlist-pop');
    }, { once: true });
    if (on) {
        spawnParticles(button);
    }
}

/**
 * Shows a tab panel.
 * @param {Element} tab - clicked tab
 */
function selectTab(tab) {
    all('.pdp-tab').forEach(function (item) {
        var active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
        document.getElementById(item.getAttribute('data-tab')).classList.toggle('d-none', !active);
    });
}

/**
 * Selects a placeholder pill in its group.
 * @param {Element} pill - clicked pill
 */
function selectPlaceholderPill(pill) {
    var group = pill.getAttribute('data-pill-group');
    all('[data-pill-group="' + group + '"]').forEach(function (item) {
        var on = item === pill;
        if (item.classList.contains('metal-btn')) {
            item.classList.toggle('selected', on);
        } else {
            item.classList.toggle('pill-selected', on);
            item.classList.toggle('pill-default', !on);
        }
    });
}

/**
 * Writes the selected price into every price slot.
 * @param {Object} price - product price model
 */
function updatePrice(price) {
    var sales = price.type === 'range' ? price.min.sales : price.sales;
    var list = price.type === 'range' ? null : price.list;
    if (!sales || !sales.formatted) {
        return;
    }
    setText('.js-price', sales.formatted);
    setText('.js-mrp', list ? list.formatted : '');
    all('.js-mrp').forEach(function (element) {
        element.classList.toggle('d-none', !list);
    });
    var symbol = sales.formatted.replace(/[\d.,\s]/g, '');
    all('.js-save').forEach(function (element) {
        element.classList.toggle('d-none', !list);
    });
    if (list) {
        setText('.js-save-amount', symbol + (list.value - sales.value).toFixed(2));
    }
}

/**
 * Writes the selected variant's images into both galleries.
 * @param {Array} largeImages - large image models
 */
function updateImages(largeImages) {
    if (!largeImages || !largeImages.length) {
        return;
    }
    images = largeImages.map(function (image) {
        return { url: image.url, alt: image.alt };
    });
    var setSources = function (selector, indexAttribute) {
        all(selector).forEach(function (element, position) {
            var source = images[position];
            if (source && !indexAttribute) {
                element.setAttribute('src', source.url);
                element.setAttribute('alt', source.alt);
            }
            var holder = indexAttribute ? element : (element.closest('.gallery-thumb') || element);
            holder.classList.toggle('d-none', !source);
        });
    };
    setSources('.gallery-slide');
    setSources('.gallery-thumb img');
    setSources('.desktop-image');
    all('.desktop-cell').forEach(function (cell, position) {
        cell.classList.toggle('d-none', !images[position]);
    });
    setSources('.gallery-dot', true);
    setGallery(0);
}

/**
 * Selects the first available value of any attribute still unset.
 * @param {Object} product - product model
 * @param {Function} choose - variation request
 * @returns {boolean} whether a request was started
 */
function selectFirstUnset(product, choose) {
    var started = false;
    (product.variationAttributes || []).forEach(function (attribute) {
        if (started) {
            return;
        }
        var hasSelection = attribute.values.some(function (value) {
            return value.selected;
        });
        var firstValue = attribute.values.filter(function (value) {
            return value.selectable && value.url;
        })[0];
        if (!hasSelection && firstValue) {
            started = true;
            choose(firstValue.url);
        }
    });
    return started;
}

/**
 * Applies the base Product-Variation response.
 * @param {Object} product - product model
 * @param {Function} choose - variation request
 */
function applyVariation(product, choose) {
    root.setAttribute('data-pid', product.id);
    root.setAttribute('data-ready', product.readyToOrder ? 'true' : 'false');
    (product.variationAttributes || []).forEach(function (attribute) {
        attribute.values.forEach(function (value) {
            var button = root.querySelector('.js-variation[data-attr="' + attribute.id + '"][data-value="' + value.id + '"]');
            if (!button) {
                return;
            }
            button.setAttribute('data-url', value.url || '');
            button.disabled = !value.selectable;
            if (button.classList.contains('metal-btn')) {
                button.classList.toggle('selected', !!value.selected);
            } else {
                button.classList.toggle('pill-selected', !!value.selected);
                button.classList.toggle('pill-default', !value.selected);
            }
        });
    });
    updatePrice(product.price);
    updateImages(product.images && product.images.large);
    selectFirstUnset(product, choose);
}

/**
 * Requests a variation from the base route.
 * @param {string} url - Product-Variation url
 */
function chooseVariation(url) {
    if (!url) {
        return;
    }
    fetch(url, { credentials: 'same-origin' })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.json();
        })
        .then(function (data) {
            applyVariation(data.product, chooseVariation);
        })
        .catch(function () {
            toast(root.getAttribute('data-msg-failed'));
        });
}

/**
 * Adds the selected product through the base Cart-AddProduct route, or opens the bag once added.
 */
function addToBag() {
    if (added) {
        window.location.href = root.getAttribute('data-cart-url');
        return;
    }
    if (root.getAttribute('data-ready') !== 'true') {
        toast(root.getAttribute('data-msg-select'));
        return;
    }
    fetch(root.getAttribute('data-add-url'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'pid=' + encodeURIComponent(root.getAttribute('data-pid')) + '&quantity=1'
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.json();
        })
        .then(function (data) {
            if (data.error) {
                toast(data.message || root.getAttribute('data-msg-failed'));
                return;
            }
            added = true;
            setText('.minicart-quantity', data.quantityTotal);
            all('.js-add-to-bag').forEach(function (button) {
                button.classList.add('is-added');
            });
            setText('.js-add-label', root.getAttribute('data-msg-gotobag'));
            toast(root.getAttribute('data-msg-added'));
        })
        .catch(function () {
            toast(root.getAttribute('data-msg-failed'));
        });
}

/**
 * Sample pincode check copied from the design. Placeholder until the backend exists.
 */
function checkPincode() {
    var input = document.getElementById('pincode-input');
    if (input.value.length !== 6) {
        return;
    }
    var entry = PINCODE_DB[input.value];
    var ok;
    var date;
    if (entry) {
        ok = entry.ok;
        date = entry.date || '';
    } else {
        var future = new Date();
        future.setDate(future.getDate() + Math.floor(Math.random() * 8) + 3);
        ok = Math.random() > 0.25;
        date = future.getDate() + ' ' + MONTHS[future.getMonth()];
    }
    var country = root.querySelector('.country-option.selected');
    document.getElementById('pincode-ok-country').textContent = country.getAttribute('data-flag') + ' ' + country.getAttribute('data-name');
    document.getElementById('pincode-ok-date').textContent = date;
    document.getElementById('pincode-bad-value').textContent = input.value;
    document.getElementById('pincode-ok').classList.toggle('d-none', !ok);
    document.getElementById('pincode-bad').classList.toggle('d-none', ok);
    document.getElementById('delivery-estimate').classList.add('d-none');
}

/**
 * Resets the delivery result to the estimate.
 */
function resetPincode() {
    if (document.getElementById('pincode-ok')) {
        document.getElementById('pincode-ok').classList.add('d-none');
        document.getElementById('pincode-bad').classList.add('d-none');
        document.getElementById('delivery-estimate').classList.remove('d-none');
    }
}

/**
 * Copies or shares the page link.
 */
function share() {
    var button = document.getElementById('share-btn');
    if (navigator.share && window.innerWidth < 1024) {
        navigator.share({ title: document.title, url: window.location.href }).catch(function () {
            return null;
        });
        return;
    }
    navigator.clipboard.writeText(window.location.href).then(function () {
        toast(root.getAttribute('data-msg-copied'));
        button.classList.add('shared');
        setTimeout(function () {
            button.classList.remove('shared');
        }, 1800);
    });
}

/**
 * Validates the request form in the browser and shows the design's confirmation. No server call yet.
 * @param {Element} form - the submitted form
 */
function submitRequest(form) {
    var valid = true;
    all('[data-required]', form).forEach(function (input) {
        var rule = input.getAttribute('data-required');
        var value = input.value.trim();
        var fieldValid = !!value;
        if (rule === 'email') {
            fieldValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        } else if (rule === 'phone') {
            fieldValid = /^\d{7,10}$/.test(value);
        }
        var error = input.closest('.cr-fields > div').querySelector('.cr-error');
        input.classList.toggle('error', !fieldValid);
        error.classList.toggle('show', !fieldValid);
        valid = valid && fieldValid;
    });
    if (valid) {
        var dialog = form.closest('.cr-overlay');
        closeDialog(dialog);
        form.reset();
        toast(dialog.getAttribute('data-toast'));
    }
}

/**
 * Enables touch swipe on an element.
 * @param {Element} element - swipe area
 * @param {Function} onSwipe - receives +1 or -1
 */
function addSwipe(element, onSwipe) {
    var startX = 0;
    var startY = 0;
    element.addEventListener('touchstart', function (event) {
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
    }, { passive: true });
    element.addEventListener('touchend', function (event) {
        var dx = event.changedTouches[0].clientX - startX;
        var dy = event.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            onSwipe(dx > 0 ? -1 : 1);
        }
    });
}

root.addEventListener('click', function (event) {
    var target = event.target;
    var match = function (selector) {
        return target.closest(selector);
    };
    var overlay = target.classList.contains('cr-overlay') || target.classList.contains('size-overlay') ? target : null;

    if (overlay) {
        closeDialog(overlay);
    } else if (match('.js-modal-close')) {
        closeDialog(match('.js-modal-close').closest('.cr-overlay, .size-overlay'));
    } else if (match('.js-wishlist')) {
        toggleWishlist(match('.js-wishlist'));
    } else if (match('.js-stack')) {
        document.getElementById('stack-it').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (match('.js-faq-scroll')) {
        document.getElementById('lgd-faq').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (match('.gallery-prev')) {
        setGallery(galleryIndex - 1);
    } else if (match('.gallery-next')) {
        setGallery(galleryIndex + 1);
    } else if (match('[data-gallery-index]')) {
        setGallery(parseInt(match('[data-gallery-index]').getAttribute('data-gallery-index'), 10));
    } else if (match('.gallery-slide')) {
        openLightbox(galleryIndex);
    } else if (match('.desktop-cell')) {
        openLightbox(parseInt(match('.desktop-cell').getAttribute('data-lightbox-index'), 10));
    } else if (match('.pdp-tab')) {
        selectTab(match('.pdp-tab'));
    } else if (match('#share-btn')) {
        share();
    } else if (match('.js-variation')) {
        chooseVariation(match('.js-variation').getAttribute('data-url'));
    } else if (match('[data-pill-group]')) {
        selectPlaceholderPill(match('[data-pill-group]'));
    } else if (match('.js-add-to-bag')) {
        addToBag();
    } else if (match('.js-request-open')) {
        openDialog(document.getElementById('request-popup'));
    } else if (match('#customisation-open')) {
        openDialog(document.getElementById('customisation-popup'));
    } else if (match('#size-chart-open')) {
        openDialog(document.getElementById('size-chart'));
    } else if (match('.faq-toggle')) {
        var toggle = match('.faq-toggle');
        var open = toggle.parentElement.querySelector('.faq-body').classList.toggle('d-none');
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    } else if (match('#app-banner-close')) {
        document.getElementById('app-banner').classList.add('d-none');
    } else if (match('#pincode-check')) {
        checkPincode();
    } else if (match('.country-option')) {
        var option = match('.country-option');
        all('.country-option').forEach(function (item) {
            item.classList.toggle('selected', item === option);
        });
        document.getElementById('country-flag').textContent = option.getAttribute('data-flag');
        document.getElementById('country-code').textContent = option.getAttribute('data-code');
        document.getElementById('country-list').classList.add('d-none');
        document.getElementById('country-trigger').setAttribute('aria-expanded', 'false');
        resetPincode();
    } else if (match('#country-trigger')) {
        var list = document.getElementById('country-list');
        var hidden = list.classList.toggle('d-none');
        match('#country-trigger').setAttribute('aria-expanded', hidden ? 'false' : 'true');
    }

    if (document.getElementById('country-list') && !match('#country-trigger') && !match('.country-option')) {
        document.getElementById('country-list').classList.add('d-none');
    }
});

root.addEventListener('submit', function (event) {
    if (event.target.classList.contains('js-request-form')) {
        event.preventDefault();
        submitRequest(event.target);
    }
});

if (document.getElementById('pincode-input')) {
    document.getElementById('pincode-input').addEventListener('input', function (event) {
        var input = event.target;
        input.value = input.value.replace(/\D/g, '');
        document.getElementById('pincode-check').classList.toggle('is-ready', input.value.length === 6);
        resetPincode();
    });
}

document.getElementById('lightbox').addEventListener('click', function (event) {
    if (event.target.id === 'lightbox' || event.target.closest('#lightbox-close')) {
        closeDialog(document.getElementById('lightbox'));
    } else if (event.target.closest('#lightbox-prev')) {
        stepLightbox(-1);
    } else if (event.target.closest('#lightbox-next')) {
        stepLightbox(1);
    }
});

document.addEventListener('keydown', function (event) {
    var lightbox = document.getElementById('lightbox');
    if (event.key === 'Escape') {
        all('.cr-overlay, .size-overlay, .lightbox').forEach(function (dialog) {
            if (!dialog.classList.contains('d-none')) {
                closeDialog(dialog);
            }
        });
    } else if (!lightbox.classList.contains('d-none')) {
        if (event.key === 'ArrowLeft') {
            stepLightbox(-1);
        } else if (event.key === 'ArrowRight') {
            stepLightbox(1);
        }
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target.classList && event.target.classList.contains('desktop-cell')) {
        event.preventDefault();
        openLightbox(parseInt(event.target.getAttribute('data-lightbox-index'), 10));
    }
});

addSwipe(document.getElementById('gallery-swipe'), function (step) {
    setGallery(galleryIndex + step);
});
addSwipe(document.getElementById('lightbox-frame'), stepLightbox);

all('.js-variation').some(function () {
    var product = {
        variationAttributes: ['color', 'size'].map(function (id) {
            var buttons = all('.js-variation[data-attr="' + id + '"]');
            return {
                id: id,
                values: buttons.map(function (button) {
                    return {
                        selected: button.classList.contains('pill-selected') || button.classList.contains('selected'),
                        selectable: !button.disabled,
                        url: button.getAttribute('data-url')
                    };
                })
            };
        }).filter(function (attribute) {
            return attribute.values.length;
        })
    };
    selectFirstUnset(product, chooseVariation);
    return true;
});
