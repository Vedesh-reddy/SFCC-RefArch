'use strict';

// Filters, wishlist hearts, Select Size and Request Design are placeholders until the backend exists.
var WISHLIST_KEY = 'beyon-wishlist';
var root = document.getElementById('beyon-plp');
var grid = document.getElementById('product-grid');
var loader = document.getElementById('plp-loader');
var emptyState = document.getElementById('plp-empty');
var activeFilters = document.getElementById('active-filters');
var sortSelect = document.getElementById('sort-select');
var toastTimer = null;
var currentSizeCard = null;
var lastFocus = null;

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
 * Finds an element by id.
 * @param {string} id - element id
 * @returns {Element} element
 */
function byId(id) {
    return document.getElementById(id);
}

/**
 * Shows the toast.
 * @param {string} message - toast text
 */
function showToast(message) {
    var toast = byId('plp-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toast.classList.remove('show');
    }, 1800);
}

/**
 * Reads the wishlist kept for this browser session.
 * @returns {Array} product ids
 */
function readWishlist() {
    try {
        return JSON.parse(sessionStorage.getItem(WISHLIST_KEY)) || [];
    } catch (e) {
        return [];
    }
}

/**
 * Persists the session wishlist.
 * @param {Array} ids - product ids
 */
function writeWishlist(ids) {
    try {
        sessionStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
    } catch (e) {
        // Blocked storage only loses the placeholder state.
    }
}

/**
 * Draws a heart in its wishlisted or plain state.
 * @param {Element} button - wishlist button
 * @param {boolean} on - wishlisted
 */
function paintHeart(button, on) {
    var svg = button.querySelector('svg');
    svg.setAttribute('fill', on ? '#BF0E23' : 'none');
    svg.setAttribute('stroke', on ? '#BF0E23' : '#555');
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/**
 * Updates the "Showing X of Y" line and restores hearts for loaded cards.
 */
function decorateCards() {
    if (!grid) {
        return;
    }
    var wishlist = readWishlist();
    var line = byId('showing-text');
    if (line) {
        line.textContent = root.getAttribute('data-showing-template')
            .replace('{0}', all('.product-card', grid).length)
            .replace('{1}', root.getAttribute('data-total'));
    }
    all('.wishlist-btn', grid).forEach(function (button) {
        paintHeart(button, wishlist.indexOf(button.getAttribute('data-pid')) > -1);
    });
}

/**
 * Toggles a wishlist heart.
 * @param {Element} button - wishlist button
 */
function toggleWishlist(button) {
    var pid = button.getAttribute('data-pid');
    var wishlist = readWishlist();
    var position = wishlist.indexOf(pid);
    var on = position === -1;
    if (on) {
        wishlist.push(pid);
    } else {
        wishlist.splice(position, 1);
    }
    writeWishlist(wishlist);
    paintHeart(button, on);
    button.classList.remove('wishlist-pop');
    button.getBoundingClientRect();
    button.classList.add('wishlist-pop');
    button.addEventListener('animationend', function () {
        button.classList.remove('wishlist-pop');
    }, { once: true });
    if (on) {
        showToast(root.getAttribute('data-msg-wishlisted'));
    }
}

/**
 * Hides the grid behind the diamond loader while work runs.
 * @param {Function} work - grid update
 */
function withLoader(work) {
    if (!grid) {
        work();
        return;
    }
    grid.classList.add('d-none');
    grid.classList.remove('d-flex');
    loader.classList.add('show');
    setTimeout(function () {
        work();
        loader.classList.remove('show');
        grid.classList.remove('d-none');
        grid.classList.add('d-flex');
    }, 500);
}

/**
 * Reorders loaded cards. Price and arrival order have data; the other options keep best-match order.
 * @param {string} mode - sort value
 */
function sortCards(mode) {
    var footer = grid.querySelector('.grid-footer');
    var cards = all('.product-card', grid);
    var byIndex = function (a, b) {
        return a.getAttribute('data-index') - b.getAttribute('data-index');
    };
    var byPrice = function (a, b) {
        return a.getAttribute('data-price') - b.getAttribute('data-price');
    };
    if (mode === 'price-low') {
        cards.sort(byPrice);
    } else if (mode === 'price-high') {
        cards.sort(function (a, b) {
            return byPrice(b, a);
        });
    } else if (mode === 'new-arrivals') {
        cards.sort(function (a, b) {
            return byIndex(b, a);
        });
    } else {
        cards.sort(byIndex);
    }
    cards.forEach(function (card) {
        grid.insertBefore(card, footer);
    });
}

/**
 * Applies a sort value everywhere it's shown.
 * @param {string} mode - sort value
 */
function applySort(mode) {
    sortSelect.value = mode;
    all('.sort-option').forEach(function (option) {
        var on = option.getAttribute('data-sort') === mode;
        option.classList.toggle('active', on);
        if (on) {
            byId('sort-label-mobile').textContent = option.textContent;
        }
    });
    if (grid) {
        withLoader(function () {
            sortCards(mode);
        });
    }
}

/**
 * Opens or closes a sheet.
 * @param {string} name - filter or sort
 * @param {boolean} open - desired state
 */
function setSheet(name, open) {
    byId(name + '-overlay').classList.toggle('active', open);
    byId(name + '-sheet').classList.toggle('open', open);
}

/**
 * Lists selected filters under the title. Placeholder: the grid isn't filtered until the backend exists.
 */
function renderActiveFilters() {
    var seen = {};
    var selected = all('.filter-chip.selected, input[data-filter]:checked').filter(function (item) {
        var key = item.getAttribute('data-filter') + ':' + item.getAttribute('data-val');
        var fresh = !seen[key] && !activeFilters.contains(item);
        seen[key] = true;
        return fresh;
    });
    activeFilters.innerHTML = '';
    activeFilters.classList.toggle('d-none', selected.length === 0);
    activeFilters.classList.toggle('d-flex', selected.length > 0);
    selected.forEach(function (item) {
        var chip = document.createElement('span');
        chip.className = 'filter-chip selected';
        chip.textContent = item.getAttribute('data-val').replace(/-/g, ' ');
        activeFilters.appendChild(chip);
    });
    if (selected.length) {
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'clear-filters js-clear-filters p-0';
        clear.textContent = activeFilters.getAttribute('data-clear-label');
        activeFilters.appendChild(clear);
    }
}

/**
 * Keeps both copies of a filter in step and shows the loader.
 * @param {Element} control - changed checkbox or chip
 * @param {boolean} on - selected
 */
function syncFilter(control, on) {
    var selector = '[data-filter="' + control.getAttribute('data-filter') + '"][data-val="' + control.getAttribute('data-val') + '"]';
    all(selector).forEach(function (item) {
        var target = item;
        if (item.tagName === 'INPUT') {
            target.checked = on;
        } else {
            item.classList.toggle('selected', on);
            item.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    });
    renderActiveFilters();
    withLoader(function () {});
}

/**
 * Clears filters and restores the full grid.
 */
function clearFilters() {
    all('.filter-chip.selected').forEach(function (chip) {
        chip.classList.remove('selected');
        chip.setAttribute('aria-pressed', 'false');
    });
    all('input[data-filter]').forEach(function (input) {
        var box = input;
        box.checked = false;
    });
    renderActiveFilters();
    if (grid) {
        emptyState.classList.add('d-none');
        emptyState.classList.remove('d-flex');
        withLoader(function () {});
    }
}

/**
 * Appends the next page from the base Search-UpdateGrid route.
 * @param {Element} button - Load More button
 */
function loadMore(button) {
    button.setAttribute('disabled', 'disabled');
    fetch(button.getAttribute('data-url'), { credentials: 'same-origin' })
        .then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.text();
        })
        .then(function (html) {
            grid.querySelector('.grid-footer').insertAdjacentHTML('afterend', html);
            grid.querySelector('.grid-footer').remove();
            decorateCards();
        })
        .catch(function () {
            button.removeAttribute('disabled');
        });
}

/**
 * Opens the Select Size popup for a card.
 * @param {Element} card - product card
 */
function openSizePopup(card) {
    currentSizeCard = card;
    lastFocus = document.activeElement;
    byId('size-total-price').textContent = card.getAttribute('data-price-text');
    all('.size-pill').forEach(function (pill, index) {
        pill.classList.toggle('selected', index === 0);
    });
    byId('size-overlay').classList.add('active');
    byId('size-modal').classList.add('open');
    byId('size-close').focus();
}

/**
 * Closes the Select Size popup.
 */
function closeSizePopup() {
    byId('size-overlay').classList.remove('active');
    byId('size-modal').classList.remove('open');
    currentSizeCard = null;
    if (lastFocus) {
        lastFocus.focus();
    }
}

/**
 * Opens or closes the Request Design popup.
 * @param {boolean} open - desired state
 */
function setRequestPopup(open) {
    byId('request-popup').classList.toggle('d-none', !open);
    document.body.style.setProperty('overflow', open ? 'hidden' : '');
}

/**
 * Validates the request form in the browser and shows the design's confirmation. Nothing is sent yet.
 * @param {Element} form - submitted form
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
        input.classList.toggle('error', !fieldValid);
        input.closest('.rd-fields > div').querySelector('.rd-error').classList.toggle('show', !fieldValid);
        valid = valid && fieldValid;
    });
    if (valid) {
        setRequestPopup(false);
        form.reset();
        showToast(root.getAttribute('data-msg-request'));
    }
}

/**
 * Runs the rotating banner.
 */
function initBanner() {
    var banner = byId('plp-banner');
    var slides = banner.getAttribute('data-slides').split('||').map(function (slide) {
        return slide.split('|');
    });
    var dots = byId('plp-banner-dots');
    var index = 0;
    var draw = function () {
        byId('plp-banner-title').textContent = slides[index][0];
        byId('plp-banner-sub').textContent = slides[index][1];
        dots.innerHTML = '';
        slides.forEach(function (slide, position) {
            var dot = document.createElement('span');
            dot.className = 'banner-dot' + (position === index ? ' on' : '');
            dots.appendChild(dot);
        });
    };
    draw();
    setInterval(function () {
        index = (index + 1) % slides.length;
        draw();
    }, 2000);
}

document.addEventListener('click', function (event) {
    var target = event.target;
    var match = function (selector) {
        return target.closest(selector);
    };
    if (match('.wishlist-btn')) {
        toggleWishlist(match('.wishlist-btn'));
    } else if (match('.show-more .more')) {
        loadMore(match('.show-more .more'));
    } else if (match('.js-open-size')) {
        openSizePopup(match('.product-card'));
    } else if (match('.size-pill')) {
        all('.size-pill').forEach(function (pill) {
            pill.classList.toggle('selected', pill === match('.size-pill'));
        });
    } else if (match('#size-confirm') && currentSizeCard) {
        closeSizePopup();
        showToast(root.getAttribute('data-msg-added'));
    } else if (match('#size-close') || target.id === 'size-overlay') {
        closeSizePopup();
    } else if (match('.js-open-request')) {
        setRequestPopup(true);
    } else if (match('.js-request-close') || target.id === 'request-popup') {
        setRequestPopup(false);
    } else if (match('.js-open-filters')) {
        setSheet('filter', true);
    } else if (match('.js-close-filters') || target.id === 'filter-overlay') {
        setSheet('filter', false);
    } else if (match('.js-open-sort')) {
        setSheet('sort', true);
    } else if (target.id === 'sort-overlay') {
        setSheet('sort', false);
    } else if (match('.sort-option')) {
        applySort(match('.sort-option').getAttribute('data-sort'));
        setSheet('sort', false);
    } else if (match('.js-clear-filters')) {
        clearFilters();
    } else if (match('.facet .filter-chip')) {
        var chip = match('.facet .filter-chip');
        syncFilter(chip, !chip.classList.contains('selected'));
    }
});

document.addEventListener('change', function (event) {
    if (event.target.matches('input[data-filter]')) {
        syncFilter(event.target, event.target.checked);
    }
});
sortSelect.addEventListener('change', function () {
    applySort(sortSelect.value);
});
byId('request-form').addEventListener('submit', function (event) {
    event.preventDefault();
    submitRequest(event.target);
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        setSheet('filter', false);
        setSheet('sort', false);
        setRequestPopup(false);
        if (currentSizeCard) {
            closeSizePopup();
        }
    }
});

initBanner();
decorateCards();

// Review aid for the design's states, which have no live trigger until the backend exists.
var previewState = new URLSearchParams(window.location.search).get('preview');
if (previewState === 'no-results' && grid) {
    grid.classList.add('d-none');
    grid.classList.remove('d-flex');
    emptyState.classList.remove('d-none');
    emptyState.classList.add('d-flex');
} else if (previewState === 'wishlisted' && grid) {
    writeWishlist(all('.wishlist-btn', grid).map(function (button) {
        return button.getAttribute('data-pid');
    }));
    decorateCards();
}
