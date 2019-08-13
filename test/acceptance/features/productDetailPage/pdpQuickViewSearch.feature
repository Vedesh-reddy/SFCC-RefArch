Feature: Search for product using menu then add to cart from Quick View
    As a shopper I want to be able to search for a product from the menu
    then add the product to cart using Quick View

@quickview
    Scenario: Shopper is able to shop using a product's quick view
        When shopper selects yes or no for tracking consent
        Given shopper searches for category from menu
        And shopper opens product quick view from product display page
        And shopper selects color from Quick View
        And shopper selects size from Quick View
        Then shopper adds to cart from Quick View
