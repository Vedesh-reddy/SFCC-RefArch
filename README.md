# Mobile First Reference Architecture

This is a repository for the Mobile First Reference Architecture reference application.

Mobile First Reference Architecture has a base cartridge (`app_storefront_base`) provided by Commerce Cloud that is never directly customized or edited. Instead, customization cartridges are layered on top of the base cartridge. This change is intended to allow for easier adoption of new features and bug fixes.
Mobile First Reference Architecture supplies an [plugin_applepay](https://bitbucket.org/demandware/plugin-applepay) plugin cartridge to demonstrate how to layer customizations for the reference application.

Your feedback on the ease-of-use and limitations of this new architecture is invaluable during the developer preview. Particularly, feedback on any issues you encounter or workarounds you develop for efficiently customizing the base cartridge without editing it directly.

# Getting Started

1 Clone this repository.

2 Run `npm install` to install all of the local dependancies

3 Run `npm run compile:js` from the command line that would compile all client-side JS files. Run `npm run compile:scss` and `npm run compile:fonts` that would do the same for css and fonts.

4 Create `dw.json` file in the root of the project:
```json
{
    "hostname": "your-sandbox-hostname.demandware.net",
    "username": "yourlogin",
    "password": "yourpwd",
    "code-version": "version_to_upload_to"
}
```

5 Run `npm run uploadCartridge` command that would upload `app_storefront_base` and `modules` cartridges to the sandbox you specified in dw.json file.

6 Use https://bitbucket.org/demandware/mobilefirstdata to zip and import site date on your sandbox.

7 Add the `app_storefront_base` cartridge to your cartridge path.

8 You should now be ready to navigate to and use your site.


# NPM scripts
Use the provided NPM scripts to compile and upload changes to your Sandbox.

## Compiling your application

* `npm run compile:scss` - Compiles all .scss files into CSS.
* `npm run compile:js` - Compiles all .js files and aggregates them.
* `npm run compile:fonts` - Copies all needed font files. Usually, this only has to be run once.

## Linting your code

`npm run lint` - Execute linting for all JavaScript and SCSS files in the project. You should run this command before committing your code.

## Watching for changes and uploading

`npm run watch` - Watches everything and recompiles (if necessary) and uploads to the sandbox. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

## Uploading

`npm run uploadCartridge` - Will upload both `app_storefront_base` and `modules` to the server. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

`npm run upload <filepath>` - Will upload a given file to the server. Requires a valid dw.json file.

#Testing
## Running unit tests

You can run `npm test` to execute all unit tests in the project. Run `npm run cover` to get coverage information. Coverage will be available in `coverage` folder under root directory.

* UNIT test code coverage:
1. Open a terminal and navigate to the root directory of the mfsg repository.
2. Enter the command: `npm run cover`.
3. Examine the report that is generated. For example: `Writing coverage reports at [/Users/yourusername/SCC/mfsg/coverage]`
3. Navigate to this directory on your local machine, open up the index.html file. This file contains a detailed report.

## Running integration tests
Integration tests are located in the `mfsg/test/integration` directory.

To run all integration tests you can use the following command:

```
npm run test:integration
```

**Note:** Please note that short form of this command will try to locate URL of your sandbox by reading `dw.json` file in the root directory of your project. If you don't have `dw.json` file, integration tests will fail.
sample dw.json file (this file needs to be in the root of your project)
{
    "hostname": "dev03-automation02-qa.demandware.net"
}

```
npm run test:integration test/integration/storeLocator
```

You can also supply URL of the sandbox on the command line:

```
npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US
```

To run individual tests, such as the `test1.js` in the `storeLocator` subsuite:

```
npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator/test1.js
```

To run tests in a subsuite, such as the storeLocator subsuite:

```
npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator
```

## Running Appium UI tests
These tests can only be run locally with Appium and Xcode installed.
Follow this instruction to install Appium and Xcode:
[How to install Appium](https://intranet.demandware.com/confluence/display/ENG/Configure+Appium+1.6.3+on+Sierra+MacOS)

Appium UI Tests are the same tests are functional tests on desktops which located at ../sitegenesis-mobile-first/test/functional

```
npm run test:functional appium -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis
```

```
npm run test:functional appium -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --suite navigation

```

```
npm run test:functional appium (use the dw.json defined in the root of the project for targeting server url)
```

```
npm run test:functional appium -- --suite navigation (run a subset of test by providing a suite name)

```

```
npm run test:appium -- --suite navigation
```

*Note: always use the pretty storefront URL when writing and running UI tests.


## Running Functional UI tests

```
npm run test:functional -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --client chrome
```

```
npm run test:functional -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --suite navigation (run a suite)
```

You can also use short-form of this command

```
npm run test:functional
```

```
npm run test:functional -- --suite navigation
```

**Note:** Please note that short form of this command will try to locate URL of your sandbox by reading `dw.json` file in the root directory of your project. If you don't have `dw.json` file, functional tests will fail.

**Note:** The same tests can be applied to both Appium and Functional tests, the only time you might run into issues is when a certain element is hidden on a certain size of screen and visible on another size of screen. In this case, you need to compile a different selector to accommodate that.

## Running UI tests via Saucelabs:

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --suite home --sauce
```

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce
```
**Note:** To run on chrome or appium only, specify with --client option, otherwise it will run on both browsers by default, for example:

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce --client chrome
```

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce --client appium
```

**Note:** To provide a name for your job, use the --name option, you can find your test results with this name from saucelabs dashboard later, for example:

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce --client chrome --name QuickViewIntegrationBranch --suite quickview
```

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce --client appium —name appiumIntegrationBranch
```

**Note:** To run both browsers with one command :

```
npm run test:functional:sauce -- --baseUrl http://sbox01-realm1-company.demandware.net/s/SiteGenesis --sauce --name quickview --suite quickview
```
**Note:** Currently the UI automation are being configured to run on Chrome and iPad Retina only.

**Note:** To see the results, please login to https://saucelabs.com/beta/dashboard/tests to find your jobs reports under dashboard.

# [Contributing to MFRA](./CONTRIBUTING.md)


