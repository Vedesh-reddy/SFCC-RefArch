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
         * Populate the Billing Address Summary View
         * @param {string} parentSelector - the top level DOM selector for a unique address summary
         * @param {Object} address - the address data
         */
        function populateAddressSummary(parentSelector, address) {
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
         * returns a formed <option /> element
         * @param {Object} shipping - the shipping object (shipment model)
         * @param {boolean} selected - current shipping is selected (for PLI)
         * @param {order} order - the Order model
         * @param {Object} [options] - options
         * @returns {Object} - the jQuery / DOMElement
         */
        function optionValueForAddress(shipping, selected, order, options) {
            var safeOptions = options || {};
            var isBilling = safeOptions.type && safeOptions.type === 'billing';
            var className = safeOptions.className || '';
            if (typeof shipping === 'string') {
                return $('<option class="' + className + '" disabled>' + shipping + '</option>');
            }
            var safeShipping = shipping || {};
            var shippingAddress = safeShipping.shippingAddress || {};
            var uuid = safeShipping.UUID ? safeShipping.UUID : 'new';
            var optionEl = $('<option class="' + className + '" />');
            optionEl.val(uuid);

            var title;

            if (!shipping) {
                title = order.resources.addNewAddress;
            } else {
                title = [];
                if (shippingAddress.firstName) {
                    title.push(shippingAddress.firstName);
                }
                if (shippingAddress.lastName) {
                    title.push(shippingAddress.lastName);
                }
                if (shippingAddress.address1) {
                    title.push(shippingAddress.address1);
                }
                if (shippingAddress.address2) {
                    title.push(shippingAddress.address2);
                }
                if (shippingAddress.city) {
                    if (shippingAddress.state) {
                        title.push(shippingAddress.city + ',');
                    } else {
                        title.push(shippingAddress.city);
                    }
                }
                if (shippingAddress.stateCode) {
                    title.push(shippingAddress.stateCode);
                }
                if (shippingAddress.postalCode) {
                    title.push(shippingAddress.postalCode);
                }
                if (!isBilling && safeShipping.selectedShippingMethod) {
                    title.push('-');
                    title.push(safeShipping.selectedShippingMethod.displayName);
                }

                if (title.length > 2) {
                    title = title.join(' ');
                } else {
                    title = order.resources.newAddress;
                }
            }
            optionEl.text(title);

            var keyMap = {
                'data-first-name': 'firstName',
                'data-last-name': 'lastName',
                'data-address1': 'address1',
                'data-address2': 'address2',
                'data-city': 'city',
                'data-state-code': 'stateCode',
                'data-postal-code': 'postalCode',
                'data-country-code': 'countryCode',
                'data-phone': 'phone'
            };
            $.each(keyMap, function (key) {
                var mappedKey = keyMap[key];

                optionEl.attr(key, shippingAddress[mappedKey] || '');
            });

            if (selected) {
                optionEl.attr('selected', true);
            }

            return optionEl;
        }

        /**
         * updates the shipping address selector within shipping forms
         * @param {Object} productLineItem - the productLineItem model
         * @param {Object} shipping - the shipping (shipment model) model
         * @param {Object} order - the order model
         * @param {Object} customer - the customer model
         */
        function updateShippingAddressSelector(productLineItem, shipping, order, customer) {
            var uuidEl = $('input[value=' + productLineItem.UUID + ']');
            var shippings = order.shipping;

            var form;
            var $shippingAddressSelector;
            var hasSelectedAddress = false;

            if (uuidEl && uuidEl.length > 0) {
                form = uuidEl[0].form;
                $shippingAddressSelector = $('.addressSelector', form);
            }

            if ($shippingAddressSelector && $shippingAddressSelector.length === 1) {
                $shippingAddressSelector.empty();
                // Add New Address option
                $shippingAddressSelector.append(optionValueForAddress(null, false, order));
                // Separator -
                $shippingAddressSelector.append(optionValueForAddress(
                    order.resources.shippingAddresses, false, order, { className: 'multi-shipping' }
                ));
                shippings.forEach(function (aShipping) {
                    var isSelected = shipping.UUID === aShipping.UUID;
                    hasSelectedAddress = hasSelectedAddress || isSelected;
                    $shippingAddressSelector.append(
                        optionValueForAddress(aShipping, isSelected, order,
                                { className: 'multi-shipping' }
                        )
                    );
                });
                if (customer.addresses && customer.addresses.length > 0) {
                    $shippingAddressSelector.append(optionValueForAddress(
                            order.resources.accountAddresses, false, order));
                    customer.addresses.forEach(function (address) {
                        $shippingAddressSelector.append(
                            optionValueForAddress({
                                UUID: 'ab_' + address.ID,
                                shippingAddress: address
                            }, false, order)
                        );
                    });
                }
            }

            if (!hasSelectedAddress) {
                // show
                $(form).addClass('hide-details');
            } else {
                $(form).removeClass('hide-details');
            }
        }

        /**
         * updates the billing address selector within billing forms
         * @param {Object} order - the order model
         * @param {Object} customer - the customer model
         */
        function updateBillingAddressSelector(order, customer) {
            var shippings = order.shipping;

            var form = $('form[name$=billing]')[0];
            var $billingAddressSelector = $('.addressSelector', form);
            var hasSelectedAddress = false;

            if ($billingAddressSelector && $billingAddressSelector.length === 1) {
                $billingAddressSelector.empty();
                // Add New Address option
                $billingAddressSelector.append(optionValueForAddress(null, false, order));
                // Separator -
                $billingAddressSelector.append(optionValueForAddress(
                    order.resources.shippingAddresses, false, order, {
                        className: 'multi-shipping',
                        type: 'billing'
                    }
                ));
                shippings.forEach(function (aShipping) {
                    var isSelected = order.billing.matchingAddressId === aShipping.UUID;
                    hasSelectedAddress = hasSelectedAddress || isSelected;
                    // Shipping Address option
                    $billingAddressSelector.append(
                        optionValueForAddress(aShipping, isSelected, order,
                                { className: 'multi-shipping', type: 'billing' }
                        )
                    );
                });
                if (customer.addresses && customer.addresses.length > 0) {
                    $billingAddressSelector.append(optionValueForAddress(
                            order.resources.accountAddresses, false, order));
                    customer.addresses.forEach(function (address) {
                        var isSelected = order.billing.matchingAddressId === address.ID;
                        hasSelectedAddress = hasSelectedAddress || isSelected;
                        // Customer Address option
                        $billingAddressSelector.append(
                            optionValueForAddress({
                                UUID: 'ab_' + address.ID,
                                shippingAddress: address
                            }, isSelected, order, { type: 'billing' })
                        );
                    });
                }
            }

            if (!hasSelectedAddress) {
                // show
                $(form).attr('data-address-mode', 'new');
            } else {
                $(form).attr('data-address-mode', 'edit');
            }
        }

        /**
         * returns address properties from a UI form
         * @param {Form} form - the Form element
         * @returns {Object} - a JSON object with all values
         */
        function getAddressFieldsFromUI(form) {
            var address = {
                firstName: $('input[name$=_firstName]', form).val(),
                lastName: $('input[name$=_lastName]', form).val(),
                address1: $('input[name$=_address1]', form).val(),
                address2: $('input[name$=_address2]', form).val(),
                city: $('input[name$=_city]', form).val(),
                postalCode: $('input[name$=_postalCode]', form).val(),
                stateCode: $('select[name$=_stateCode]', form).val(),
                countryCode: $('select[name$=_countryCode]', form).val(),
                phone: $('input[name$=_phone]', form).val()
            };
            return address;
        }

        /**
         * updates the shipping address form values within shipping forms
         * @param {Object} shipping - the shipping (shipment model) model
         */
        function updateShippingAddressFormValues(shipping) {
            if (!shipping.shippingAddress) return;

            $('input[value=' + shipping.UUID + ']').each(function (formIndex, el) {
                var form = el.form;
                if (!form) return;

                $('input[name$=_firstName]', form).val(shipping.shippingAddress.firstName);
                $('input[name$=_lastName]', form).val(shipping.shippingAddress.lastName);
                $('input[name$=_address1]', form).val(shipping.shippingAddress.address1);
                $('input[name$=_address2]', form).val(shipping.shippingAddress.address2);
                $('input[name$=_city]', form).val(shipping.shippingAddress.city);
                $('input[name$=_postalCode]', form).val(shipping.shippingAddress.postalCode);
                $('select[name$=_stateCode]', form).val(shipping.shippingAddress.stateCode);
                $('select[name$=_countryCode]', form).val(shipping.shippingAddress.countryCode);
                $('input[name$=_phone]', form).val(shipping.shippingAddress.phone);
            });
        }

        /**
         * updates the billing address form values within payment forms
         * @param {Object} order - the order model
         */
        function updateBillingAddressFormValues(order) {
            var billing = order.billing;
            if (!billing.billingAddress || !billing.billingAddress.address) return;

            var form = $('form[name=dwfrm_billing]');
            if (!form) return;

            $('input[name$=_firstName]', form).val(billing.billingAddress.address.firstName);
            $('input[name$=_lastName]', form).val(billing.billingAddress.address.lastName);
            $('input[name$=_address1]', form).val(billing.billingAddress.address.address1);
            $('input[name$=_address2]', form).val(billing.billingAddress.address.address2);
            $('input[name$=_city]', form).val(billing.billingAddress.address.city);
            $('input[name$=_postalCode]', form).val(billing.billingAddress.address.postalCode);
            $('select[name$=_stateCode]', form).val(billing.billingAddress.address.stateCode);
            $('select[name$=_countryCode]', form).val(billing.billingAddress.address.countryCode);
            $('input[name$=_phone]', form).val(billing.billingAddress.address.phone);
            $('input[name$=_email]', form).val(order.orderEmail);

            if (billing.payment && billing.payment.selectedPaymentInstruments
                    && billing.payment.selectedPaymentInstruments.length > 0) {
                var instrument = billing.payment.selectedPaymentInstruments[0];
                $('input[name$=cardNumber]', form).val(instrument.maskedCreditCardNumber);
                $('select[name$=expirationMonth]', form).val(instrument.expirationMonth);
                $('select[name$=expirationYear]', form).val(instrument.expirationYear);
                // Force security code clear
                $('input[name$=securityCode]', form).val('');
            }
        }

        /**
         * updates the shipping method radio buttons within shipping forms
         * @param {Object} shipping - the shipping (shipment model) model
         */
        function updateShippingMethods(shipping) {
            var uuidEl = $('input[value=' + shipping.UUID + ']');
            if (uuidEl && uuidEl.length > 0) {
                $.each(uuidEl, function (shipmentIndex, el) {
                    var form = el.form;
                    if (!form) return;

                    var $shippingMethodList = $('.shipping-method-list', form);

                    if ($shippingMethodList && $shippingMethodList.length > 0) {
                        $shippingMethodList.empty();

                        var shippingMethods = shipping.applicableShippingMethods;
                        var shippingMethodFormID = form.name + '_shippingAddress_shippingMethodID';
                        var selected = shipping.selectedShippingMethod || {};

                        //
                        // Create the new rows for each shipping method
                        //
                        $.each(shippingMethods, function (methodIndex, shippingMethod) {
                            var tmpl = $('#shipping-method-template').clone();
                            // set input
                            $('input', tmpl)
                                .prop('id', 'shippingMethod-' + shippingMethod.ID)
                                .prop('name', shippingMethodFormID)
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
                    }
                });
            }
        }

        /**
         * updates the order shipping summary for an order shipment model
         * @param {Object} shipping - the shipping (shipment model) model
         */
        function updateShippingSummaryInformation(shipping) {
            $('[data-shipment-summary=' + shipping.UUID + ']').each(function (i, el) {
                var $container = $(el);
                var $addressContainer = $container.find('.address-summary');
                var $shippingPhone = $container.find('.shipping-phone');
                var $methodTitle = $container.find('.shipping-method-title');
                var $methodArrivalTime = $container.find('.shipping-method-arrival-time');
                var $methodPrice = $container.find('.shipping-method-price');

                var address = shipping.shippingAddress;
                var selectedShippingMethod = shipping.selectedShippingMethod;

                populateAddressSummary($addressContainer, address);

                if (address && address.phone) {
                    $shippingPhone.text(address.phone);
                }

                if (selectedShippingMethod) {
                    $methodTitle.text(selectedShippingMethod.displayName);
                    if (selectedShippingMethod.estimatedArrivalTime) {
                        $methodArrivalTime.text(
                            '( ' + selectedShippingMethod.estimatedArrivalTime + ' )'
                        );
                    } else {
                        $methodArrivalTime.empty();
                    }
                    $methodPrice.text(selectedShippingMethod.shippingCost);
                }
            });
        }

        /**
         * updates the order product shipping summary for an order model
         * @param {Object} order - the order model
         */
        function updateOrderProductSummaryInformation(order) {
            var $productSummary = $('<div />');
            order.shipping.forEach(function (shipping) {
                shipping.productLineItems.items.forEach(function (lineItem) {
                    var pli = $('[data-product-line-item=' + lineItem.UUID + ']');
                    $productSummary.append(pli);
                });

                var address = shipping.shippingAddress || {};
                var selectedMethod = shipping.selectedShippingMethod;

                var nameLine = address.firstName ? address.firstName + ' ' : '';
                if (address.lastName) nameLine += address.lastName;

                var address1Line = address.address1;
                var address2Line = address.address2;

                var cityStZipLine = address.city ? address.city + ', ' : '';
                if (address.stateCode) cityStZipLine += address.stateCode + ' ';
                if (address.postalCode) cityStZipLine += address.postalCode;

                var phoneLine = address.phone;

                var shippingCost = selectedMethod ? selectedMethod.shippingCost : '';
                var methodNameLine = selectedMethod ? selectedMethod.displayName : '';
                var methodArrivalTime = selectedMethod && selectedMethod.estimatedArrivalTime
                        ? '( ' + selectedMethod.estimatedArrivalTime + ' )'
                        : '';

                var tmpl = $('#pli-shipping-summary-template').clone();

                if (shipping.productLineItems.items && shipping.productLineItems.items.length > 1) {
                    $('h5 > span').text(' - ' + shipping.productLineItems.items.length + ' '
                        + order.resources.items);
                } else {
                    $('h5 > span').text('');
                }
                if (shipping.shippingAddress
                        && shipping.shippingAddress.firstName
                        && shipping.shippingAddress.lastName
                        && shipping.shippingAddress.address1
                        && shipping.shippingAddress.city
                        && shipping.shippingAddress.stateCode
                        && shipping.shippingAddress.countryCode
                        && shipping.shippingAddress.phone) {
                    $('.ship-to-name', tmpl).text(nameLine);
                    $('.ship-to-address1', tmpl).text(address1Line);
                    $('.ship-to-address2', tmpl).text(address2Line);
                    $('.ship-to-city-st-zip', tmpl).text(cityStZipLine);
                    $('.ship-to-phone', tmpl).text(phoneLine);

                    if (!address2Line) {
                        $('.ship-to-address2', tmpl).hide();
                    }

                    if (!phoneLine) {
                        $('.ship-to-phone', tmpl).hide();
                    }

                    $('.ship-to-message').text('');
                } else {
                    $('.ship-to-message').text(order.resources.addressIncomplete);
                }


                if (shipping.selectedShippingMethod) {
                    $('.display-name', tmpl).text(methodNameLine);
                    $('.arrival-time', tmpl).text(methodArrivalTime);
                    $('.price', tmpl).text(shippingCost);
                }

                var $shippingSummary = $('<div class="multi-shipping" data-shipment-summary="'
                    + shipping.UUID + '" />');
                $shippingSummary.html(tmpl.html());
                $productSummary.append($shippingSummary);
            });

            $('.product-summary-block').html($productSummary.html());
        }

        /**
         * Update the read-only portion of the shipment display (per PLI)
         * @param {Object} productLineItem - the productLineItem model
         * @param {Object} shipping - the shipping (shipment model) model
         * @param {Object} order - the order model
         * @param {Object} [options] - options for updating PLI summary info
         * @param {Object} [options.keepOpen] - if true, prevent changing PLI view mode to 'view'
         */
        function updatePLIShippingSummaryInformation(productLineItem, shipping, order, options) {
            var keepOpen = options && options.keepOpen;

            var $pli = $('input[value=' + productLineItem.UUID + ']');
            var form = $pli && $pli.length > 0 ? $pli[0].form : null;

            if (!form) return;

            var $viewBlock = $('.view-address-block', form);

            var hasAddress = !!shipping.shippingAddress;
            var address = shipping.shippingAddress || {};
            var selectedMethod = shipping.selectedShippingMethod;

            var nameLine = address.firstName ? address.firstName + ' ' : '';
            if (address.lastName) nameLine += address.lastName;

            var address1Line = address.address1;
            var address2Line = address.address2;

            var cityStZipLine = address.city ? address.city + ', ' : '';
            if (address.stateCode) cityStZipLine += address.stateCode + ' ';
            if (address.postalCode) cityStZipLine += address.postalCode;

            var phoneLine = address.phone;

            var shippingCost = selectedMethod ? selectedMethod.shippingCost : '';
            var methodNameLine = selectedMethod ? selectedMethod.displayName : '';
            var methodArrivalTime = selectedMethod && selectedMethod.estimatedArrivalTime
                ? '(' + selectedMethod.estimatedArrivalTime + ')'
                : '';

            var tmpl = $('#pli-shipping-summary-template').clone();

            $('.ship-to-name', tmpl).text(nameLine);
            $('.ship-to-address1', tmpl).text(address1Line);
            $('.ship-to-address2', tmpl).text(address2Line);
            $('.ship-to-city-st-zip', tmpl).text(cityStZipLine);
            $('.ship-to-phone', tmpl).text(phoneLine);

            if (!address2Line) {
                $('.ship-to-address2', tmpl).hide();
            }

            if (!phoneLine) {
                $('.ship-to-phone', tmpl).hide();
            }

            if (shipping.selectedShippingMethod) {
                $('.display-name', tmpl).text(methodNameLine);
                $('.arrival-time', tmpl).text(methodArrivalTime);
                $('.price', tmpl).text(shippingCost);
            }

            $viewBlock.html(tmpl.html());

            if (!keepOpen) {
                if (hasAddress) {
                    $viewBlock.parents('[data-view-mode]').attr('data-view-mode', 'view');
                } else {
                    $viewBlock.parents('[data-view-mode]').attr('data-view-mode', 'enter');
                }
            }
        }

        /**
         * Update the hidden form values that associate shipping info with product line items
         * @param {Object} productLineItem - the productLineItem model
         * @param {Object} shipping - the shipping (shipment model) model
         */
        function updateProductLineItemShipmentUUIDs(productLineItem, shipping) {
            $('input[value=' + productLineItem.UUID + ']').each(function (key, pli) {
                var form = pli.form;
                $('[name=shipmentUUID]', form).val(shipping.UUID);
                $('[name=originalShipmentUUID]', form).val(shipping.UUID);
            });
        }

        /**
         * Update the shipping UI for a single shipping info (shipment model)
         * @param {Object} shipping - the shipping (shipment model) model
         * @param {Object} order - the order/basket model
         * @param {Object} customer - the customer model
         * @param {Object} [options] - options for updating PLI summary info
         * @param {Object} [options.keepOpen] - if true, prevent changing PLI view mode to 'view'
         */
        function updateShippingInformation(shipping, order, customer, options) {
            // First copy over shipmentUUIDs from response, to each PLI form
            order.shipping.forEach(function (aShipping) {
                aShipping.productLineItems.items.forEach(function (productLineItem) {
                    updateProductLineItemShipmentUUIDs(productLineItem, aShipping);
                });
            });

            // Now update shipping information, based on those associations
            updateShippingMethods(shipping);
            updateShippingAddressFormValues(shipping);
            updateShippingSummaryInformation(shipping, order);

            // And update the PLI-based summary information as well
            shipping.productLineItems.items.forEach(function (productLineItem) {
                updateShippingAddressSelector(productLineItem, shipping, order, customer);
                updatePLIShippingSummaryInformation(productLineItem, shipping, order, options);
            });
        }

        /**
         * Update the checkout state (single vs. multi-ship) via Session.privacy cache
         * @param {Object} order - checkout model to use as basis of new truth
         */
        function updateMultiShipInformation(order) {
            var $checkoutMain = $('#checkout-main');
            var $checkbox = $('[name=usingMultiShipping]');
            var $submitShippingBtn = $('button.submit-shipping');

            if (order.usingMultiShipping) {
                $checkoutMain.addClass('multi-ship');
                $checkbox.prop('checked', true);
            } else {
                $checkoutMain.removeClass('multi-ship');
                $checkbox.prop('checked', null);
                $submitShippingBtn.prop('disabled', null);
            }
        }

        /**
         * Updates the billing information in checkout, based on the supplied order model
         * @param {Object} order - checkout model to use as basis of new truth
         * @param {Object} customer - customer model to use as basis of new truth
         * @param {Object} [options] - options
         */
        function updateBillingInformation(order, customer) {
            updateBillingAddressSelector(order, customer);

            // update billing address form
            updateBillingAddressFormValues(order);

            // update billing address summary
            populateAddressSummary('.billing .address-summary',
                order.billing.billingAddress.address);

            // update billing parts of order summary
            $('.order-summary-email').text(order.orderEmail);

            if (order.billing.billingAddress.address) {
                $('.order-summary-phone').text(order.billing.billingAddress.address.phone);
            }
        }

        /**
         * Updates the payment information in checkout, based on the supplied order model
         * @param {Object} order - checkout model to use as basis of new truth
         */
        function updatePaymentInformation(order) {
            // update payment details
            var $paymentSummary = $('.payment-details');
            var htmlToAppend = '';

            if (order.billing.payment && order.billing.payment.selectedPaymentInstruments
                    && order.billing.payment.selectedPaymentInstruments.length > 0) {
                htmlToAppend += '<span>' + order.resources.cardType + ' '
                    + order.billing.payment.selectedPaymentInstruments[0].type
                    + '</span><div>'
                    + order.billing.payment.selectedPaymentInstruments[0].maskedCreditCardNumber
                    + '</div><div><span>'
                    + order.resources.cardEnding + ' '
                    + order.billing.payment.selectedPaymentInstruments[0].expirationMonth
                    + '/' + order.billing.payment.selectedPaymentInstruments[0].expirationYear
                    + '</span></div>';
            }

            $paymentSummary.empty().append(htmlToAppend);
        }

        /**
         * Update the entire Checkout UI, based on current state (order model)
         * @param {Object} order - checkout model
         * @param {Object} customer - customer model
         * @param {Object} [options] - options for updating PLI summary info
         * @param {Object} [options.keepOpen] - if true, prevent changing PLI view mode to 'view'
         */
        function updateCheckoutView(order, customer, options) {
            updateMultiShipInformation(order);
            updateTotals(order.totals);
            order.shipping.forEach(function (shipping) {
                updateShippingInformation(shipping, order, customer, options);
            });
            updateBillingInformation(order, customer, options);
            updatePaymentInformation(order, options);
            updateOrderProductSummaryInformation(order, options);
        }

//        /**
//         * Updates the shipping method in the shipping summary
//         * @param {Object} shippingMethod - the selected shipping method data
//         * @param {Array} totals - the totals data
//         */
//        function updateShippingSummary(shippingMethod, totals) {
//            $('.shipping-method-title').text(shippingMethod.displayName);
//            if (shippingMethod.estimatedArrivalTime) {
//                $('.shipping-method-arrival-time')
//                    .text('(' + shippingMethod.estimatedArrivalTime + ')');
//            } else {
//                $('.shipping-method-arrival-time').empty();
//            }
//            $('.shipping-method-price').text(totals.totalShippingCost);
//        }

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
                updateCheckoutView(data.order, data.customer);

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
                        var url = $('#checkout-main').attr('data-checkout-get-url');
                        $.ajax({
                            url: url,
                            method: 'GET',
                            success: function (data) {
                                updateCheckoutView(data.order, data.customer);
                                defer.resolve();
                            },
                            error: function () {
                                // Server error submitting form
                                defer.reject();
                            }
                        });
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
                                updateCheckoutView(data.order, data.customer);

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
                // delay for autocomplete!
                setTimeout(function () {
                    var $shippingForm = $(event.currentTarget.form);
                    var $shippingMethodList = $shippingForm.find('.shipping-method-list');
                    var urlParams = getAddressFieldsFromUI($shippingForm);
                    var shipmentUUID = $shippingForm.find('[name=shipmentUUID]').val();
                    var url = $shippingMethodList.data('actionUrl');
                    urlParams.shipmentUUID = shipmentUUID;

                    $shippingMethodList.spinner().start();
                    $.ajax({
                        url: url,
                        type: 'post',
                        dataType: 'json',
                        data: urlParams,
                        success: function (data) {
                            if (data.error) {
                                window.location.href = data.redirectUrl;
                            } else {
                                updateCheckoutView(data.order, data.customer, { keepOpen: true });

                                $shippingMethodList.spinner().stop();
                            }
                        }
                    });
                }, 300);
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
                            } else {
                                updateCheckoutView(data.order, data.customer);
                            }
                            $.spinner().stop();
                        },
                        error: function () {
                            $.spinner().stop();
                        }
                    });
                };

                //
                // Handle "Billing Same as Shipping" Checkbox
                //
                $('input[name$="_shippingAddressUseAsBillingAddress"]').on('change', function () {
                    var checked = this.checked;
                    toggleBillingForm(checked);
                });

                $('input[name="usingMultiShipping"]').on('change', function () {
                    var checked = this.checked;
                    toggleMultiShip(checked);
                });

                $('.btn-show-details').on('click', function () {
                    $(this).parents('[data-address-mode]').attr('data-address-mode', 'details');
                });

                $('.btn-hide-details').on('click', function () {
                    $(this).parents('[data-address-mode]').attr('data-address-mode', 'edit');
                });

                $('.btn-add-new').on('click', function () {
                    var $newEl = $(this).parents('form').find('.addressSelector option[value=new]');
                    $newEl.attr('selected', 'selected');
                    $newEl.parent().trigger('change');
                });

                $('.btn-show-billing-details').on('click', function () {
                    $(this).parents('[data-address-mode]').attr('data-address-mode', 'new');
                });

                $('.btn-hide-billing-details').on('click', function () {
                    $(this).parents('[data-address-mode]').attr('data-address-mode', 'shipment');
                });

                /**
                 * Does Ajax call to create a server-side shipment w/ pliUUID & URL
                 * @param {string} url - string representation of endpoint URL
                 * @param {Object} shipmentData - product line item UUID
                 * @returns {Object} - promise value for async call
                 */
                function createNewShipment(url, shipmentData) {
                    $.spinner().start();
                    return $.ajax({
                        url: url,
                        type: 'post',
                        dataType: 'json',
                        data: shipmentData
                    });
                }

                $('.payment-form .addressSelector').on('change', function () {
                    var form = $(this).parents('form')[0];
                    var selectedOption = $('option:selected', this);
                    var optionID = selectedOption[0].value;

                    if (optionID === 'new') {
                        // Show Address
                        $(form).attr('data-address-mode', 'new');
                    } else {
                        // Hide Address
                        $(form).attr('data-address-mode', 'shipment');
                    }

                    // Copy fields
                    var attrs = selectedOption.data();

                    Object.keys(attrs).forEach(function (attr) {
                        $('[name$=' + attr + ']', form).val(attrs[attr]);
                    });
                });

                $('.single-shipping .addressSelector').on('change', function () {
                    var form = $(this).parents('form')[0];
                    var selectedOption = $('option:selected', this);
                    var attrs = selectedOption.data();
                    var shipmentUUID = selectedOption[0].value;
                    var originalUUID = $('input[name=shipmentUUID]', form).val();

                    Object.keys(attrs).forEach(function (attr) {
                        $('[name$=' + attr + ']', form).val(attrs[attr]);
                    });

                    $('[name$=stateCode]', form).trigger('change');

                    if (shipmentUUID === 'new') {
                        $(form).attr('data-address-mode', 'new');
                    } else if (shipmentUUID === originalUUID) {
                        $(form).attr('data-address-mode', 'shipment');
                    } else if (shipmentUUID.indexOf('ab_') === 0) {
                        $(form).attr('data-address-mode', 'customer');
                    } else {
                        $(form).attr('data-address-mode', 'edit');
                    }
                });

                $('.product-shipping-block .addressSelector').on('change', function () {
                    var form = $(this).parents('form')[0];
                    var selectedOption = $('option:selected', this);
                    var attrs = selectedOption.data();
                    var shipmentUUID = selectedOption[0].value;
                    var originalUUID = $('input[name=shipmentUUID]', form).val();
                    var pliUUID = $('input[name=productLineItemUUID]', form).val();

                    Object.keys(attrs).forEach(function (attr) {
                        $('[name$=' + attr + ']', form).val(attrs[attr]);
                    });

                    if (shipmentUUID === 'new' && pliUUID) {
                        var createShipmentUrl = $(this).attr('data-create-shipment-url');
                        createNewShipment(createShipmentUrl, { productLineItemUUID: pliUUID })
                        .done(function (response) {
                            $.spinner().stop();
                            if (response.error) {
                                if (response.redirectUrl) {
                                    window.location.href = response.redirectUrl;
                                }
                                return;
                            }

                            updateCheckoutView(response.order, response.customer,
                                { keepOpen: true }
                            );
                            $(form).attr('data-address-mode', 'new');
                        })
                        .fail(function () {
                            $.spinner().stop();
                        });
                    } else if (shipmentUUID === originalUUID) {
                        $('select[name$=stateCode]', form).trigger('change');
                        $(form).attr('data-address-mode', 'shipment');
                    } else if (shipmentUUID.indexOf('ab_') === 0) {
                        var url = $(this).attr('data-create-shipment-url');
                        var serializedData = $(form).serialize();
                        createNewShipment(url, serializedData)
                        .done(function (response) {
                            $.spinner().stop();
                            if (response.error) {
                                if (response.redirectUrl) {
                                    window.location.href = response.redirectUrl;
                                }
                                return;
                            }

                            updateCheckoutView(response.order, response.customer,
                                { keepOpen: true }
                            );
                            $('select[name$=stateCode]', form).trigger('change');
                            $(form).attr('data-address-mode', 'customer');
                        })
                        .fail(function () {
                            $.spinner().stop();
                        });
                    } else {
                        var updatePLIShipmentUrl = $(form).attr('action');
                        var serializedAddress = $(form).serialize();
                        createNewShipment(updatePLIShipmentUrl, serializedAddress)
                        .done(function (response) {
                            $.spinner().stop();
                            if (response.error) {
                                if (response.redirectUrl) {
                                    window.location.href = response.redirectUrl;
                                }
                                return;
                            }

                            updateCheckoutView(response.order, response.customer,
                                { keepOpen: true }
                            );
                            // $('select[name$=stateCode]', form).trigger('change');
                            $(form).attr('data-address-mode', 'edit');
                        })
                        .fail(function () {
                            $.spinner().stop();
                        });
                    }
                });

                $('.product-shipping-block [data-action]').on('click', function (e) {
                    e.preventDefault();

                    var action = $(this).data('action');
                    var $rootEl = $(this).parents('[data-view-mode]');
                    var form = $(this).parents('form')[0];

                    switch (action) {
                        case 'enter':
                        case 'edit':
                        // do nothing special, just show the edit address view
                            if (action === 'enter') {
                                $(form).attr('data-address-mode', 'new');
                            } else {
                                $(form).attr('data-address-mode', 'edit');
                            }

                            $rootEl.attr('data-view-mode', 'edit');
                            break;
                        case 'cancel':
                            // Should clear out changes / restore previous state
                            $(form).attr('data-address-mode', 'edit');
                            break;
                        case 'save':
                        // Save address to checkoutAddressBook
                            var data = $(form).serialize();
                            var url = form.action;
                            $rootEl.spinner().start();
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
                                    // Update UI from response
                                    updateCheckoutView(response.order, response.customer);

                                    $rootEl.attr('data-view-mode', 'view');
                                }

                                if (response.order && response.order.shippable) {
                                    $('button.submit-shipping').attr('disabled', null);
                                } else {
                                    $('button.submit-shipping').attr('disabled', 'disabled');
                                }
                                $rootEl.spinner().stop();
                            })
                            .fail(function () {
                                // console.error('error saving address!');
                                // console.dir(err);
                                // $rootEl.attr('data-view-mode','edit');
                                $rootEl.spinner().stop();
                            });

                            // pull down applicable shipping methods
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
                    var $shippingForm = $(this).parents('form');
                    var methodID = $(':checked', this).val();
                    var shipmentUUID = $shippingForm.find('[name=shipmentUUID]').val();
                    var urlParams = getAddressFieldsFromUI($shippingForm);
                    urlParams.shipmentUUID = shipmentUUID;
                    urlParams.methodID = methodID;

                    var url = $(this).data('select-shipping-method-url');
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
                             updateCheckoutView(data.order, data.customer, { keepOpen: true });
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
