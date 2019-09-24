Feature: Modify & Verify Mini Cart
    As a shopper, I want to verify selected product attributes and modify (edit quantity and remove product) mini cart

@miniCart @miniCartGuestUser
    Scenario: Shopper is able to modify mini cart, verify selected product attributes and goto Guest Checkout
        When shopper selects yes or no for tracking consent
        Then shopper is able to add a product to minicart for remove
        Then shopper is able to remove the product from minicart
        Then shopper is able to add a product to minicart for edit
        Then shopper is able to modify the quantity and verify the product in minicart
        Then shopper goes to Guest Checkout page from minicart

@miniCart @miniCartRegisteredUser
    Scenario: Shopper is able to modify mini cart, verify selected product attributes and goto Registered Checkout
        Given shopper logs into the website
        Then shopper is able to add a product to minicart for edit
        Then shopper is able to modify the quantity and verify the product in minicart
        Then shopper goes to Registered Checkout page from minicart
        Then shopper goes back to home page from Checkout page
        Then shopper is able to remove the product from minicart
        