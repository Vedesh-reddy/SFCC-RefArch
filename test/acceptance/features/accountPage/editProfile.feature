Feature: Edit profile of a User Account
    As a shopper with an account, I want to be able to edit my profile

@accountPage
    Scenario: Shopper is able to edit their account
        Given shopper logs into the website
        And shopper clicks edit profile
        And shopper edits phone number