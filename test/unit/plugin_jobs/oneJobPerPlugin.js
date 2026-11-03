'use strict';

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var repo = path.resolve(__dirname, '../../..');
var metadata = path.join(repo, 'metadata');
var cartridges = path.join(repo, 'cartridges');

/**
 * @param {string} folder - metadata folder
 * @returns {string} that folder's jobs.xml
 */
function readJobs(folder) {
    return fs.readFileSync(path.join(metadata, folder, 'jobs.xml'), 'utf8');
}

/**
 * @param {string} xml - jobs.xml content
 * @param {RegExp} pattern - pattern with one capture group
 * @returns {string[]} every captured value
 */
function all(xml, pattern) {
    var found = [];
    xml.replace(pattern, function (match, value) {
        found.push(value);
        return match;
    });
    return found;
}

var folders = fs.readdirSync(metadata).filter(function (name) {
    return name !== 'retired-jobs' && fs.existsSync(path.join(metadata, name, 'jobs.xml'));
});

var stepTypes = {};
fs.readdirSync(cartridges).forEach(function (name) {
    var file = path.join(cartridges, name, 'steptypes.json');
    if (fs.existsSync(file)) {
        JSON.parse(fs.readFileSync(file, 'utf8'))['step-types']['script-module-step'].forEach(function (type) {
            stepTypes[type['@type-id']] = type;
        });
    }
});

/**
 * @param {string} module - job step module below the cartridges folder
 * @param {Object} stubs - extra module stubs
 * @returns {Object} the module with platform APIs stubbed
 */
function loadStep(module, stubs) {
    var allStubs = Object.assign({
        'dw/system/Status': function (status, code) {
            this.code = code;
        },
        'dw/system/Logger': { getLogger: function () { return { error: function () {}, info: function () {} }; } },
        'dw/system/Transaction': {},
        'dw/object/CustomObjectMgr': {}
    }, stubs);
    allStubs['dw/system/Status'].OK = 2;
    return proxyquire(path.join(cartridges, module), allStubs);
}

describe('one job per plugin', function () {
    it('has one job for each plugin', function () {
        assert.lengthOf(folders, 12);
        folders.forEach(function (folder) {
            assert.lengthOf(all(readJobs(folder), /job-id="([^"]+)"/g), 1, folder);
        });
    });

    it('gives each step a unique ID within its job', function () {
        folders.forEach(function (folder) {
            var ids = all(readJobs(folder), /step-id="([^"]+)"/g);
            assert.lengthOf(ids, new Set(ids).size, folder);
        });
    });

    it('imports with schedules off, except the two plugins that always shipped them on', function () {
        folders.filter(function (folder) { return folder !== 'custom-wishlist' && folder !== 'smart-commerce'; }).forEach(function (folder) {
            assert.notMatch(readJobs(folder), /run-recurring enabled="true"/, folder);
        });
    });

    it('stops one failing step from blocking the others, except in ordered import pipelines', function () {
        folders.filter(function (folder) { return folder !== 'chat-widget' && folder !== 'custom-wishlist'; }).forEach(function (folder) {
            all(readJobs(folder), /(<step [\s\S]*?<\/step>)/g).forEach(function (step) {
                var pipeline = /step-id="(Sync|Provision)/.test(step);
                var last = /step-id="ReportFailures"/.test(step);
                assert.include(step, pipeline || last ? '<stop-job/>' : '<continue/>', folder + ' ' + step.slice(0, 60));
            });
        });
    });

    it('ends every multi-step job with ReportFailures', function () {
        folders.filter(function (folder) { return folder !== 'chat-widget' && folder !== 'custom-wishlist'; }).forEach(function (folder) {
            var ids = all(readJobs(folder), /step-id="([^"]+)"/g);
            assert.equal(ids[ids.length - 1], 'ReportFailures', folder);
        });
    });

    it('fails the job through ReportFailures when an earlier step failed', function () {
        var Status = function (status, code) {
            this.error = status === 1;
            this.code = code;
        };
        Status.ERROR = 1;
        Status.OK = 2;
        var steps = proxyquire(path.join(cartridges, 'plugin_rentals/cartridge/scripts/jobs/jobSteps.js'), {
            'dw/system/Status': Status,
            './releaseRentalHolds': { execute: function () { return new Status(Status.ERROR, 'ERROR'); } },
            './rentalLateFees': { execute: function () { throw new Error('boom'); } }
        });
        var values = {};
        var execution = function (id) {
            return {
                getStepID: function () { return id; },
                getJobExecution: function () {
                    return {
                        getContext: function () {
                            return { get: function (key) { return values[key]; }, put: function (key, value) { values[key] = value; } };
                        }
                    };
                }
            };
        };
        assert.equal(steps.reportFailures({}, execution('ReportFailures')).code, 'OK');
        steps.releaseHolds({}, execution('ReleaseHolds'));
        assert.throws(function () { steps.lateFees({}, execution('LateFees')); });
        var report = steps.reportFailures({}, execution('ReportFailures'));
        assert.equal(report.code, 'ATTENTION');
        assert.isTrue(report.error);
        assert.equal(values.failedSteps, 'ReleaseHolds, LateFees');
    });

    it('only uses timing settings that the step type declares', function () {
        folders.forEach(function (folder) {
            all(readJobs(folder), /(<step [\s\S]*?<\/step>)/g).forEach(function (step) {
                var type = /type="([^"]+)"/.exec(step)[1];
                all(step, /<parameter name="(RunEveryMinutes|RunAtHourUTC)"/g).forEach(function (setting) {
                    var declared = stepTypes[type].parameters.parameter.map(function (p) { return p['@name']; });
                    assert.include(declared, setting, type);
                });
            });
        });
    });

    it('retires the old jobs and none of the current ones', function () {
        var retired = all(readJobs('retired-jobs'), /job-id="([^"]+)"/g);
        assert.lengthOf(retired, 49);
        folders.forEach(function (folder) {
            assert.notInclude(retired, all(readJobs(folder), /job-id="([^"]+)"/g)[0]);
        });
        assert.lengthOf(readJobs('retired-jobs').match(/mode="delete"/g), retired.length);
    });

    it('runs RunAtHourUTC steps only in their hour', function () {
        var otherHour = (new Date().getUTCHours() + 1) % 24;
        var steps = [
            loadStep('plugin_smartcommerce/cartridge/scripts/jobs/recordPriceHistory.js', {
                'dw/catalog/ProductMgr': {
                    queryAllSiteProducts: function () { return { hasNext: function () { return false; }, close: function () {} }; }
                },
                '*/cartridge/scripts/priceHistory': {}
            }),
            loadStep('plugin_loyalty/cartridge/scripts/jobs/maintainLoyalty.js', { '*/cartridge/scripts/helpers/loyaltyHelper': {} })
        ];
        steps.forEach(function (step) {
            assert.equal(step.execute({ RunAtHourUTC: otherHour }).code, 'NOT_DUE');
        });
    });
});
