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
         * @param {string} parentSelector - the top level DOM selector for a unique address summary
         * @param {Object} address - the address data
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
         * @param {Array} totals - the totals data
         */
        function updateTotals(totals) {
            $('.shipping-total-cost').text(totals.totalShippingCost);
            $('.tax-total').text(totals.totalTax);
            $('.sub-total').text(totals.subTotal);
            $('.grand-total-sum').text(totals.grandTotal);

            if (totals.orderLevelDiscountTotal.value > 0) {
                $('.order-discount').show();
                $('.order-discount-total').text('- ' + totals.orderLevelDiscountTotal.formatted);
            } else {
                $('.order-discount').hide();
            }

            if (totals.shippingLevelDiscountTotal.value > 0) {
                $('.shipping-discount').show();
                $('.shipping-discount-total').text('- ' +
                    totals.shippingLevelDiscountTotal.formatted);
            } else {
                $('.shipping-discount').hide();
            }
        }

        /**
         * Updates the shipping method in the shipping summary
         * @param {Object} shippingMethod - the selected shipping medthod data
         * @param {Array} totals - the totals data
         */
        function updateShippingSummary(shippingMethod, totals) {
            $('.shipping-method-title').text(shippingMethod.displayName);
            if (shippingMethod.estimatedArrivalTime) {
                $('.shipping-method-arrival-time')
                    .text('( ' + shippingMethod.estimatedArrivalTime + ' )');
            } else {
                $('.shipping-method-arrival-time').empty();
            }
            $('.shipping-method-price').text(totals.totalShippingCost);
        }

        /**
         * Display error messages and highlight form fields with errors.
         * @param {string} parentSelector - the form which contains the fields
         * @param {Object} fieldErrors - the fields with errors
         */
        function loadFormErrors(parentSelector, fieldErrors) { // eslint-disable-line
            // Display error messages and highlight form fields with errors.
            $.each(fieldErrors, function (attr) {
                $('*[name=' + attr + ']', parentSelector)
                    .parents('.form-group').first()
                    .toggleClass('has-danger')
                    .find('.form-control-feedback')
                    .html(fieldErrors[attr]);
            });
        }

        /**
         * Clear the form errors.
         * @param {string} parentSelector - the parent form selector.
         */
        function clearPreviousErrors(parentSelector) {
            $('*[name]', parentSelector)
                .parents('.form-group').removeClass('has-danger');
            $('.error-message').hide();
        }

        /**
         * Handle response from the server for valid or invalid form fields.
         * @param {Object} defer - the deferred object which will resolve on success or reject.
         * @param {Object} data - the response data with the invalid form fields or
         *  valid model data.
         */
        function shippingFormResponse(defer, data) {
            // highlight fields with errors
            if (data.error && data.fieldErrors.length) {
                data.fieldErrors.forEach(function (error) {
                    if (Object.keys(error).length) {
                        loadFormErrors('.shipping-form', error);
                    }
                });
                defer.reject(data);
            } else {
                //
                // Populate the Address Summary
                //
                var address = data.shippingData.shippingAddress;
                var selectedShippingMethod = data.shippingData.selectedShippingMethod;
                populateSummary('.shipping .address-summary', address);
                updateShippingSummary(selectedShippingMethod, data.totals);
                updateTotals(data.totals);
                defer.resolve(data);
            }
        }

        //
        // Local member methods of the Checkout plugin
        //
        var members = {

            // initialize the currentStage variable for the first time
            currentStage: 0,

            /**
             * Set or update the checkout stage (AKA the shipping, billing, payment, etc... steps)
             * @returns {Object} a promise
             */
            updateStage: function () {
                var stage = checkoutStages[members.currentStage];
                var defer = $.Deferred(); // eslint-disable-line

                if (stage === 'shipping') {
                    //
                    // Clear Previous Errors
                    //
                    clearPreviousErrors('.shipping-form');

                    //
                    // Submit the Shipiing Address Form
                    //
                    $.ajax({
                        url: $('#dwfrm_singleShipping').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_singleShipping').serialize(),
                        success: function (data) {
                            shippingFormResponse(defer, data);
                        },
                        error: function () {
                            // Server error submitting form
                            defer.reject();
                        }
                    });

                    return defer;
                } else if (stage === 'payment') {
                    //
                    // Submit the Billing Address Form
                    //

                    clearPreviousErrors('.payment-form');

                    $.ajax({
                        url: $('#dwfrm_payment').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_payment').serialize(),
                        success: function (data) {
                            // look for field validation errors
                            if (data.error) {
                                if (data.fieldErrors.length) {
                                    data.fieldErrors.forEach(function (error) {
                                        if (Object.keys(error).length) {
                                            loadFormErrors('.payment-form', error);
                                        }
                                    });
                                }

                                if (data.serverErrors.length) {
                                    data.serverErrors.forEach(function (error) {
                                        $('.error-message').show();
                                        $('.error-message-text').text(error);
                                    });
                                }

                                defer.reject();
                            } else {
                                //
                                // Populate the Address Summary
                                //
                                var address = data.billingData.billingAddress.address;
                                populateSummary('.billing .address-summary', address);
                                updateTotals(data.totals);
                                var $paymentSummary = $('.payment-details');
                                var htmlToAppend = '<span> ' + data.resource.cardType + ' ' +
                                    data.billingData.payment.selectedPaymentInstruments[0].type +
                                    '</span> <div>' +
                                    data.billingData.payment.selectedPaymentInstruments[0]
                                        .maskedCreditCardNumber +
                                    '</div> <div>' +
                                    '<span>' + data.resource.cardEnding + ' ' +
                                    data.billingData.payment
                                        .selectedPaymentInstruments[0].expirationMonth +
                                    '/' + data.billingData.payment.selectedPaymentInstruments[0]
                                        .expirationYear + '</span>';
                                $paymentSummary.empty().append(htmlToAppend);
                                defer.resolve(data);
                            }
                        },
                        error: function () {
                        }
                    });

                    return defer;
                } else if (stage === 'placeOrder') {
                    $.ajax({
                        url: $('.place-order').data('action'),
                        method: 'POST',
                        success: function (data) {
                            if (data.error) {
                                // go to appropriate stage and display error message
                                defer.reject(data);
                            } else {
                                var url = data.continueUrl;
                                var urlParams = { ID: data.orderID };

                                url += (url.indexOf('?') !== -1 ? '&' : '?') +
                                    Object.keys(urlParams).map(function (key) {
                                        return key + '=' + encodeURIComponent(urlParams[key]);
                                    }).join('&');

                                window.location.href = url;
                                defer.resolve(data);
                            }
                        },
                        error: function () {
                        }
                    });

                    return defer;
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
                        var shippingMethods = data.shipping.applicableShippingMethods;
                        var address = data.shippingForm.shippingAddress;
                        var selected = data.shipping.selectedShippingMethod;

                        //
                        // Create the new rows for each shipping method
                        //
                        $.each(shippingMethods, function (key, shippingMethod) {
                            var tmpl = $('#shipping-method-template').clone();
                            // set input
                            $('input', tmpl)
                                .prop('id', 'shippingMethod-' + shippingMethod.ID)
                                .prop('name', address.shippingMethodID.htmlName)
                                .prop('value', shippingMethod.ID)
                                .attr('checked', shippingMethod.ID === selected.ID);

                            // set shipping method name
                            $('.display-name', tmpl).text(shippingMethod.displayName);

                            // set or hide arrival time
                            if (shippingMethod.estimatedArrivalTime) {
                                $('.arrival-time', tmpl)
                                    .text(shippingMethod.estimatedArrivalTime)
                                    .show();
                            }

                            // set shipping cost
                            $('.shipping-cost', tmpl).text(shippingMethod.shippingCost);

                            $shippingMethodList.append(tmpl.html());
                        });

                        updateTotals(data.totals);
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
                 * @param {boolean} checked - is the checkbox checked
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
                $('input[name$="paymentMethod"]', plugin).on('change', function () {
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
                    members.gotoStage('shipping');
                });

                $('.payment-summary .edit-button', plugin).on('click', function () {
                    members.gotoStage('payment');
                });

                //
                // Handle Credit Card Number
                //
                $('#checkout-main').on('keyup','#cardNumber', function () {
                    var firstDigit = $(this).val()[0];

                    var cardMap = {
                        4: 'Visa',
                        5: 'MasterCard',
                        3: 'Amex',
                        6: 'Discover'
                    };

                    if (cardMap[firstDigit]) {
                        $('.credit-card-selection').attr('data-card-type',cardMap[firstDigit]);
                        $('.credit-option').hide();
                        $('#cardType').val(cardMap[firstDigit]);
                    } else {
                        $('.credit-card-selection').removeAttr('data-card-type');
                        $('.credit-option').show();
                    }
                });

                //
                // remember stage (e.g. shipping)
                //
                history.pushState(checkoutStages[members.currentStage],
                    document.title, location.pathname + '#' + checkoutStages[members.currentStage]);

                //
                // Listen for foward/back button press and move to correct checkout-stage
                //
                $(window).on('popstate', function (e) {
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
                    'select[name$="shippingAddress_addressFields_states_state"]',
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

                promise.fail(function (data) {
                    // show errors
                    if (data) {
                        if (data.errorStage) {
                            members.gotoStage(data.errorStage.stage);

                            if (data.errorStage.step === 'billingAddress') {
                                var $billingAddressSameAsShipping = $(
                                    'input[name$="_shippingAddressUseAsBillingAddress"]'
                                );
                                if ($billingAddressSameAsShipping.is(':checked')) {
                                    $billingAddressSameAsShipping.prop('checked', false);
                                    $('.billing-address').toggleClass('same-as-shipping', false);
                                }
                            }
                        }

                        if (data.errorMessage) {
                            $('.error-message').show();
                            $('.error-message-text').text(data.errorMessage);
                        }
                    }
                });
            },

            /**
             * The next checkout state step updates the css for showing correct buttons etc...
             *
             * @param {boolean} bPushState - boolean when true pushes state using the history api.
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
             * @param {string} stageName - the checkout state to goto
             */
            gotoStage: function (stageName) {
                members.currentStage = checkoutStages.indexOf(stageName);
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
