'use strict';

// Sign-in is a placeholder: no code is sent and nothing reaches the server until the backend exists.
var root = document.querySelector('.beyon-login');
var card = document.getElementById('glass-card');
var overlay = document.getElementById('login-overlay');
var phone = document.getElementById('phone-input');
var terms = document.getElementById('terms-ack');
var sendButton = document.getElementById('send-code-btn');
var phoneError = document.getElementById('phone-err');
var marketing = document.getElementById('mkt-consent');
var prefs = document.getElementById('prefs');
var prefsTrigger = document.getElementById('prefs-trigger');
var timerId = null;

/**
 * Enables Send code once the number and terms are valid.
 */
function validate() {
    sendButton.disabled = !(/^[0-9]{7,15}$/.test(phone.value) && terms.checked);
}

/**
 * Enables the channel chips only while marketing consent is on.
 */
function toggleChannels() {
    document.querySelectorAll('#chan-row input').forEach(function (input) {
        var channel = input;
        channel.disabled = !marketing.checked;
        if (!marketing.checked) {
            channel.checked = false;
        }
    });
}

/**
 * Starts the resend countdown.
 */
function startTimer() {
    var remaining = 30;
    var timerText = document.getElementById('timer-text');
    var resend = document.getElementById('resend-btn');
    resend.classList.add('d-none');
    timerText.classList.remove('d-none');
    document.getElementById('timer-num').textContent = remaining;
    clearInterval(timerId);
    timerId = setInterval(function () {
        remaining -= 1;
        document.getElementById('timer-num').textContent = remaining;
        if (remaining <= 0) {
            clearInterval(timerId);
            timerText.classList.add('d-none');
            resend.classList.remove('d-none');
        }
    }, 1000);
}

/**
 * Leaves the sign-in screen for the previous page, or home when there is none.
 */
function closeLogin() {
    if (root.hasAttribute('data-modal')) {
        root.classList.add('d-none');
        document.body.style.removeProperty('overflow');
        root.dispatchEvent(new CustomEvent('beyon-login:closed', { bubbles: true }));
        return;
    }
    var referrer = document.referrer;
    if (referrer && referrer.indexOf(window.location.host) > -1 && referrer !== window.location.href) {
        window.location.href = referrer;
    } else {
        window.location.href = overlay.getAttribute('data-home-url');
    }
}

document.body.style.setProperty('overflow', 'hidden');

phone.addEventListener('input', function () {
    phone.value = phone.value.replace(/[^0-9]/g, '').slice(0, 15);
    var bad = phone.value.length > 0 && phone.value.length < 7;
    phone.classList.toggle('err', bad);
    phoneError.classList.toggle('d-none', !bad);
    validate();
});
terms.addEventListener('change', validate);
marketing.addEventListener('change', toggleChannels);

prefsTrigger.addEventListener('click', function () {
    var open = prefs.classList.toggle('open');
    prefsTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
});

sendButton.addEventListener('click', function () {
    var dial = document.getElementById('cc-select').value.split('-')[0];
    document.getElementById('otp-to').textContent = dial + ' · ' + phone.value.replace(/(\d{3,5})(\d+)/, '$1 $2');
    document.getElementById('form-panel').classList.add('hidden-panel');
    document.getElementById('otp-panel').classList.add('active');
    startTimer();
    setTimeout(function () {
        document.querySelector('.otp-boxes input').focus();
    }, 100);
});

document.getElementById('otp-back').addEventListener('click', function () {
    document.getElementById('otp-panel').classList.remove('active');
    document.getElementById('form-panel').classList.remove('hidden-panel');
    clearInterval(timerId);
});
document.getElementById('resend-btn').addEventListener('click', startTimer);
document.getElementById('otp-verify').addEventListener('click', function () {
    document.getElementById('otp-note').classList.remove('d-none');
});

document.querySelectorAll('.otp-boxes input').forEach(function (input, index, boxes) {
    input.addEventListener('input', function () {
        var box = input;
        box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
        if (box.value && boxes[index + 1]) {
            boxes[index + 1].focus();
        }
    });
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Backspace' && !input.value && boxes[index - 1]) {
            boxes[index - 1].focus();
        }
    });
});

card.addEventListener('mousemove', function (event) {
    var rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (((event.clientX - rect.left) / rect.width) * 100) + '%');
    card.style.setProperty('--my', (((event.clientY - rect.top) / rect.height) * 100) + '%');
});

document.getElementById('login-close').addEventListener('click', closeLogin);
overlay.addEventListener('click', function (event) {
    if (event.target === overlay) {
        closeLogin();
    }
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !root.classList.contains('d-none')) {
        closeLogin();
    }
});

toggleChannels();
