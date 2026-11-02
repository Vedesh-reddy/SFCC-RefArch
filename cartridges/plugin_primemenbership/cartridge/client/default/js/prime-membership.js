'use strict';

/**
 * Member badge, product labels and basket savings. These change per shopper, so they come from
 * uncached routes and are added here instead of living in cached markup. A shopper without this
 * script loses only the labels: Cart-AddProduct and PlaceOrder enforce the rules on the server.
 */
$(document).ready(function () {
    var $config = $('#prime-membership-config');
    if (!$config.length) return;
    var savings = null;

    /**
     * @param {string} text - link text
     * @param {string} url - target
     * @param {string} className - class
     * @returns {jQuery} header link
     */
    function headerLink(text, url, className) {
        return $('<a class="nav-item d-inline-block align-middle mr-3 me-3"></a>').addClass(className).attr('href', url).text(text);
    }

    /**
     * Shows the member's savings in the cart and checkout totals, once each.
     */
    function renderSavings() {
        $('.prime-membership-savings').remove();
        if (!savings) return;
        $('.order-total-summary, .totals').first().prepend($('<p class="prime-membership-savings small mb-2" role="status"></p>').text(savings));
    }

    /**
     * Labels the products on this page, and turns off the buttons of locked ones.
     */
    function renderLabels() {
        var ids = {};
        $('.product[data-pid], .product-detail[data-pid]').each(function () {
            if (!$(this).find('.prime-membership-label').length) ids[String($(this).data('pid'))] = true;
        });
        var pids = Object.keys(ids).slice(0, 48);
        if (!pids.length) return;
        $.ajax({ url: $config.data('labels-url'), data: { pids: pids.join(',') }, dataType: 'json', method: 'GET' }).done(function (data) {
            Object.keys(data.labels || {}).forEach(function (pid) {
                var entry = data.labels[pid];
                $('.product[data-pid="' + pid + '"], .product-detail[data-pid="' + pid + '"]').each(function () {
                    var $product = $(this);
                    if ($product.find('.prime-membership-label').length) return;
                    var text = [entry.label, entry.offer].filter(Boolean).join(' - ');
                    if (text) $product.find('.price').first().before($('<p class="prime-membership-label small mb-1"></p>').text(text));
                    if (entry.locked) $product.find('.add-to-cart').prop('disabled', true);
                });
            });
        });
    }

    $.ajax({ url: $config.data('context-url'), dataType: 'json', method: 'GET' }).done(function (context) {
        var $user = $('.navbar-header .user').first();
        if (context.badge) $user.before(headerLink(context.badge.text, context.badge.url, 'prime-membership-badge'));
        else if (context.join) $user.before(headerLink(context.join.text, context.join.url, 'prime-membership-join'));
        savings = context.savings;
        renderSavings();
    });
    renderLabels();

    // Cart edits and search refinements replace this markup through AJAX.
    $(document).ajaxComplete(function (event, xhr, settings) {
        if (settings.url && settings.url.indexOf('PrimeMembership-') >= 0) return;
        renderSavings();
        renderLabels();
    });
});
