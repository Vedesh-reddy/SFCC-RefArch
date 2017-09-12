'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var allowedLocales;

describe('locale', function () {
    var LocaleModel = proxyquire('../../../../cartridges/app_storefront_base/cartridge/models/locale', {
        '*/cartridge/config/countries': [{
            'id': 'en_US',
            'currencyCode': 'USD'
        }, {
            'id': 'en_GB',
            'currencyCode': 'GBP'
        }, {
            'id': 'ja_JP',
            'currencyCode': 'JPY'
        }, {
            'id': 'zh_CN',
            'currencyCode': 'CNY'
        }, {
            'id': 'fr_FR',
            'currencyCode': 'EUR'
        }, {
            'id': 'it_IT',
            'currencyCode': 'EUR'
        }],
        'dw/util/Locale': {
            getLocale: function (localeID) {
                var returnValue;
                switch (localeID) {
                    case 'en_US':
                        returnValue = {
                            country: 'US',
                            displayCountry: 'United States',
                            currencyCode: 'USD',
                            displayName: 'English (US)'
                        };
                        break;
                    case 'en_GB':
                        returnValue = {
                            country: 'GB',
                            displayCountry: 'United Kingdom',
                            currencyCode: 'GBP',
                            displayName: 'English (UK)'
                        };
                        break;
                    case 'fr_FR':
                        returnValue = {
                            country: 'FR',
                            displayCountry: 'France',
                            currencyCode: 'EUR',
                            displayName: 'français'
                        };
                        break;
                    case 'it_IT':
                        returnValue = {
                            country: 'IT',
                            displayCountry: 'Italia',
                            currencyCode: 'EUR',
                            displayName: 'italiano'

                        };
                        break;
                    case 'ja_JP':
                        returnValue = {
                            country: 'JP',
                            displayCountry: '日本',
                            currencyCode: 'JPY',
                            displayName: '日本の'
                        };
                        break;
                    case 'zh_CN':
                        returnValue = {
                            country: 'CN',
                            displayCountry: '中国',
                            currencyCode: 'CNY',
                            displayName: '日本'
                        };
                        break;
                    default:
                        returnValue = null;
                }
                return returnValue;
            },
            ID: 'LocaleID'
        }
    });

    before(function () {
        allowedLocales = ['en_GB', 'fr_FR', 'ja_JP', 'zh_CN', 'default', 'it_IT'];
    });
    it('should expected locales for en_GB', function () {
        var currentLocale = {
            ID: 'en_GB',
            displayCountry: 'United Kingdom',
            country: 'GB',
            displayName: 'English (UK)'
        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);

        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'GB',
                'currencyCode': 'GBP',
                'localLinks': [
                    {
                        'country': 'JP',
                        'currencyCode': 'JPY',
                        'displayCountry': '日本',
                        'localID': 'ja_JP',
                        'displayName': '日本の'
                    }, {
                        'country': 'CN',
                        'currencyCode': 'CNY',
                        'displayCountry': '中国',
                        'localID': 'zh_CN',
                        'displayName': '日本'
                    }, {
                        'country': 'FR',
                        'currencyCode': 'EUR',
                        'displayCountry': 'France',
                        'localID': 'fr_FR',
                        'displayName': 'français'
                    }, {
                        'country': 'IT',
                        'currencyCode': 'EUR',
                        'displayCountry': 'Italia',
                        'localID': 'it_IT',
                        'displayName': 'italiano'
                    }
                ],
                'name': 'United Kingdom',
                'displayName': 'English (UK)'
            }
        });
    });


    it('should return proper fr_FR info', function () {
        var currentLocale = {
            ID: 'fr_FR',
            displayCountry: 'France',
            country: 'FR',
            displayName: 'français'
        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);
        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'FR',
                'currencyCode': 'EUR',
                'localLinks': [
                    {
                        'country': 'GB',
                        'currencyCode': 'GBP',
                        'displayCountry': 'United Kingdom',
                        'localID': 'en_GB',
                        'displayName': 'English (UK)'
                    }, {
                        'country': 'JP',
                        'currencyCode': 'JPY',
                        'displayCountry': '日本',
                        'localID': 'ja_JP',
                        'displayName': '日本の'
                    }, {
                        'country': 'CN',
                        'currencyCode': 'CNY',
                        'displayCountry': '中国',
                        'localID': 'zh_CN',
                        'displayName': '日本'
                    }, {
                        'country': 'IT',
                        'currencyCode': 'EUR',
                        'displayCountry': 'Italia',
                        'localID': 'it_IT',
                        'displayName': 'italiano'
                    }
                ],
                'name': 'France',
                'displayName': 'français'
            }
        });
    });
    it('should return proper it_IT info', function () {
        var currentLocale = {
            ID: 'it_IT',
            displayCountry: 'Italia',
            country: 'IT',
            displayName: 'italiano'
        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);
        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'IT',
                'currencyCode': 'EUR',
                'localLinks': [
                    {
                        'country': 'GB',
                        'currencyCode': 'GBP',
                        'displayCountry': 'United Kingdom',
                        'localID': 'en_GB',
                        'displayName': 'English (UK)'
                    }, {
                        'country': 'JP',
                        'currencyCode': 'JPY',
                        'displayCountry': '日本',
                        'localID': 'ja_JP',
                        'displayName': '日本の'
                    }, {
                        'country': 'CN',
                        'currencyCode': 'CNY',
                        'displayCountry': '中国',
                        'localID': 'zh_CN',
                        'displayName': '日本'
                    }, {
                        'country': 'FR',
                        'currencyCode': 'EUR',
                        'displayCountry': 'France',
                        'localID': 'fr_FR',
                        'displayName': 'français'
                    }
                ],
                'name': 'Italia',
                'displayName': 'italiano'
            }
        });
    });
    it('should return proper JA info', function () {
        var currentLocale = {
            ID: 'ja_JP',
            displayCountry: '日本',
            country: 'JA',
            displayName: '日本の'
        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);
        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'JA',
                'currencyCode': 'JPY',
                'localLinks': [
                    {
                        'country': 'GB',
                        'currencyCode': 'GBP',
                        'displayCountry': 'United Kingdom',
                        'localID': 'en_GB',
                        'displayName': 'English (UK)'
                    }, {
                        'country': 'CN',
                        'currencyCode': 'CNY',
                        'displayCountry': '中国',
                        'localID': 'zh_CN',
                        'displayName': '日本'
                    }, {
                        'country': 'FR',
                        'currencyCode': 'EUR',
                        'displayCountry': 'France',
                        'localID': 'fr_FR',
                        'displayName': 'français'
                    }, {
                        'country': 'IT',
                        'currencyCode': 'EUR',
                        'displayCountry': 'Italia',
                        'localID': 'it_IT',
                        'displayName': 'italiano'
                    }
                ],
                'name': '日本',
                'displayName': '日本の'
            }
        });
    });
    it('should return proper ZN info', function () {
        var currentLocale = {
            ID: 'zh_CN',
            displayCountry: '中国',
            country: 'CN',
            displayName: '日本'
        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);
        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'CN',
                'currencyCode': 'CNY',
                'localLinks': [
                    {
                        'country': 'GB',
                        'currencyCode': 'GBP',
                        'displayCountry': 'United Kingdom',
                        'localID': 'en_GB',
                        'displayName': 'English (UK)'
                    }, {
                        'country': 'JP',
                        'currencyCode': 'JPY',
                        'displayCountry': '日本',
                        'localID': 'ja_JP',
                        'displayName': '日本の'
                    }, {
                        'country': 'FR',
                        'currencyCode': 'EUR',
                        'displayCountry': 'France',
                        'localID': 'fr_FR',
                        'displayName': 'français'
                    }, {
                        'country': 'IT',
                        'currencyCode': 'EUR',
                        'displayCountry': 'Italia',
                        'localID': 'it_IT',
                        'displayName': 'italiano'
                    }
                ],
                'name': '中国',
                'displayName': '日本'
            }
        });
    });
    it('should return proper US info', function () {
        allowedLocales = ['en_US', 'default'];
        var currentLocale = {
            ID: 'en_US',
            displayCountry: 'United States',
            country: 'US',
            displayName: 'English (US)'

        };
        var siteId = 'MobileFirst';
        var localeModel = new LocaleModel(currentLocale, allowedLocales, siteId);
        assert.deepEqual(localeModel, {
            'locale': {
                'countryCode': 'US',
                'currencyCode': 'USD',
                'localLinks': [],
                'name': 'United States',
                'displayName': 'English (US)'
            }
        });
    });
});
