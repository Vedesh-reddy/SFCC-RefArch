'use strict';

// Script tag repeats per product on sets/quick view; bind once.
if (!window.customWishlistReady) {
    window.customWishlistReady = true;

    // SFRA keeps the selected variant on .product-detail data-pid; post that, not the rendered master.
    document.addEventListener('submit', function (e) {
        var form = e.target.closest('.wishlist-add-form');
        var detail = form && form.closest('.product-detail');
        var pid = detail && window.jQuery ? window.jQuery(detail).data('pid') : null;
        if (pid) {
            form.elements.pid.value = pid;
        }
    });
}

var priceAlert = document.getElementById('wishlist-price-alert');
if (priceAlert && !priceAlert.open && priceAlert.showModal) {
    priceAlert.showModal();
}
