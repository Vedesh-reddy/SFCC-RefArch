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
	
	* Please reference the issue number in the comments of yout pull request when applicable.(optional)
	    
	   
2. Include a breif description of the problem and solution being addressed in your pull request.
    
    * Include screen shots when applicable.(optional)
    
    * Include error logs when applicable.(optional)
    
    * Include steps to reproduce (if applicable).

3. At times we will ask you to grant MFRA team members access to your fork in order for automated test to be run on your pull request prior to merging it into our integration banch.(optional)

4. Note if there is any data that needs to be included with your code submission. 

5. Code should pass the automation process.

    * code needs to be linted
        
            npm run lint 	 
        
    * code needs to pass unit/intergration test.
	    
	        npm run test:integration
	

## What to Expect

* Once your pull request has been submitted it will be look over and considered for merging.

* As long as it has met the guidlines illustrated above it should be merged in a timely fasion.


## MFRA team menbers 

To speed up the process of reviewing and merging your pull request it might make sense to proactively grant access to your fork for the following team members.

    Ilya Volodin - ilyavolodin

    Alex Clark - aclark_salesforce

    Jing Wang - jingwang12

    Zi Sardone - zsardone

    Ann Diep - anndiep

    Tanveer Khan - tanveer236

    Ozzy Hussain - shussainsalesforce

    Evan Chessman - echessman

