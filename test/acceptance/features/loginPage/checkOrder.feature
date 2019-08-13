Feature: Check Order
    As a shopper, I want to be able to check an order status

@checkOrder
    Scenario: Shopper is able to check order status from home page
        Given shopper goes to the Login Page
        Then shopper is able to fill out the order number, email, and zip code
        And shopper is able to click the check status button
        And shopper is able to view order detail