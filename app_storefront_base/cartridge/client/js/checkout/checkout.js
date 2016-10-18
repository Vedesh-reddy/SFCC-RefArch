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
 */
(function ( $ ) {
    $.fn.checkout = function() {

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
            giftCode : {}
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

        var members = {

            // initialize the currentStage variable for the first time
            currentStage: 0,

            /**
             * Set or update the checkout stage (AKA the shipping, billing, payment, etc... steps)
             */
            updateStage: function () {
                var stage = checkoutStages[ members.currentStage ];

                if ( stage === 'shipping') {

                    console.log('SHIPPING: submit via ajax shipping info and move to payment form')

                    return $.ajax({
                        url: $('#dwfrm_shippingaddress').attr('action'),
                        method: 'POST',
                        data: $('#dwfrm_shippingaddress').serialize(),
                        success: function(data) {

                            if (data && data.form) {
                                $.each(data.form, function(attr) {
                                    var val = data.form[attr];
                                    if (val instanceof Object && val.htmlName && val.value) {
                                        console.log(val.htmlName, val.value);

                                        $('.address-summary .' + val.htmlName ).text(val.value)
                                    }
                                })
                            }
                        },
                        error: function(xhr,err) {
                            console.log(err)
                        }
                    });

                } else if ( stage === 'payment' ) {
                    console.log('PAYMENT: submit via ajax payment info and move to place order step')
                    var p = $('<div>').promise();
                    setTimeout(function() {
                        p.done()
                    }, 500);

                    return p;

                } else if ( stage === 'placeOrder' ) {
                   console.log('PLACE ORDER: order placed and move to submitted/confirm step')
                    var p = $('<div>').promise();
                    setTimeout(function() {
                        p.done()
                    }, 500);

                    return p;
                }

            },

            /**
             * Initialize the checkout stage.
             *
             * TODO: update this to allow stage to be set from server?
             */
            initialize: function () {

                // set the initial state of checkout
                $(plugin).attr('data-checkout-stage', checkoutStages[ members.currentStage ] )

                /**
                 * Toggle "billing same as shipping"
                 * There are two input checkboxes to keep in sync here and one billing form.
                 *
                 * If the the billing isn't the same as shipping the billing form should be visible
                 * in the payment state of checkout.
                 * @param checked
                 */
                var toggleBillingForm = function(checked) {
                    $('input[name="shippingAddressUseAsBillingAddress"]').prop('checked',checked)
                    $('input[name="billing-same-as-shipping"]').prop('checked',checked)
                    $('.billing-address').toggleClass('same-as-shipping', checked);

                }

                //
                // Handle "Billing Same as Shipping" Checkbox
                //
                $('input[name="shippingAddressUseAsBillingAddress"]:checkbox, ' +
                    'input[name="billing-same-as-shipping"]:checkbox').on('change', function () {
                    var checked = this.checked;
                    toggleBillingForm(checked);
                });

                //
                // Handle Payment option selection
                //
                $('input[name="paymentOption"]', plugin).on('change', function () {
                    $('.credit-card-form', this).toggle( $(this).val() === 'CREDIT_CARD' );
                });

                //
                // Handle Next State button click
                //
                $(plugin).on('click', '.next-step-button button', function() {
                    members.nextStage()
                });

                //
                // Handle Next State button click
                //
                $('.shipping-summary .edit-button', plugin).on('click', function() {
                    var shippingIdx = checkoutStages.indexOf('shipping')
                    members.gotoStage( shippingIdx, members.currentStage * -1 )
                });

                //
                // remember stage (e.g. shipping)
                //
                history.pushState(checkoutStages[members.currentStage],
                    document.title, location.pathname + '#' + checkoutStages[members.currentStage]);

                //
                // Listen for foward/back button press and move to correct checkout-stage
                //
                window.addEventListener('popstate', function(e) {

                    // Back button when event state less than current state in ordered checkoutStages array
                    if (e.state === null || checkoutStages.indexOf(e.state) < members.currentStage) {
                        members.handlePrevStage(false);
                    } else if (checkoutStages.indexOf(e.state) > members.currentStage) {
                        // Forward button  pressed
                        members.handleNextStage(false);
                    }
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

                promise.done(function() {

                    // Update UI with new stage
                    members.handleNextStage(true);

                });

                promise.fail(function() {
                    alert('error')
                })
            },

            /**
             * The next checkout state step updates the css for showing correct buttons etc...
             *
             * @param bPushState = boolean when true pushes state using the history api.
             */
            handleNextStage: function( bPushState ) {
                if (members.currentStage < checkoutStages.length - 1) {

                    // move stage forward
                    members.currentStage++;

                    //
                    // show new stage in url (e.g.payment)
                    //
                    if (bPushState) {
                        history.pushState(checkoutStages[members.currentStage],
                           document.title, location.pathname + '#' + checkoutStages[members.currentStage]);
                    }
                }

                // Set the next stage on the DOM
                $(plugin).attr('data-checkout-stage', checkoutStages[ members.currentStage ] )
            },

            /**
             * Previous State
             */
            handlePrevStage: function() {
                if (members.currentStage > 0) {

                    // move state back
                    members.currentStage--;
                }

                $(plugin).attr('data-checkout-stage', checkoutStages[ members.currentStage ] )
            },

            gotoStage: function(stage, steps) {
                members.currentStage = stage;
                history.go( steps );
                $(plugin).attr('data-checkout-stage', checkoutStages[ members.currentStage ] )
            }
        };

        //
        // Initialize the checkout
        //
        members.initialize();

        return this;
    };
}( jQuery ));


module.exports = function () {
    $("#checkout-main").checkout();
};
