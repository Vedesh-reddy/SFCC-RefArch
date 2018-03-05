# Table of Contents

- [Submitting your first Pull Request ](#submitting-your-first-Pull-request)

- [Submitting a Pull Request ](#submitting-a-Pull-request)

- [What to expect](#what-to-expect)

- [Team members](#MFRA-team-menbers)

- [Back to README](./README.md)




# Contributing to _MFRA_

The following is a set of guidelines for contributing to MFRA base cartridge. These are mostly guidelines, not rules.  But by adhering to them we hope to address your pull request in timely manner. 

## Submitting your first Pull Request

If this is your first attempt at sumbitting a pull request please follow the following steps.

	1. Create a fork of the MFRA repository 
	2. Download the forked repository
	3. Checkout the integration
	4. Apply your code fix
	5. Create a pull request (against the integration branch)


## Submitting a Pull Rquest

1. You will need to create a branch off of the integration banch.

	* It is highly recommended to rebase your branch before submitting your pull request to reduce the risk of merge confilicts.
	
	* Please reference the issue number in the comments of your pull request when applicable.(optional)
	    
	   
2. Include a breif description of the problem and solution being addressed in your pull request.
    
    * Include screen shots when applicable.(optional)
    
    * Include error logs when applicable.(optional)
    
    * Include steps to reproduce (if applicable).

3. You will need to grant MFRA team members access to your fork in order for automated test to be run on your pull request prior to merging it into our integration banch.

        ### Granting access to your forked repository
        * From within your forked repository, find the 'Settings' link( found in the left nav of the site)
        
        * Under the settings menu click on 'User and group access'.
        
        * Add the new user to the input field under the heading 'Users' with write access.
        
4. Note if there is any data that needs to be included with your code submission. 

5. Code should pass the automation process.

    * code needs to be linted
        
            npm run lint 	 
        
    * code needs to pass unit test.
    
            npm run test
    
    * code needs to pass unit/intergration test.
	    
	        npm run test:integration
	

## What to Expect

* Once your pull request has been submitted it will be looked over and considered for merging.

* As long as it has met the guidlines illustrated above it should be merged in a timely fasion.

* Our sprints generally run for two weeks, and in that period of time all pr's should be looked over and feedback given.


## MFRA team members 

To speed up the process of reviewing and merging your pull request it might make sense to proactively grant access to your fork for the following team members.

    to add the team members please allow access for the following users
    
        MFRA team - mobilefirst_ra
        Jenkins automation - sg-jenkins
