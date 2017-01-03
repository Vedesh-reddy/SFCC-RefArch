'use strict';

var countries = require('~/cartridge/models/countries');

/**
 * Represents current locale information in plain object
 * @param {dw.util.Locale} currentLocale - current locale of the request
 * @constructor
 */
function Locale(currentLocale) {
    var currentCountry = !currentLocale ? countries[0]
        : countries.filter(function (country) {
            return country.countryCode === currentLocale.country;
        })[0];
    this.locale = {
        countryCode: currentCountry.countryCode,
        name: currentCountry.name[currentLocale] || currentCountry.name.en_US,
        continent: currentCountry.continent,
        availableLocales: currentCountry.locales,
        currencyCode: currentCountry.currencyCode,
        tax: currentCountry.taxation.type
    };
}

module.exports = Locale;
