'use strict';

var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Wires up one carousel. The track is a native scroll-snap scroller, so swiping and keyboard
 * scrolling work without this script; it only adds the arrows and autoplay.
 * @param {HTMLElement} root - Element with data-store-carousel
 */
function initCarousel(root) {
    var track = root.querySelector('[data-carousel-track]');
    var prev = root.querySelector('[data-carousel-prev]');
    var next = root.querySelector('[data-carousel-next]');
    var toggle = root.querySelector('[data-carousel-toggle]');
    var delay = Number(root.getAttribute('data-autoplay'));
    var behavior = reducedMotion ? 'auto' : 'smooth';
    var paused = reducedMotion;
    var interrupted = false;
    var visible = true;

    /**
     * Moves by one screen of items, wrapping when autoplay reaches the end
     * @param {number} direction - 1 for forward, -1 for back
     */
    function move(direction) {
        var maxScroll = track.scrollWidth - track.clientWidth;
        var target = track.scrollLeft + (direction * track.clientWidth);
        if (direction > 0 && track.scrollLeft >= maxScroll - 2) {
            target = 0;
        }
        track.scrollTo({ left: target, behavior: behavior });
    }

    /**
     * Disables arrows at the ends of a product row; the hero wraps, so its arrows stay on
     */
    function updateArrows() {
        if (delay || !prev || !next) {
            return;
        }
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    }

    if (prev) {
        prev.addEventListener('click', function () { move(-1); });
    }
    if (next) {
        next.addEventListener('click', function () { move(1); });
    }
    track.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();

    if (!delay) {
        return;
    }

    /**
     * Keeps the pause button's icon and spoken label in step with the state
     */
    function updateToggle() {
        if (!toggle) {
            return;
        }
        toggle.setAttribute('aria-label', toggle.getAttribute(paused ? 'data-label-play' : 'data-label-pause'));
        toggle.querySelector('use').setAttribute('href', paused ? '#icon-play' : '#icon-pause');
    }

    if (toggle) {
        toggle.addEventListener('click', function () {
            paused = !paused;
            updateToggle();
        });
        updateToggle();
    }
    root.addEventListener('mouseenter', function () { interrupted = true; });
    root.addEventListener('mouseleave', function () { interrupted = false; });
    root.addEventListener('focusin', function () { interrupted = true; });
    root.addEventListener('focusout', function () { interrupted = false; });
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
        }).observe(root);
    }
    setInterval(function () {
        if (!paused && !interrupted && visible && !document.hidden) {
            move(1);
        }
    }, delay);
}

/**
 * Fades sections in as they scroll into view. Hiding only starts once this has run,
 * so the page is complete if the script never loads.
 */
function initReveal() {
    var sections = document.querySelectorAll('[data-reveal]');
    if (reducedMotion || !sections.length || !('IntersectionObserver' in window)) {
        return;
    }
    document.documentElement.classList.add('store-motion');
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px -8% 0px' });
    sections.forEach(function (section) {
        observer.observe(section);
    });
}

/**
 * Adds thumbnails, hover zoom and a full view to the product gallery. It reads images from the
 * carousel, because base rebuilds that markup whenever a colour is picked.
 * @param {HTMLElement} root - Element with data-store-gallery
 */
function initGallery(root) {
    var ZOOM = 2;
    var stage = root.querySelector('[data-gallery-stage]');
    var carousel = stage.querySelector('.carousel');
    var thumbs = root.querySelector('[data-gallery-thumbs]');
    var detail = root.closest('.product-detail');
    var buyColumn = detail.querySelector('.product-buy-column');
    var canZoom = window.matchMedia('(min-width: 992px) and (hover: hover) and (pointer: fine)');
    var lens = document.createElement('div');
    var pane = document.createElement('div');
    var dialog = document.createElement('dialog');
    var dialogImage = document.createElement('img');
    var dialogClose = document.createElement('button');
    var thumbSources = '';

    /**
     * @returns {HTMLImageElement} The slide on show
     */
    function activeImage() {
        return carousel.querySelector('.carousel-item.active img');
    }

    /**
     * Rebuilds the thumbnails when the images change and marks the slide on show
     */
    function syncThumbs() {
        var images = Array.prototype.slice.call(carousel.querySelectorAll('.carousel-item img'));
        var sources = images.map(function (image) { return image.src; }).join();
        var active = activeImage();
        if (sources !== thumbSources) {
            thumbSources = sources;
            thumbs.innerHTML = '';
            images.forEach(function (image, index) {
                var button = document.createElement('button');
                var thumb = document.createElement('img');
                button.type = 'button';
                button.className = 'gallery-thumb flex-shrink-0 p-0';
                button.setAttribute('aria-label', root.getAttribute('data-label-thumb').replace('{0}', index + 1));
                thumb.src = image.src;
                thumb.alt = '';
                thumb.className = 'd-block w-100';
                button.appendChild(thumb);
                button.addEventListener('click', function () {
                    // The indicators are bound for whichever Bootstrap the deployed base ships.
                    carousel.querySelectorAll('.carousel-indicators button')[index].click();
                });
                thumbs.appendChild(button);
            });
            root.classList.toggle('has-thumbs', images.length > 1);
            thumbs.classList.toggle('d-lg-flex', images.length > 1);
        }
        images.forEach(function (image, index) {
            if (thumbs.children[index]) {
                thumbs.children[index].classList.toggle('is-active', image === active);
            }
        });
    }

    /**
     * Hides the lens and the magnified view
     */
    function hideZoom() {
        lens.classList.add('d-none');
        pane.classList.add('d-none');
    }

    /**
     * Moves the lens under the pointer and shows that part of the image beside the gallery
     * @param {MouseEvent} event - Pointer movement over the gallery
     */
    function moveZoom(event) {
        var image = activeImage();
        if (!canZoom.matches || !buyColumn || !image || event.target.closest('.gallery-actions')) {
            hideZoom();
            return;
        }
        var box = image.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
            hideZoom();
            return;
        }
        var stageBox = stage.getBoundingClientRect();
        var paneWidth = buyColumn.getBoundingClientRect().right - stageBox.right - 16;
        var lensWidth = Math.min(box.width, paneWidth / ZOOM);
        var lensHeight = Math.min(box.height, stageBox.height / ZOOM);
        var x = Math.min(Math.max(event.clientX - box.left - (lensWidth / 2), 0), box.width - lensWidth);
        var y = Math.min(Math.max(event.clientY - box.top - (lensHeight / 2), 0), box.height - lensHeight);

        lens.style.left = (box.left - stageBox.left) + x + 'px';
        lens.style.top = (box.top - stageBox.top) + y + 'px';
        lens.style.width = lensWidth + 'px';
        lens.style.height = lensHeight + 'px';
        pane.style.width = paneWidth + 'px';
        pane.style.height = stageBox.height + 'px';
        pane.style.backgroundImage = 'url("' + image.src + '")';
        pane.style.backgroundSize = (box.width * ZOOM) + 'px ' + (box.height * ZOOM) + 'px';
        pane.style.backgroundPosition = (-x * ZOOM) + 'px ' + (-y * ZOOM) + 'px';
        lens.classList.remove('d-none');
        pane.classList.remove('d-none');
    }

    /**
     * Opens the image on show in a modal. This is the zoom for touch and keyboard users.
     */
    function openFullView() {
        var image = activeImage();
        hideZoom();
        dialogImage.src = image.src;
        dialogImage.alt = image.alt;
        dialog.showModal();
    }

    lens.className = 'gallery-lens position-absolute d-none';
    pane.className = 'gallery-zoom position-absolute d-none';
    lens.setAttribute('aria-hidden', 'true');
    pane.setAttribute('aria-hidden', 'true');
    stage.appendChild(lens);
    stage.appendChild(pane);

    dialog.className = 'gallery-dialog p-0';
    dialogImage.className = 'd-block w-100';
    dialogClose.type = 'button';
    dialogClose.className = 'gallery-action gallery-dialog-close d-flex align-items-center justify-content-center position-absolute';
    dialogClose.setAttribute('aria-label', root.getAttribute('data-label-close'));
    dialogClose.innerHTML = '<span aria-hidden="true">&times;</span>';
    dialogClose.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
        if (event.target === dialog) {
            dialog.close();
        }
    });
    dialog.appendChild(dialogImage);
    dialog.appendChild(dialogClose);
    document.body.appendChild(dialog);

    stage.addEventListener('mousemove', moveZoom);
    stage.addEventListener('mouseleave', hideZoom);
    stage.addEventListener('click', function (event) {
        if (event.target.closest('.carousel-item img')) {
            openFullView();
        }
    });
    detail.querySelector('[data-gallery-full]').addEventListener('click', openFullView);
    detail.querySelector('[data-gallery-share]').addEventListener('click', function () {
        var copyLink = document.getElementById('fa-link');
        if (navigator.share) {
            navigator.share({ title: document.title, url: window.location.href }).catch(function () {});
        } else if (copyLink) {
            copyLink.click();
        }
    });

    new MutationObserver(syncThumbs).observe(carousel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    syncThumbs();
}

/**
 * Shows a dropdown's values as buttons. The select stays in the page and keeps driving base's
 * variation requests, which also update its options.
 * @param {HTMLSelectElement} select - Variation attribute select
 */
function initOptionChips(select) {
    var group = document.createElement('div');
    var label = select.parentNode.querySelector('label');

    /**
     * Copies each option's state to its button, keeping the buttons so focus survives an update
     */
    function sync() {
        var options = Array.prototype.slice.call(select.options, 1);
        if (group.children.length !== options.length) {
            group.innerHTML = '';
            options.forEach(function () {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'option-chip';
                group.appendChild(chip);
            });
        }
        options.forEach(function (option, index) {
            var chip = group.children[index];
            chip.textContent = option.text.trim();
            chip.disabled = option.disabled;
            chip.setAttribute('aria-pressed', String(option.selected));
        });
    }

    group.className = 'option-chips d-flex flex-wrap';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label ? label.textContent.trim() : '');
    group.addEventListener('click', function (event) {
        var chip = event.target.closest('.option-chip');
        if (!chip) {
            return;
        }
        var index = Array.prototype.indexOf.call(group.children, chip) + 1;
        select.selectedIndex = select.selectedIndex === index ? 0 : index; // eslint-disable-line no-param-reassign
        sync();
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.classList.add('sr-only', 'visually-hidden');
    select.setAttribute('aria-hidden', 'true');
    select.setAttribute('tabindex', '-1');
    select.parentNode.insertBefore(group, select.nextSibling);
    new MutationObserver(sync).observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'selected', 'value']
    });
    sync();
}

/**
 * Sets the stock state the availability colours key off
 * @param {HTMLElement} element - The .product-availability row
 * @param {boolean} ready - All required options are chosen
 * @param {boolean} available - The product can be ordered
 * @param {string} text - The availability messages
 */
function setStock(element, ready, available, text) {
    var state = 'limited';
    if (!ready) {
        state = 'pending';
    } else if (!available) {
        state = 'out';
    } else if (text.indexOf(element.getAttribute('data-label-in-stock')) > -1) {
        state = 'in';
    }
    element.setAttribute('data-stock', state);
}

/**
 * Colours availability on load and whenever base reports a new variant
 */
function initStock() {
    document.querySelectorAll('.product-availability[data-label-in-stock]').forEach(function (element) {
        var message = element.querySelector('.availability-msg');
        setStock(
            element,
            element.getAttribute('data-ready-to-order') === 'true',
            element.getAttribute('data-available') === 'true',
            message ? message.textContent : ''
        );
    });
    if (window.jQuery) {
        window.jQuery('body').on('product:updateAvailability', function (event, response) {
            response.$productContainer.find('.product-availability[data-label-in-stock]').each(function () {
                setStock(this, response.product.readyToOrder, response.product.available, response.product.availability.messages.join(' '));
            });
        });
    }
}

document.querySelectorAll('[data-store-carousel]').forEach(initCarousel);
document.querySelectorAll('[data-store-gallery="true"]').forEach(function (gallery) {
    initGallery(gallery);
    gallery.closest('.product-detail').querySelectorAll('[data-attr] .attribute:not(.quantity) select').forEach(initOptionChips);
});
initStock();
initReveal();
