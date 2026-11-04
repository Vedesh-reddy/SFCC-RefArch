'use strict';

/**
 * Toggles an element's open state and keeps its trigger's aria-expanded in sync.
 * @param {Element} trigger - the button controlling the element
 * @param {boolean} expanded - whether the element is open
 */
function setExpanded(trigger, expanded) {
    if (trigger) {
        trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
}

/**
 * Cycles the search placeholder text.
 */
function initSearchPlaceholder() {
    var placeholder = document.querySelector('.search-placeholder');
    if (!placeholder) {
        return;
    }
    var phrases = placeholder.getAttribute('data-placeholders').split('|');
    var index = 0;
    var update = function () {
        placeholder.innerHTML = '';
        var phrase = document.createElement('span');
        phrase.textContent = phrases[index];
        placeholder.appendChild(phrase);
        index = (index + 1) % phrases.length;
    };
    update();
    setInterval(update, 3000);
}

/**
 * Frosts the header once the page scrolls.
 */
function initScroll() {
    var header = document.getElementById('site-header');
    var update = function () {
        header.classList.toggle('scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
}

/**
 * Mobile menu, its slide-in sub pages and the profile sub menu.
 */
function initMobileMenu() {
    var hamburger = document.getElementById('hamburger-btn');
    var menu = document.getElementById('mobile-menu');
    var closeBtn = document.getElementById('mobile-close-btn');
    var profileBtn = document.getElementById('view-profile-btn');

    var close = function () {
        hamburger.classList.remove('active');
        menu.classList.remove('open');
        setExpanded(hamburger, false);
        document.body.style.overflow = '';
        document.querySelectorAll('.mobile-subpage.open').forEach(function (page) {
            page.classList.remove('open');
        });
    };

    hamburger.addEventListener('click', function () {
        if (menu.classList.contains('open')) {
            close();
            return;
        }
        hamburger.classList.add('active');
        menu.classList.add('open');
        setExpanded(hamburger, true);
        document.body.style.overflow = 'hidden';
    });
    closeBtn.addEventListener('click', close);

    document.querySelectorAll('[data-subpage]').forEach(function (link) {
        link.addEventListener('click', function () {
            var target = document.getElementById(link.getAttribute('data-subpage'));
            if (target) {
                target.classList.add('open');
                target.scrollTop = 0;
            }
        });
    });
    document.querySelectorAll('[data-back]').forEach(function (button) {
        button.addEventListener('click', function () {
            button.closest('.mobile-subpage').classList.remove('open');
        });
    });

    if (profileBtn) {
        profileBtn.addEventListener('click', function () {
            var open = document.getElementById('profile-sub-menu').classList.toggle('open');
            profileBtn.classList.toggle('open', open);
            setExpanded(profileBtn, open);
        });
    }
}

/**
 * Desktop account dropdown.
 */
function initProfileDropdown() {
    var button = document.getElementById('account-btn');
    var dropdown = document.getElementById('profile-dropdown');
    var wrap = document.getElementById('account-wrap');
    var setOpen = function (open) {
        dropdown.classList.toggle('open', open);
        setExpanded(button, open);
    };

    button.addEventListener('click', function (event) {
        event.stopPropagation();
        setOpen(!dropdown.classList.contains('open'));
    });
    document.addEventListener('click', function (event) {
        if (dropdown.classList.contains('open') && !wrap.contains(event.target)) {
            setOpen(false);
        }
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            setOpen(false);
        }
    });
}

/**
 * Desktop mega menu, opened by hover or keyboard focus.
 */
function initMegaMenu() {
    var links = document.querySelectorAll('#nav-cat a[data-mega]');
    var overlay = document.getElementById('mega-overlay');
    var active = null;
    var timer = null;

    var closeNow = function () {
        clearTimeout(timer);
        if (active) {
            document.getElementById('mega-' + active).classList.remove('open');
        }
        overlay.classList.remove('active');
        links.forEach(function (link) {
            link.classList.remove('mega-active');
        });
        active = null;
    };
    var open = function (id) {
        clearTimeout(timer);
        if (active && active !== id) {
            document.getElementById('mega-' + active).classList.remove('open');
        }
        active = id;
        document.getElementById('mega-' + id).classList.add('open');
        overlay.classList.add('active');
        links.forEach(function (link) {
            link.classList.toggle('mega-active', link.getAttribute('data-mega') === id);
        });
    };
    var closeSoon = function () {
        timer = setTimeout(closeNow, 150);
    };

    links.forEach(function (link) {
        link.addEventListener('mouseenter', function () {
            open(link.getAttribute('data-mega'));
        });
        link.addEventListener('focus', function () {
            open(link.getAttribute('data-mega'));
        });
        link.addEventListener('mouseleave', closeSoon);
    });
    document.querySelectorAll('.mega-menu').forEach(function (menu) {
        menu.addEventListener('mouseenter', function () {
            clearTimeout(timer);
        });
        menu.addEventListener('focusin', function () {
            clearTimeout(timer);
        });
        menu.addEventListener('mouseleave', closeSoon);
    });
    overlay.addEventListener('click', closeNow);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeNow();
        }
    });
}

initSearchPlaceholder();
initScroll();
initMobileMenu();
initProfileDropdown();
initMegaMenu();
