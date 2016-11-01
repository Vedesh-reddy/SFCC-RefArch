'use strict';

/**
 * Create the jQuery Checkout Plugin.
 *
 * This jQuery plugin will be registered on the dom element in checkout.isml with the
 * id of "checkout-main".
 *
 * The checkout plugin will handle the different state the user interface is in as the user
 * progresses through the varying forms such as shipping and payment.
 *
 * Billing info and payment info are used a bit synonymously in this code.
 *
 */
(function ($) {
    $.fn.checkout = function () { // eslint-disable-line
        var plugin = this;

        //
        // Collect form data from user input
        //
        var formData = {
            // Shipping Address
            shipping: {},

            // Billing Address
            billing: {},

            // Payment
            payment: {},

            // Gift Codes
            giftCode: {}
        };

        //
        // The different states/stages of checkout
        //
        var checkoutStages = [
            'shipping',
            'payment',
            'placeOrder',
            'submitted'
        ];

        /**
         * Populate the Address Summary View
         * @param parentSelector    the top level DOM selector for a unique address summary
         * @param address   the address data
         */
        function populateSummary(parentSelector, address) {
            $.each(address, function (attr) {
                var val = address[attr];
                if (val) {
                    $('.' + attr, parentSelector).text(val);
                }
            });
        }

        /**
         * updates the totals summary
         * @param totals    the totals data
         */
        function updateTotals(totals) {
            $('.shipping-cost').empty().append(totals.totalShippingCost);
            $('.tax-total').empty().append(totals.totalTax);
            $('.sub-total').empty().append(totals.subTotal);
            $('.grand-total-sum').empty().append(totals.grandTotal);
        }

        /**
         * Updates the shipping method in the shipping summary
         * @param shippingMethod    the selected shipping medthod data
         * @param totals   the totals data
         */
        function updateShippingSummary(shippingMethod, totals) {
            $('.shipping-method-title').text(shippingMethod.displayName);
            $('.shipping-method-arrival-time').text(shippingMethod.estimatedArrivalTime);
            $('.shipping-method-price').text(totals.totalShippingCost);
        }

        //
        // Local member methods of the Checkout plugin
        //
        var members = {

            // initialize the currentStage variable for the first time
            currentStage: 0,

            /**
             * Set or update the checkout stage (AKA the shipping, billing, payment, etc... steps)
             */
            updateStage: function () {
                var stage = checkoutStages[members.currentStage];

                if (stage === 'shipping') {
                    console.log('SHIPPING: submit via ajax shipping info and move to payment form'); // eslint-disable-line

                    //
                    // Submit the Shipiing Address Form
                    //
                    return $.ajax({
                        url: $('#dwfrm_singleShipping').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_singleShipping').serialize(),
                        success: function (data) {
                            //
                            // Populate the Address Summary
                            //
                            var address = data.shippingData.shippingAddress;
                            var selectedShippingMethod = data.shippingData.selectedShippingMethod;
                            populateSummary('.shipping .address-summary', address);
                            updateShippingSummary(selectedShippingMethod, data.totals);
                            updateTotals(data.totals);
                        },
                        error: function (xhr, err) {
                            console.log(err); // eslint-disable-line
                        }
                    });
                } else if (stage === 'payment') {
                    console.log('PAYMENT: submit via ajax payment info and move to place order step') // eslint-disable-line

                    //
                    // Submit the Billing Address Form
                    //
                    return $.ajax({
                        url: $('#dwfrm_billingaddress').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_billingaddress').serialize(),
                        success: function (data) {
                            //
                            // Populate the Address Summary
                            //
                            var address = data.billingData.billingAddress;
                            populateSummary('.billing .address-summary', address);
                        },
                        error: function (xhr, err) {
                            console.log(err); // eslint-disable-line
                        }
                    });
                } else if (stage === 'placeOrder') {
                    console.log('PLACE ORDER: order placed and move to submitted/confirm step') // eslint-disable-line
                    var p = $('<div>').promise(); // eslint-disable-line
                    setTimeout(function () {
                        p.done(); // eslint-disable-line
                    }, 500);
                    return p; // eslint-disable-line
                }
                var p = $('<div>').promise(); // eslint-disable-line
                setTimeout(function () {
                    p.done(); // eslint-disable-line
                }, 500);
                return p; // eslint-disable-line
            },

            updateShippingMethodList: function () {
                var $shippingMethodList = $('.shipping-method-list');
                var state = $('.shippingState').val();
                var postal = $('.shippingZipCode').val();
                var url = $shippingMethodList.data('action');
                var urlParams = {
                    state: state,
                    postal: postal

                };

                url += (url.indexOf('?') !== -1 ? '&' : '?') +
                    Object.keys(urlParams).map(function (key) {
                        return key + '=' + encodeURIComponent(urlParams[key]);
                    }).join('&');

                $.ajax({
                    url: url,
                    type: 'get',
                    dataType: 'json',
                    success: function (data) {
                        $shippingMethodList.empty();
                        var beginHtml;
                        var inputHtml;
                        var arrivalTimeHtml;
                        var htmlToAppend;
                        var shippingMethods = data.shipping.applicableShippingMethods;

                        for (var i = 0; i < shippingMethods.length; i++) {
                            beginHtml = '<div class="form-check col-xs-8 start-lines">' +
                                '<label class="form-check-label shipping-method-option">';

                            if (shippingMethods[i].ID === data.shipping.selectedShippingMethod.ID) {
                                inputHtml = '<input id="shippingMethod-' +
                                    shippingMethods[i].ID + '"' +
                                    'name="' +
                                    data.shippingForm.shippingAddress.shippingMethodID.htmlName +
                                    '" type="radio" class="form-check-input" ' +
                                    'value="' + shippingMethods[i].ID + '" checked>' +
                                    '<span>' + shippingMethods[i].displayName + '</span>';
                            } else {
                                inputHtml = '<input id="shippingMethod-' +
                                    shippingMethods[i].ID + '"' +
                                    'name="' +
                                    data.shippingForm.shippingAddress.shippingMethodID.htmlName +
                                    '" type="radio"' +
                                    'class="form-check-input" value="' +
                                    shippingMethods[i].ID + '"> ' +
                                    '<span>' + shippingMethods[i].displayName + '</span>';
                            }

                            var endingHtml = ' </label> ' +
                                '</div> ' +
                                '<div class="col-xs-4 text-xs-right ' +
                                'shipping-method-pricing end-lines"> ' +
                                '<span>' + shippingMethods[i].shippingCost + '</span> ' +
                                '</div>';

                            if (shippingMethods[i].estimatedArrivalTime) {
                                arrivalTimeHtml = '<span class="text-muted arrival-time">' +
                                    '(' + shippingMethods[i].estimatedArrivalTime + ')</span>';
                                htmlToAppend = beginHtml + inputHtml + arrivalTimeHtml + endingHtml;
                            } else {
                                htmlToAppend = beginHtml + inputHtml + endingHtml;
                            }

                            $shippingMethodList.append(htmlToAppend);
                        }

                        $('.shipping-cost').empty().append(data.totals.totalShippingCost);
                        $('.tax-total').empty().append(data.totals.totalTax);
                        $('.sub-total').empty().append(data.totals.subTotal);
                        $('.grand-total-sum').empty().append(data.totals.grandTotal);
                    }
                });
            },

            /**
             * Initialize the checkout stage.
             *
             * TODO: update this to allow stage to be set from server?
             */
            initialize: function () {
                // set the initial state of checkout
                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);

                /**
                 * Toggle "billing same as shipping"
                 * There are two input checkboxes to keep in sync here and one billing form.
                 *
                 * If the the billing isn't the same as shipping the billing form should be visible
                 * in the payment state of checkout.
                 * @param checked
                 */
                var toggleBillingForm = function (checked) {
                    $('input[name$="_shippingAddressUseAsBillingAddress"]').prop(
                        'checked',
                        checked
                    );
                    $('.billing-address').toggleClass('same-as-shipping', checked);
                };

                //
                // Handle "Billing Same as Shipping" Checkbox
                //
                $('input[name$="_shippingAddressUseAsBillingAddress"]').on('change', function () {
                    var checked = this.checked;
                    toggleBillingForm(checked);
                });

                //
                // Handle Payment option selection
                //
                $('input[name="paymentOption"]', plugin).on('change', function () {
                    $('.credit-card-form').toggle($(this).val() === 'CREDIT_CARD');
                });

                //
                // Handle Next State button click
                //
                $(plugin).on('click', '.next-step-button button', function () {
                    members.nextStage();
                });

                //
                // Handle Edit buttons on shipping and payment summary cards
                //
                $('.shipping-summary .edit-button', plugin).on('click', function () {
                    var shippingIdx = checkoutStages.indexOf('shipping');
                    members.gotoStage(shippingIdx, members.currentStage * -1);
                });

                $('.payment-summary .edit-button', plugin).on('click', function () {
                    var paymentIdx = checkoutStages.indexOf('payment');
                    members.gotoStage(paymentIdx, -1);
                });

                //
                // remember stage (e.g. shipping)
                //
                history.pushState(checkoutStages[members.currentStage],
                    document.title, location.pathname + '#' + checkoutStages[members.currentStage]);

                //
                // Listen for foward/back button press and move to correct checkout-stage
                //
                window.addEventListener('popstate', function (e) {
                    //
                    // Back button when event state less than current state in ordered
                    // checkoutStages array.
                    //
                    if (e.state === null ||
                         checkoutStages.indexOf(e.state) < members.currentStage) {
                        members.handlePrevStage(false);
                    } else if (checkoutStages.indexOf(e.state) > members.currentStage) {
                        // Forward button  pressed
                        members.handleNextStage(false);
                    }
                });

                $('#shipping-address .address').on('change',
                    'select[name$="_addressFields_states"]',
                    members.updateShippingMethodList
                );

                //
                // Set the form data
                //
                plugin.data('formData', formData);
            },

            /**
             * The next checkout state step updates the css for showing correct buttons etc...
             */
            nextStage: function () {
                var promise = members.updateStage();

                promise.done(function () {
                    // Update UI with new stage
                    members.handleNextStage(true);
                });

                promise.fail(function () {
                    alert('error');
                });
            },

            /**
             * The next checkout state step updates the css for showing correct buttons etc...
             *
             * @param bPushState = boolean when true pushes state using the history api.
             */
            handleNextStage: function (bPushState) {
                if (members.currentStage < checkoutStages.length - 1) {
                    // move stage forward
                    members.currentStage++;

                    //
                    // show new stage in url (e.g.payment)
                    //
                    if (bPushState) {
                        history.pushState(checkoutStages[members.currentStage], document.title,
                            location.pathname + '#' + checkoutStages[members.currentStage]);
                    }
                }

                // Set the next stage on the DOM
                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);
            },

            /**
             * Previous State
             */
            handlePrevStage: function () {
                if (members.currentStage > 0) {
                    // move state back
                    members.currentStage--;
                }

                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);
            },

            /**
             * Use window history to go to a checkout stage
             * @param stage
             * @param steps
             */
            gotoStage: function (stage, steps) {
                members.currentStage = stage;
                history.go(steps);
                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);
            }
        };

        //
        // Initialize the checkout
        //
        members.initialize();

        return this;
    };
}(jQuery));


module.exports = function () {
    $('#checkout-main').checkout();
};
