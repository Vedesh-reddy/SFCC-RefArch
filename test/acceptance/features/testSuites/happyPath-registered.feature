Feature: Follow the happy path of a registered user
    As a shopper, I want to shop for a product, log into my account, and fill out the correct
    shipping information based on previous saved user data.

@happyPath
    Scenario: Registered shopper should be able to follow the checkout flow
        When shopper selects yes or no for tracking consent
        Given Shopper searches for "Elbow Sleeve Ribbed Sweater"
        Then selects size "S"
        Then shopper changes product quantity
        Then he adds the product to cart
        Then shopper selects checkout from cart
        And shopper selects checkout as return user
        And shopper verifies shipping information
        Then shopper proceeds to payment section
        And shopper fills out registered user billing information
        Then shopper places order
        And shopper verifies the order confirmation page