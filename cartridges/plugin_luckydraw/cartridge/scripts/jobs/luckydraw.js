'use strict';

/**
 * Job steps of the lucky draw. Every step is bounded by MaxItems, resumes from record state or
 * LuckyDrawJobState, can be repeated without double effects, and reports counts in its status.
 */

var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var luckyDrawHelpers = require('*/cartridge/scripts/helpers/luckyDrawHelpers');

var log = Logger.getLogger('plugin-luckydraw', 'luckydraw-job');

/**
 * @param {Object} params - job parameters
 * @param {number} fallback - default
 * @returns {number} bounded batch size
 */
function maxItems(params, fallback) {
    var value = Number(params && params.MaxItems);
    return value > 0 && value <= 10000 ? Math.floor(value) : fallback;
}

/**
 * @param {string} name - step name
 * @param {Function} fn - work returning counts
 * @returns {dw.system.Status} OK, or ERROR when the step threw or reported failures or mismatches
 */
function run(name, fn) {
    if (!luckyDrawHelpers.isLuckyDrawEnabled()) return new Status(Status.OK, 'DISABLED', 'Lucky draw disabled');
    try {
        var counts = fn() || {};
        var summary = JSON.stringify(counts);
        log.info('{0}: {1}', name, summary);
        return counts.failed > 0 || counts.mismatches > 0 ? new Status(Status.ERROR, 'ATTENTION', summary) : new Status(Status.OK, 'OK', summary);
    } catch (e) {
        log.error('{0} failed: {1}', name, e.errorCode || e.message);
        return new Status(Status.ERROR, 'ERROR', String(e.errorCode || e.message));
    }
}

exports.status = function (params) {
    return run('status', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawCampaignHelpers').advanceCampaigns(maxItems(params, 200));
    });
};

exports.entries = function (params) {
    return run('entries', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').processOrders(maxItems(params, 1000));
    });
};

exports.reconcile = function (params) {
    return run('reconcile', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawEntryHelpers').reconcileEntries(maxItems(params, 1000));
    });
};

exports.draw = function (params) {
    return run('draw', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').runDraws(maxItems(params, 1000));
    });
};

exports.verify = function (params) {
    return run('verify', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawDrawHelpers').verifyWinners(maxItems(params, 200));
    });
};

exports.rewards = function (params) {
    return run('rewards', function () {
        return require('*/cartridge/scripts/helpers/luckyDrawRewardHelpers').processRewards(maxItems(params, 200));
    });
};

exports.notifications = function (params) {
    return run('notifications', function () {
        return luckyDrawHelpers.deliverNotifications(maxItems(params, 500));
    });
};

/**
 * Removes stale locks, expired rate buckets and old request keys.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.cleanup = function (params) {
    return run('cleanup', function () {
        var limit = maxItems(params, 1000);
        var now = new Date();
        var removeWhere = function (type, query, args) {
            var records = luckyDrawHelpers.queryPage(type, query, null, args, 0, limit).items;
            records.forEach(function (r) {
                Transaction.wrap(function () { CustomObjectMgr.remove(r); });
            });
            return records.length;
        };
        return {
            locks: removeWhere('LuckyDrawLock', 'custom.expiresAt <= {0}', [new Date(now.getTime() - 3600000)]),
            buckets: removeWhere('LuckyDrawRateBucket', 'custom.expiresAt <= {0}', [now]),
            requestKeys: removeWhere('LuckyDrawRequestKey', 'custom.createdAt <= {0}', [new Date(now.getTime() - luckyDrawHelpers.getPreference('luckyDrawRequestKeyRetentionDays') * 86400000)])
        };
    });
};

/**
 * Exports new audit events as JSON lines to IMPEX for long-term retention.
 * @param {Object} params - {MaxItems}
 * @returns {dw.system.Status} status
 */
exports.auditExport = function (params) {
    return run('audit-export', function () {
        var File = require('dw/io/File');
        var FileWriter = require('dw/io/FileWriter');
        var after = luckyDrawHelpers.getJobState('audit-export').after;
        var events = luckyDrawHelpers.queryPage('LuckyDrawAuditEvent', 'custom.occurredAt > {0}', 'custom.occurredAt asc', [after ? new Date(after) : new Date(0)], 0, maxItems(params, 5000)).items;
        if (!events.length) return { exported: 0 };
        var dir = new File(File.IMPEX + '/' + luckyDrawHelpers.getImpexFolder('luckyDrawAuditExportDirectory'));
        dir.mkdirs();
        var file = new File(dir, 'audit-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Date.now() + '.jsonl');
        var writer = new FileWriter(file, 'UTF-8');
        try {
            events.forEach(function (a) {
                var c = a.custom;
                writer.write(JSON.stringify({
                    eventId: c.eventId, occurredAt: c.occurredAt.toISOString(), campaignId: c.campaignId, entityType: c.entityType, entityId: c.entityId,
                    action: c.action, actorType: c.actorType, actorRef: c.actorRef, fromStatus: c.fromStatus, toStatus: c.toStatus, reason: c.reason, detail: c.detail
                }) + '\n');
            });
        } finally {
            writer.close();
        }
        luckyDrawHelpers.saveJobState('audit-export', { after: events[events.length - 1].custom.occurredAt.toISOString() });
        return { exported: events.length, file: file.name };
    });
};
