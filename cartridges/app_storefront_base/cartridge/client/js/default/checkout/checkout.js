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
         * @param {Object} shippingMethod - the selected shipping method data
         * @param {Array} totals - the totals data
         */
        function updateShippingSummary(shippingMethod, totals) {
            $('.shipping-method-title').text(shippingMethod.displayName);
            if (shippingMethod.estimatedArrivalTime) {
                $('.shipping-method-arrival-time')
                    .text('(' + shippingMethod.estimatedArrivalTime + ')');
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
                    .addClass('has-danger')
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
            var isMultiShip = $('#checkout-main').hasClass('multi-ship');
            var formSelector = isMultiShip ?
                    '.multi-shipping .active form' : '.single-shipping .active form';

            // highlight fields with errors
            if (data.error) {
                if (data.fieldErrors.length) {
                    data.fieldErrors.forEach(function (error) {
                        if (Object.keys(error).length) {
                            loadFormErrors(formSelector, error);
                        }
                    });
                    defer.reject(data);
                }

                if (data.cartError) {
                    window.location.href = data.redirectUrl;
                    defer.reject();
                }
            } else {
                //
                // Populate the Address Summary
                //
                var address = data.shippingData.shippingAddress;
                var selectedShippingMethod = data.shippingData.selectedShippingMethod;
                populateSummary('.shipping .address-summary', address);
                $('.shipping-phone').text(address.phone);
                updateShippingSummary(selectedShippingMethod, data.totals);
                updateTotals(data.totals);
                defer.resolve(data);
            }
        }

        /**
         * Updates the URL to determine stage
         * @param {number} currentStage - The current stage the user is currently on in the checkout
         */
        function updateUrl(currentStage) {
            history.pushState(
                checkoutStages[currentStage],
                document.title,
                location.pathname
                + '?stage='
                + checkoutStages[currentStage]
                + '#'
                + checkoutStages[currentStage]
            );
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
                    var isMultiShip = $('#checkout-main').hasClass('multi-ship');
                    var formSelector = isMultiShip ?
                            '.multi-shipping .active form' : '.single-shipping .active form';
                    var form = $(formSelector);
                    if (isMultiShip && form.length === 0) {
                        // in case the multi ship form is already submitted
                        defer.resolve();
                    } else {
                        $.ajax({
                            url: form.attr('action'),
                            method: 'POST',
                            data: form.serialize(),
                            success: function (data) {
                                shippingFormResponse(defer, data);
                            },
                            error: function () {
                                // Server error submitting form
                                defer.reject();
                            }
                        });
                    }
                    return defer;
                } else if (stage === 'payment') {
                    //
                    // Submit the Billing Address Form
                    //

                    clearPreviousErrors('.payment-form');

                    $.ajax({
                        url: $('#dwfrm_billing').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_billing').serialize(),
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

                                if (data.cartError) {
                                    window.location.href = data.redirectUrl;
                                }

                                defer.reject();
                            } else {
                                //
                                // Populate the Address Summary
                                //
                                var address = data.billingData.billingAddress.address;
                                populateSummary('.billing .address-summary', address);
                                $('.order-summary-email').text(data.orderEmail);
                                $('.order-summary-phone').text(address.phone);
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
                                if (data.cartError) {
                                    window.location.href = data.redirectUrl;
                                    defer.reject();
                                } else {
                                    // go to appropriate stage and display error message
                                    defer.reject(data);
                                }
                            } else {
                                var continueUrl = data.continueUrl;
                                var urlParams = { ID: data.orderID };

                                continueUrl += (continueUrl.indexOf('?') !== -1 ? '&' : '?') +
                                    Object.keys(urlParams).map(function (key) {
                                        return key + '=' + encodeURIComponent(urlParams[key]);
                                    }).join('&');

                                window.location.href = continueUrl;
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

            updateShippingMethodList: function (event) {
                var $shippingForm = $(event.currentTarget.form);
                var $shippingMethodList = $shippingForm.find('.shipping-method-list');
                var state = $shippingForm.find('.shippingState').val();
                var postal = $shippingForm.find('.shippingZipCode').val();
                var shipmentUUID = $shippingForm.find('[name=shipmentUUID]').val();
                var url = $shippingMethodList.data('action');
                var urlParams = {
                    state: state,
                    postal: postal,
                    shipmentUUID: shipmentUUID
                };

                $.ajax({
                    url: url,
                    type: 'post',
                    dataType: 'json',
                    data: urlParams,
                    success: function (data) {
                        if (data.error) {
                            window.location.href = data.redirectUrl;
                        } else {
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
                                        .text('(' + shippingMethod.estimatedArrivalTime + ')')
                                        .show();
                                }

                                // set shipping cost
                                $('.shipping-cost', tmpl).text(shippingMethod.shippingCost);

                                $shippingMethodList.append(tmpl.html());
                            });

                            updateTotals(data.totals);
                        }
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
                members.currentStage = checkoutStages
                    .indexOf($('.data-checkout-stage').data('checkout-stage'));
                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);

                $('.billing-address').toggleClass(
                    'same-as-shipping',
                    $('input[name$="_shippingAddressUseAsBillingAddress"]').is(':checked')
                );

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

                var toggleMultiShipForm = function (usingMultiShip) {
                    if (usingMultiShip) {
                        $('#checkout-main').addClass('multi-ship');
                    } else {
                        $('#checkout-main').removeClass('multi-ship');
                    }
                };

                var toggleMultiShip = function (checked) {
                    var url = $('.shipping-nav form').attr('action');
                    $.spinner().start();
                    $.ajax({
                        url: url,
                        type: 'post',
                        dataType: 'json',
                        data: {
                            usingMultiShip: !!checked
                        },
                        success: function (data) {
                            if (data.error) {
                                window.location.href = data.redirectUrl;
                            } else if (data.usingMultiShipping) {
                                toggleMultiShipForm(true);
                            } else {
                                // Switching back to single ship forces reload
                                var urlParts = window.location.href.split('#');
                                window.location.href = urlParts[0];
                            }
                            $.spinner().stop();
                        },
                        error: function () {
                            $.spinner().stop();
                        }
                    });
                };

                var toggleMultiShipStep = function (tabPanel, rootPanel) {
                    if (tabPanel) {
                        $('.active', rootPanel).removeClass('active');
                        tabPanel.tab('show');
                    }
                };

                //
                // Handle "Billing Same as Shipping" Checkbox
                //
                $('input[name$="_shippingAddressUseAsBillingAddress"]').on('change', function () {
                    var checked = this.checked;
                    toggleBillingForm(checked);
                });

                $('input[name="usesMultiShip"]').on('change', function () {
                    var checked = this.checked;
                    toggleMultiShip(checked);
                });

                $('.toggle-shipping-address-form').on('click', function () {
                    $(this).parents('form').toggleClass('hide-details');
                });

                $('.product-shipping-block .addressSelector').on('change', function () {
                    var form = $(this).parents('form')[0];
                    var selectedOption = $('option:selected', this);
                    var attrs = selectedOption.data();
                    var shipmentUUID = selectedOption[0].value;
                    var originalUUID = $('input[name=shipmentUUID]', form).val();

                    Object.keys(attrs).forEach(function (attr) {
                        $('[name$=' + attr + ']', form).val(attrs[attr]);
                    });

                    if (shipmentUUID === 'new') {
                        $(form).removeClass('hide-details');
                        $('.toggle-shipping-address-form', form).hide();
                    } else if (shipmentUUID === originalUUID) {
                        $(form).addClass('hide-details');
                        $('.toggle-shipping-address-form', form).show();
                    } else {
                        $(form).addClass('hide-details');
                        $('.toggle-shipping-address-form', form).hide();
                    }
                });

                $('.product-shipping-block [data-toggle="tab1"]').on('click', function (e) {
                    e.preventDefault();

                    var target = this.hash;
                    var action = $(this).data('action');
                    var testTarget = target.replace(/-[0-9]+$/g, '');
                    var rootPanel = $(this).parents('.tab-content')[0];
                    var form = $(this).parents('form')[0];
                    var tabPanel = $(target);

                    switch (testTarget) {
                        case '#edit-address':
                        // do nothing special, just show the edit address view
                            $('.toggle-shipping-address-form', form).hide();
                            if (action === 'enter') {
                                $('form .shipping-address-block input', rootPanel).val('');
                            } else {
                                $(form).removeClass('hide-details');
                            }
                            toggleMultiShipStep(tabPanel, rootPanel);
                            break;
                        case '#view-address':
                        // Save address to checkoutAddressBook
                            var data = $(form).serialize();
                            var url = form.action;
                            $.spinner().start();
                            $.ajax({
                                url: url,
                                type: 'post',
                                dataType: 'json',
                                data: data
                            })
                            .done(function (response) {
                                clearPreviousErrors(form);
                                if (response.error) {
                                    loadFormErrors(form, response.fieldErrors);
                                } else {
                                    window.location.href = window.location.href.replace(/#.+/g, '');
                                    // toggleMultiShipStep(tabPanel, rootPanel);
                                }
                                $.spinner().stop();
                            })
                            .fail(function () {
                                // console.error('error saving address!');
                                // console.dir(err);
                                $.spinner().stop();
                            });

                            // pull down applicable shipping methods
                            break;
                        case '#save-shipping-method':
                        // Save shipping method to PLI / checkoutAddressBook
                        // just show static info view
                            var shippingData = $(form).serialize();
                            var saveShippingMethodurl = form.action;
                            $.ajax({
                                url: saveShippingMethodurl,
                                type: 'post',
                                dataType: 'json',
                                data: shippingData
                            })
                            .done(function () {
                                toggleMultiShipStep(tabPanel, rootPanel);
                                $.spinner().stop();
                            })
                            .fail(function () {
                                // console.error('error saving address!');
                                // console.dir(err);
                                $.spinner().stop();
                            });
                            break;
                        default:
                            // console.error('unhandled tab target: ' + testTarget);
                    }
                    return false;
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
                $('#checkout-main').on('keyup', '#cardNumber', function () {
                    var firstDigit = $(this).val()[0];

                    var cardMap = {
                        4: 'Visa',
                        5: 'MasterCard',
                        3: 'Amex',
                        6: 'Discover'
                    };

                    if (cardMap[firstDigit]) {
                        $('.credit-card-selection').attr('data-card-type', cardMap[firstDigit]);
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
                updateUrl(members.currentStage);

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

                $('select[name$="shippingAddress_addressFields_states_stateCode"]').on('change',
                    members.updateShippingMethodList
                );

                $('.shipping-method-list').change(function () {
                    var $shippingForm = $(this.form);
                    var methodID = $(':checked', this).val();
                    var shipmentUUID = $shippingForm.find('[name=shipmentUUID]').val();
                    var url = $(this).data('select-shipping-method-url');
                    var urlParams = {
                        methodID: methodID,
                        shipmentUUID: shipmentUUID
                    };

                    $.spinner().start();
                    $.ajax({
                        url: url,
                        type: 'post',
                        dataType: 'json',
                        data: urlParams
                    })
                     .done(function (data) {
                         if (data.error) {
                             window.location.href = data.redirectUrl;
                         } else {
                             updateTotals(data.totals);
                         }
                         $.spinner().stop();
                     })
                     .fail(function () {
                         $.spinner().stop();
                     });
                });

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
                        updateUrl(members.currentStage);
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
                    updateUrl(members.currentStage);
                }

                $(plugin).attr('data-checkout-stage', checkoutStages[members.currentStage]);
            },

            /**
             * Use window history to go to a checkout stage
             * @param {string} stageName - the checkout state to goto
             */
            gotoStage: function (stageName) {
                members.currentStage = checkoutStages.indexOf(stageName);
                updateUrl(members.currentStage);
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
