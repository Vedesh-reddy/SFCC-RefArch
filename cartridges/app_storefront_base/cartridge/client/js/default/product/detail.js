'use strict';
var base = require('./base');

/**
 * Generates the modal window on the first call.
 *
 */
function getModalHtmlElement() {
    if ($('#inStoreInventoryModal').length !== 0) {
        $('#inStoreInventoryModal').remove();
    }
    var htmlString = '<!-- Modal -->'
        + '<div class="modal " id="inStoreInventoryModal" role="dialog">'
        + '<div class="modal-dialog in-store-inventory-dialog">'
        + '<!-- Modal content-->'
        + '<div class="modal-content">'
        + '<div class="modal-header justify-content-end">'
        + '    <button type="button" class="close pull-right" data-dismiss="modal">'
        + '        <span>Close</span>&times;'
        + '    </button>'
        + '</div>'
        + '<div class="modal-body"></div>'
        + '<div class="modal-footer"></div>'
        + '</div>'
        + '</div>'
        + '</div>';
    $('body').append(htmlString);
    $('#inStoreInventoryModal').modal('show');
}

/**
 * Replaces the content in the modal window with find stores components and
 * the result store list.
 * @param {string} selectedPostalCode - the postal code to be used for the search
 * @param {string} selectedRadius - the radius code to be used for the search
 *
 */
function fillModalElement(selectedPostalCode, selectedRadius) {
    var requestData = { pid: $('.product-id').text(), qty: $('.quantity-select').val() };

    if (selectedRadius) {
        requestData.radius = selectedRadius;
    }

    if (selectedPostalCode) {
        requestData.postalCode = selectedPostalCode;
    }

    $.spinner().start();
    $.ajax({
        url: $('.btn-get-in-store-inventory').data('action-url'),
        data: requestData,
        method: 'GET',
        success: function (response) {
            $('.modal-body').empty();
            $('.modal-body').html(response.storesResultsHtml);

            $('#inStoreInventoryModal').modal('show');
            $.spinner().stop();
        },
        error: function () {
            $.spinner().stop();
        }
    });
}

/**
 * Obtain the selected postal code and radius to fill the modal window.
 */
function getStoreList() {
    var selectedPostalCode = $('#postal-code').val();
    var selectedRadius = $('#radius').val();
    fillModalElement(selectedPostalCode, selectedRadius);
}

module.exports = {
    selectAttributes: base.selectAttribute,

    colorAttribute: base.colorAttribute,
    bonusProductSelection: base.bonusProductSelection,
    bonusProductAttributes: base.bonusProductAttributes,
    availability: base.availability,

    addToCart: base.addToCart,

    updateAttributesAndDetails: function () {
        $('body').on('product:statusUpdate', function (e, data) {
            var $productContainer = $('.product-detail[data-pid="' + data.id + '"]');

            $productContainer.find('.description-and-detail .product-attributes')
                .empty()
                .html(data.attributesHtml);

            if (data.shortDescription) {
                $productContainer.find('.description-and-detail .description')
                    .removeClass('hidden-xl-down');
                $productContainer.find('.description-and-detail .description .content')
                    .empty()
                    .html(data.shortDescription);
            } else {
                $productContainer.find('.description-and-detail .description')
                    .addClass('hidden-xl-down');
            }

            if (data.longDescription) {
                $productContainer.find('.description-and-detail .details')
                    .removeClass('hidden-xl-down');
                $productContainer.find('.description-and-detail .details .content')
                    .empty()
                    .html(data.longDescription);
            } else {
                $productContainer.find('.description-and-detail .details')
                    .addClass('hidden-xl-down');
            }
        });
    },

    showSpinner: function () {
        $('body').on('product:beforeAddToCart product:beforeAttributeSelect', function () {
            $.spinner().start();
        });
    },
    updateAttribute: function () {
        $('body').on('product:afterAttributeSelect', function (e, response) {
            if ($('.product-detail>.bundle-items').length) {
                response.container.data('pid', response.data.product.id);
                response.container.find('.product-id').text(response.data.product.id);
            } else if ($('.product-set-detail').eq(0)) {
                response.container.data('pid', response.data.product.id);
                response.container.find('.product-id').text(response.data.product.id);
            } else {
                $('.product-id').text(response.data.product.id);
                $('.product-detail:not(".bundle-item")').data('pid', response.data.product.id);
            }
        });
    },
    updateAddToCart: function () {
        $('body').on('product:updateAddToCart', function (e, response) {
            // update local add to cart (for sets)
            $('button.add-to-cart', response.$productContainer).attr('disabled',
                (!response.product.readyToOrder || !response.product.available));

            var enable = $('.product-availability').toArray().every(function (item) {
                return $(item).data('available') && $(item).data('ready-to-order');
            });
            $('button.add-to-cart-global').attr('disabled', !enable);
        });
    },
    updateAvailability: function () {
        $('body').on('product:updateAvailability', function (e, response) {
            $('div.availability', response.$productContainer)
                .data('ready-to-order', response.product.readyToOrder)
                .data('available', response.product.available);

            $('.availability-msg', response.$productContainer)
                .empty().html(response.message);

            if ($('.global-availability').length) {
                var allAvailable = $('.product-availability').toArray()
                    .every(function (item) { return $(item).data('available'); });

                var allReady = $('.product-availability').toArray()
                    .every(function (item) { return $(item).data('ready-to-order'); });

                $('.global-availability')
                    .data('ready-to-order', allReady)
                    .data('available', allAvailable);

                $('.global-availability .availability-msg').empty()
                    .html(allReady ? response.message : response.resources.info_selectforstock);
            }
        });
    },
    sizeChart: function () {
        var $sizeChart = $('.size-chart-collapsable');
        $('.size-chart a').on('click', function (e) {
            e.preventDefault();
            var url = $(this).attr('href');
            if ($sizeChart.is(':empty')) {
                $.ajax({
                    url: url,
                    type: 'get',
                    dataType: 'json',
                    success: function (data) {
                        $sizeChart.append(data.content);
                    }
                });
            }
            $sizeChart.toggleClass('active');
        });

        $('body').on('click touchstart', function (e) {
            if ($('.size-chart').has(e.target).length <= 0) {
                $sizeChart.removeClass('active');
            }
        });
    },
    updateSelectStore: function () {
        $('body').on('product:updateSelectStore', function (e, response) {
            $('.btn-get-in-store-inventory', response.$productContainer).attr('disabled',
                (!response.product.readyToOrder || !response.product.available));
        });
    },
    showInStoreInventory: function () {
        $('.btn-get-in-store-inventory').on('click', function (e) {
            getModalHtmlElement();
            fillModalElement();
            e.stopPropagation();
        });
    },
    getStoresWithInventory: function () {
        $(document).on('submit', '.store-locator', (function (e) {
            e.preventDefault();
            getStoreList();
            return false;
        }));
    },
    selectStoreWithInventory: function () {
        $('body').on('click', '.btn-select-store', (function (e) {
            e.preventDefault();
            var selectedStoreID = $('input[name=store-id]:checked').attr('value');
            var storeDetailsHtml = $('#' + selectedStoreID + ' .store-details')[0].innerHTML;

            $('.selected-store-with-inventory .card-block').empty();
            $('.selected-store-with-inventory .card-block').append(storeDetailsHtml);

            $('.btn-get-in-store-inventory').hide();
            $('#inStoreInventoryModal').modal('hide');
            $('.selected-store-with-inventory').removeClass('display-none');
        }));
    },
    changeStore: function () {
        $('body').on('click', '.change-store', (function () {
            $('#inStoreInventoryModal').modal('show');
        }));
    },
    removeStoreSelection: function () {
        $('body').on('click', '#remove-store-selection', (function () {
            $('.selected-store-with-inventory').addClass('display-none');
            $('.btn-get-in-store-inventory').show();
        }));
    },
    updateSelectStoreButton: function () {
        $('body').on('change', '.select-store-input', (function () {
            $('.btn-select-store').prop('disabled', false);
        }));
    },
    getStoresWithInventoryOnRadiusChange: function () {
        $('body').on('change', '.radius', (function () {
            getStoreList();
        }));
    }
};
