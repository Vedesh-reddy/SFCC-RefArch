Feature: Search for a product and use the product filter options to condense options
    As a shopper I want to be able to search for a product type
    And then select different filter options to reduce the number of potential
    items.

@filter
    Scenario: Shopper is able to filter for products
        When shopper selects yes or no for tracking consent
        Given shopper searches for category from menu
        And shopper filters product by color
        And shopper filters product by size
        And shopper filters product by price