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

document.querySelectorAll('[data-store-carousel]').forEach(initCarousel);
initReveal();
