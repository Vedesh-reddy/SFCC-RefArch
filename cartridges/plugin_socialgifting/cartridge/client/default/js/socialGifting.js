'use strict';

(function () {
    var $ = window.jQuery;
    $('body').on('product:afterAttributeSelect', function (event, response) {
        if (response && response.data && response.data.product) $('.sg-product-add [name=pid]').val(response.data.product.id);
    });
    $.ajaxPrefilter(function (options) {
        if (options.type.toUpperCase() !== 'POST' || !/CheckoutServices-PlaceOrder/.test(options.url)) return;
        var target = new URL(options.url, window.location.href);
        if (target.origin !== window.location.origin) return;
        var csrf = document.querySelector('input[data-sg-csrf]');
        if (csrf) options.data = (options.data ? options.data + '&' : '') + encodeURIComponent(csrf.name) + '=' + encodeURIComponent(csrf.value);
    });
    /**
     * Display status as text, never as user-controlled markup.
     * @param {*} text - text input
     */
    function message(text) {
        var node = document.querySelector('.sg-message');
        if (node) { node.textContent = text; node.focus(); }
    }
    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form.classList.contains('sg-form')) return;
        event.preventDefault();
        if (!form.reportValidity()) return;
        var data = new URLSearchParams(new FormData(form));
        [['sgPollOption', 'options'], ['sgVote', 'choices']].forEach(function (pair) {
            if (form.querySelector('[name="' + pair[0] + '"]')) data.set(pair[1], Array.prototype.map.call(form.querySelectorAll('[name="' + pair[0] + '"]:checked'), function (input) { return input.value; }).join(','));
        });
        var button = form.querySelector('[type="submit"]');
        if (button) button.disabled = true;
        fetch(form.action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result.success) { message(result.error && result.error.message || 'Please refresh and try again.'); return; }
                var value = result.data || {};
                if (value.redirectUrl) {
                    var target = new URL(value.redirectUrl, window.location.href);
                    if (target.origin === window.location.origin) window.location.assign(target.href);
                } else if (value.shareURL) message(value.shareURL);
                else if (value.reservationKey) {
                    window.location.reload();
                } else if (value.message) message(value.message);
                else window.location.reload();
            }).catch(function () { message('Unable to complete this request. Please try again.'); })
            .then(function () { if (button) button.disabled = false; });
    });
    document.querySelectorAll('.sg-countdown').forEach(function (node) {
        var eventAt = Date.parse(node.getAttribute('datetime'));
        if (!Number.isFinite(eventAt)) return;
        /**
         * Refresh the display countdown from the server event timestamp.
         */
        function render() {
            var minutes = Math.max(0, Math.floor((eventAt - Date.now()) / 60000));
            node.textContent = new Date(eventAt).toLocaleString() + ' · ' + Math.floor(minutes / 1440) + 'd ' + Math.floor(minutes % 1440 / 60) + 'h ' + minutes % 60 + 'm';
        }
        render();
        window.setInterval(render, 60000);
    });
}());
