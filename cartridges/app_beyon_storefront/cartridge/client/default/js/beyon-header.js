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

/**
 * Opens sign-in as a popup over the current page. The markup comes from the Login-Show page by AJAX
 * on first use and stays hidden in the page after closing. Failure falls back to the full page.
 */
function initLoginModal() {
    var header = document.getElementById('site-header');
    var modal = null;
    var loading = false;
    var returnFocus = null;

    var show = function () {
        modal.classList.remove('d-none');
        document.body.style.setProperty('overflow', 'hidden');
        document.getElementById('phone-input').focus();
    };
    var loadStyles = function () {
        return new window.Promise(function (resolve, reject) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = header.getAttribute('data-login-css');
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    };
    var loadMarkup = function (url) {
        return fetch(url, { credentials: 'same-origin' }).then(function (response) {
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            return response.text();
        }).then(function (html) {
            var content = new DOMParser().parseFromString(html, 'text/html').querySelector('.beyon-login');
            if (!content) {
                throw new Error('Login markup not found');
            }
            return content;
        });
    };
    var loadScript = function () {
        var script = document.createElement('script');
        script.src = header.getAttribute('data-login-js');
        document.body.appendChild(script);
    };

    document.addEventListener('beyon-login:closed', function () {
        if (returnFocus) {
            returnFocus.focus();
        }
    });
    document.addEventListener('click', function (event) {
        var link = event.target.closest('.js-login-open');
        if (!link) {
            return;
        }
        event.preventDefault();
        var dropdown = document.getElementById('profile-dropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
            setExpanded(document.getElementById('account-btn'), false);
        }
        if (link.closest('#mobile-menu')) {
            document.getElementById('mobile-close-btn').click();
            returnFocus = document.getElementById('hamburger-btn');
        } else {
            returnFocus = document.getElementById('account-btn');
        }
        if (modal) {
            show();
            return;
        }
        if (loading) {
            return;
        }
        loading = true;
        window.Promise.all([loadMarkup(link.href), loadStyles()]).then(function (results) {
            modal = document.importNode(results[0], true);
            modal.setAttribute('data-modal', 'true');
            document.body.appendChild(modal);
            loadScript();
            show();
        }).catch(function () {
            window.location.href = link.href;
        });
    });
}

initSearchPlaceholder();
initScroll();
initMobileMenu();
initProfileDropdown();
initMegaMenu();
initLoginModal();
