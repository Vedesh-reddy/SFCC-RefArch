Feature: Create an Account
    As a shopper, I want to be able to create an account with the site

@login
Scenario: Shopper is able to create an account from the homepage
    Given shopper goes to the Login Page
        Then shopper is able to click tab to create account
        And shopper is able fill out registration information
        And shopper is able to click the create account button
        And shopper may see a username is invalid error