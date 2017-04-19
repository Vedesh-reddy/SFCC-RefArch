var assert = require('chai').assert;
var request = require('request-promise');
var config = require('../it.config');
var jsonHelpers = require('../helpers/jsonUtils');

/**
 * Test case:
 * should be able to submit an order with billingForm
 */

describe('billingForm', function () {
    this.timeout(5000);

    describe('positive test', function () {
        it('should submit billing form successfully', function (done) {
            var myBillIngForm = {
                dwfrm_billing_shippingAddressUseAsBillingAddress: 'true',
                dwfrm_billing_addressFields_firstName: 'John',
                dwfrm_billing_addressFields_lastName: 'Smith',
                dwfrm_billing_addressFields_address1: '10 main St',
                dwfrm_billing_addressFields_address2: '',
                dwfrm_billing_addressFields_country: 'us',
                dwfrm_billing_addressFields_states_stateCode: 'MA',
                dwfrm_billing_addressFields_city: 'burlington',
                dwfrm_billing_addressFields_postalCode: '09876',
                dwfrm_billing_paymentMethod: 'CREDIT_CARD',
                dwfrm_billing_creditCardFields_cardType: 'Visa',
                dwfrm_billing_creditCardFields_cardNumber: '4111111111111111',
                dwfrm_billing_creditCardFields_expirationMonth: '2',
                dwfrm_billing_creditCardFields_expirationYear: '2020.0',
                dwfrm_billing_creditCardFields_securityCode: '342',
                dwfrm_billing_creditCardFields_email: 'blahblah@gmail.com',
                dwfrm_billing_creditCardFields_phone: '9786543213'
            };

            var ExpectedResBody = {
                locale: 'en_US',
                address: {
                    firstName: { value: 'John' },
                    lastName: { value: 'Smith' },
                    address1: { value: '10 main St' },
                    address2: { value: null },
                    city: { value: 'burlington' },
                    stateCode: { value: 'MA' },
                    postalCode: { value: '09876' },
                    countryCode: { value: 'us' }
                },
                shippingAddressUseAsBillingAddress: { value: true },
                paymentMethod: { value: 'CREDIT_CARD', htmlName: 'CREDIT_CARD' },
                paymentInformation: {
                    cardType: {
                        value: 'Visa',
                        htmlName: 'dwfrm_billing_creditCardFields_cardType'
                    },
                    cardNumber: {
                        value: '4111111111111111',
                        htmlName: 'dwfrm_billing_creditCardFields_cardNumber'
                    },
                    securityCode: {
                        value: '342',
                        htmlName: 'dwfrm_billing_creditCardFields_securityCode'
                    },
                    expirationMonth: {
                        value: '02',
                        htmlName: 'dwfrm_billing_creditCardFields_expirationMonth'
                    },
                    expirationYear: {
                        value: 2020,
                        htmlName: 'dwfrm_billing_creditCardFields_expirationYear'
                    }
                },
                email: { value: 'blahblah@gmail.com' },
                phone: { value: '9786543213' },
                error: true,
                cartError: true,
                fieldErrors: [],
                serverErrors: []
                /* ,redirectUrl: '/s/SiteGenesis/cart?lang=en_US' */
            };

            request.post({
                url: config.baseUrl + '/Checkout-SubmitPayment',
                form: myBillIngForm,
                rejectUnauthorized: false,
                resolveWithFullResponse: true
            }, function responseCallBack(err, httpResponse) {
                if (err) {
                    throw new Error('Checkout-SubmitPayment request failed with error: ' + err);
                }
                // This will fail without SEO urls turned on
                var bodyAsJson = JSON.parse(httpResponse.body);
                var strippedBody = jsonHelpers.deleteProperties(bodyAsJson, ['redirectUrl', 'action', 'queryString']);
                assert.equal(httpResponse.statusCode, 200, 'Expected Checkout-SubmitPayment statusCode to be 200.');
                assert.deepEqual(strippedBody, ExpectedResBody, 'Expecting actual response to be equal match expected response');
                return done();
            });
        });
    });
});
