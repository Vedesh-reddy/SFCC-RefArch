# Mobile First SiteGenesis

This is a repository for mobile first version of SiteGenesis. 
To install:

1. Clone this repository.
1. Upload the `modules` folder to the WebDav location for cartridges for your Sandbox through CyberDuck or any other WebDAV client. *Note:* you can't upload the modules folder through Studio. 
1. Upload the `app_storefront_base` cartridge via Studio or use a WebDAV client to upload it to the WebDAV Cartridge location..
1. Add app_storefront_base to your cartridge path.

# NPM scripts
Use the provided NPM script to compile and upload changes to your Sandbox.
# Compilation

* `npm run compile:scss` - Compiles all scss files into css.
* `npm run compile:js` - Compiles all js files and aggregates them.
* `npm run compile:fonts` - Will copy all needed font files. Usually have to be run only once.

# lint

`npm run lint` - Execute linting for all JavaScript and SCSS files in the project. You should run this command before committing your code.

# watches

`npm run watch:static` - Watches js and scss files for changes, recompiles them and uploads result to the sandbox. Requires valid dw.json file at the root.
`npm run watch:cartridge` - Watches all cartridge files (except for static content) and uploads it to sandbox. Requires valid dw.json file at the root.
`npm run watch` - Watches everything and recompiles (if necessary) and uploads to the sandbox.

## Unit tests

You can run `npm test` to execute all unit tests in the project. Run `npm test --coverage` to get coverage information. Coverage will be available in `coverage` folder under root directory.

# Running Integration tests
Integration tests are located in .../mfsg/test/integration

to run individual test, i.e. test1.js in storeLocator sub-suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator/test1.js`

to run tests in sub-suite, i.e. storeLocator sub-suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/storeLocator`

to run tests in integration suite:
`npm run test:integration -- --baseUrl https://hostname/on/demandware.store/Sites-SiteGenesis-Site/en_US test/integration/*`