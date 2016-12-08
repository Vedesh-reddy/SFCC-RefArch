# SiteGenesis Mobile-First

This is a repository for the mobile optimized version of SiteGenesis.

SiteGenesis Mobile-First has a base cartridge provided by Commerce Cloud that is never directly customized or edited. Instead, customization cartridges are layered on top of the `app_storefront_base` cartridge. This change is intended to allow for easier adoption of new features and bug fixes. It is also enables the development of plug-in features to make it quicker and easier to configure the specific features of the application.
SiteGenesis Mobile-First supplies an apple_pay plugin cartridge to demonstrate how to layer customizations for SiteGenesis.

Your feedback on the workability and limitations of this new architecture is invaluable during the developer preview. Particularly, feedback on any issues you encounter or workarounds you develop for efficiently customizing the base cartridge without editing it directly.

# Getting Started

1 Clone this repository.
2 Upload the `modules` folder to the WebDav location for cartridges for your Sandbox through CyberDuck or any other WebDAV client.
*Note:* you can't upload the modules folder through Studio. You can also upload via dwupload command :

dwupload --hostname sbox01-realm1-company.demandware.net --username admin --password "Grid is a-4letter-word!" --cartridge modules

3 Upload the `app_storefront_base` and `applepay` cartridges via Studio or use a WebDAV client to upload it to the WebDAV Cartridge location.

4 Add the `app_storefront_base` and `applepay` cartridges to your cartridge path.

5 Install npm modules for the project in the root directory of the project: `npm install'.


# NPM scripts
Use the provided NPM scripts to compile and upload changes to your Sandbox.

## Compiling your application

* `npm run compile:scss` - Compiles all scss files into css.
* `npm run compile:js` - Compiles all js files and aggregates them.
* `npm run compile:fonts` - Copies all needed font files. Usually have to be run only once.

## Linting your code

`npm run lint` - Execute linting for all JavaScript and SCSS files in the project. You should run this command before committing your code.

## Watching for changes and uploading

`npm run watch:static` - Watches js and scss files for changes, recompiles them and uploads result to the sandbox. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

`npm run watch:cartridge` - Watches all cartridge files (except for static content) and uploads it to sandbox. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

`npm run watch` - Watches everything and recompiles (if necessary) and uploads to the sandbox. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

#Testing
## Running unit tests

You can run `npm test` to execute all unit tests in the project. Run `npm test --coverage` to get coverage information. Coverage will be available in `coverage` folder under root directory.

* UNIT test code coverage : 
1.  From the mfsg repository issue command "npm run cover"
2. A report will be generated ex. Writing coverage reports at [/Users/zsardoone/Demandware/mfsg/coverage]
3. navigate to this directory on your local machien, open up the index.html file, a detailes report will be available. 

## Running integration tests
Integration tests are located in .../mfsg/test/integration

To run individual test, i.e. test1.js in storeLocator sub-suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator/test1.js`

To run tests in sub-suite, i.e. storeLocator sub-suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator`

To run tests in integration suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/*`

## Running Appium UI tests:
These tests can only be run locally with Appium and Xcode installed; currently we have not configure for Jenkins to run these tests. Ideally we would like to use sourcelabs to run these tests instead of installing Appium on Jenkin machine. However, we are still waiting for a valid sourcelabs id.
Follow this instruction to install Appium and Xcode:
[How to install Appium](https://intranet.demandware.com/confluence/display/ENG/How+to+Configure+Appium+for+MFSG)

Appium UI Tests are located at ../mfsg/test/Appium

`npm run test:appium -- --url http://sbox01-realm1-company.demandware.net/s/SiteGenesis`

Note: always use the pretty storefront url when writing and running UI tests.

## Running Functional UI tests:
`npm run test:functional -- --url http://sbox01-realm1-company.demandware.net/s/SiteGenesis --chrome`
Note: We have proof that the same tests can be applied to both Appium and Functional tests, the only time we might run into issues is when certain element is hidden on certain size of screen and visible on another size of screeen, then we will need to compile a different selector to accormodate that.