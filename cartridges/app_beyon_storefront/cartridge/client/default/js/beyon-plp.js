'use strict';

var WISHLIST_KEY = 'beyon-wishlist';
var HEART_PATH = 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z';

var grid = document.getElementById('product-grid');
var drawer = document.getElementById('filter-drawer');
var overlay = document.getElementById('filter-overlay');
var openButton = document.getElementById('filter-open');
var activeFilters = document.getElementById('active-filters');
var toastTimer = null;

/**
 * Reads the wishlist kept for this browser session. Placeholder until the backend exists.
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
 * @param {Element} button - the wishlist button
 * @param {boolean} on - wishlisted
 */
function paintHeart(button, on) {
    var svg = button.querySelector('svg');
    svg.setAttribute('fill', on ? '#BF0E23' : 'none');
    svg.setAttribute('stroke', on ? '#BF0E23' : '#555');
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/**
 * Shows the wishlist toast.
 * @param {string} message - toast text
 */
function showToast(message) {
    var old = document.querySelector('.wishlist-toast');
    if (old) {
        old.remove();
    }
    clearTimeout(toastTimer);
    var toast = document.createElement('div');
    var svgNs = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNs, 'svg');
    var path = document.createElementNS(svgNs, 'path');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', '#fff');
    path.setAttribute('d', HEART_PATH);
    svg.appendChild(path);
    toast.className = 'wishlist-toast';
    toast.setAttribute('role', 'status');
    toast.appendChild(svg);
    toast.appendChild(document.createTextNode(message));
    document.body.appendChild(toast);
    toastTimer = setTimeout(function () {
        toast.classList.add('hide');
        setTimeout(function () {
            toast.remove();
        }, 300);
    }, 1500);
}

/**
 * Bursts six particles out of the heart.
 * @param {Element} button - the wishlist button
 */
function spawnParticles(button) {
    var rect = button.getBoundingClientRect();
    var cx = rect.left + (rect.width / 2);
    var cy = rect.top + (rect.height / 2);
    for (var i = 0; i < 6; i++) {
        var dot = document.createElement('div');
        var angle = ((Math.PI * 2) / 6) * i;
        var dist = 18 + (Math.random() * 10);
        dot.className = 'wishlist-particle' + (i % 2 ? ' is-red' : '');
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
 * Updates the "Showing X of Y" line after the grid changes.
 */
function updateShowing() {
    var line = document.getElementById('showing-text');
    if (line && grid) {
        line.textContent = grid.getAttribute('data-showing-template')
            .replace('{0}', grid.querySelectorAll('.product-card').length)
            .replace('{1}', grid.getAttribute('data-total'));
    }
}

/**
 * Staggers card entrance and restores wishlist hearts for newly loaded cards.
 */
function decorateCards() {
    var wishlist = readWishlist();
    var cols = 4;
    grid.querySelectorAll('.product-card').forEach(function (card, index) {
        card.style.setProperty('animation-delay', (((index % cols) * 50) + 60) + 'ms');
        var button = card.querySelector('.wishlist-btn');
        paintHeart(button, wishlist.indexOf(button.getAttribute('data-pid')) > -1);
    });
    grid.querySelectorAll('.promo-banner').forEach(function (banner) {
        banner.style.setProperty('animation-delay', (parseInt(banner.getAttribute('data-banner-index'), 10) * 25) + 'ms');
    });
    updateShowing();
}

/**
 * Appends the next page of cards from the base Search-UpdateGrid route.
 * @param {Element} button - the Load More button
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
 * Toggles the wishlist heart. Client-side placeholder.
 * @param {Element} button - the wishlist button
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
    button.classList.remove('pop');
    button.getBoundingClientRect();
    button.classList.add('pop');
    button.addEventListener('animationend', function () {
        button.classList.remove('pop');
    }, { once: true });
    if (on) {
        spawnParticles(button);
        showToast(grid.getAttribute('data-wishlisted-label'));
    }
}

/**
 * Reorders loaded cards. Only price and arrival order have data; the other options keep best-match order.
 * @param {string} mode - sort select value
 */
function sortCards(mode) {
    var footer = grid.querySelector('.grid-footer');
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.product-card'));
    var banners = {};
    grid.querySelectorAll('.promo-banner').forEach(function (banner) {
        banners[banner.getAttribute('data-banner-index')] = banner;
    });
    var byIndex = function (a, b) {
        return a.getAttribute('data-index') - b.getAttribute('data-index');
    };
    var byPrice = function (a, b) {
        return a.getAttribute('data-price') - b.getAttribute('data-price');
    };
    if (mode === 'price-low') {
        cards.sort(byPrice);
    } else if (mode === 'price-high' || mode === 'discount') {
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
    cards.forEach(function (card, position) {
        if (banners[position]) {
            grid.insertBefore(banners[position], footer);
        }
        grid.insertBefore(card, footer);
    });
}

/**
 * Sets the desktop column count.
 * @param {number} cols - 3, 4 or 5
 */
function setColumns(cols) {
    grid.classList.toggle('grid-cols-3', cols === 3);
    grid.classList.toggle('grid-cols-5', cols === 5);
    grid.classList.toggle('catalog-mode', cols === 5);
    document.querySelectorAll('.grid-pick').forEach(function (pick) {
        var on = parseInt(pick.getAttribute('data-cols'), 10) === cols;
        pick.classList.toggle('active', on);
        pick.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

/**
 * Opens or closes the filter drawer.
 * @param {boolean} open - desired state
 */
function setDrawer(open) {
    overlay.classList.toggle('active', open);
    drawer.classList.toggle('open', open);
    if (open) {
        document.getElementById('filter-close').focus();
    } else {
        openButton.focus();
    }
}

/**
 * Selects or clears one filter chip.
 * @param {Element} chip - the chip
 * @param {boolean} on - selected
 */
function setChip(chip, on) {
    chip.classList.toggle('selected', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/**
 * Lists applied chips under the toolbar. Placeholder: the grid isn't filtered until the backend exists.
 */
function renderActiveFilters() {
    var selected = drawer.querySelectorAll('.filter-chip.selected');
    activeFilters.innerHTML = '';
    activeFilters.classList.toggle('d-none', selected.length === 0);
    activeFilters.classList.toggle('d-flex', selected.length > 0);
    selected.forEach(function (chip) {
        var applied = document.createElement('button');
        applied.type = 'button';
        applied.className = 'filter-chip selected';
        applied.textContent = chip.textContent + ' ×';
        applied.addEventListener('click', function () {
            setChip(chip, false);
            renderActiveFilters();
        });
        activeFilters.appendChild(applied);
    });
    if (selected.length) {
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'clear-filters';
        clear.textContent = activeFilters.getAttribute('data-clear-label');
        clear.addEventListener('click', function () {
            drawer.querySelectorAll('.filter-chip.selected').forEach(function (chip) {
                setChip(chip, false);
            });
            renderActiveFilters();
        });
        activeFilters.appendChild(clear);
    }
}

document.getElementById('promo-ribbon-close').addEventListener('click', function () {
    document.getElementById('promo-ribbon').classList.add('hidden-ribbon');
});

openButton.addEventListener('click', function () {
    setDrawer(true);
});
overlay.addEventListener('click', function () {
    setDrawer(false);
});
document.getElementById('filter-close').addEventListener('click', function () {
    setDrawer(false);
});
document.getElementById('filter-apply').addEventListener('click', function () {
    renderActiveFilters();
    setDrawer(false);
});
document.getElementById('filter-clear').addEventListener('click', function () {
    drawer.querySelectorAll('.filter-chip.selected').forEach(function (chip) {
        setChip(chip, false);
    });
    renderActiveFilters();
});
drawer.addEventListener('click', function (event) {
    if (event.target.classList.contains('filter-chip')) {
        setChip(event.target, !event.target.classList.contains('selected'));
    }
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && drawer.classList.contains('open')) {
        setDrawer(false);
    }
});

if (grid) {
    grid.addEventListener('click', function (event) {
        var button = event.target.closest('.wishlist-btn');
        if (button) {
            toggleWishlist(button);
            return;
        }
        var more = event.target.closest('.show-more .more');
        if (more) {
            loadMore(more);
        }
    });
    document.getElementById('sort-select').addEventListener('change', function (event) {
        sortCards(event.target.value);
    });
    document.getElementById('grid-toggle').addEventListener('click', function (event) {
        var pick = event.target.closest('.grid-pick');
        if (pick) {
            setColumns(parseInt(pick.getAttribute('data-cols'), 10));
        }
    });
    decorateCards();
}
