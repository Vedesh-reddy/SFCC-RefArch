'use strict';

/**
 * Seller accounts: application, e-mail verification, identity and payout account checks,
 * Business Manager decisions, members, settings and the access check of every seller page.
 *
 * The seller is always found from the signed-in customer (MarketplaceSellerMember, keyed by
 * customer number). A seller ID sent by the browser is never used to pick the account.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-approval');

var US_STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND '
    + 'OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP').split(' ');
var BUSINESS_TYPES = ['INDIVIDUAL', 'SOLE_PROPRIETOR', 'PARTNERSHIP', 'CORPORATION', 'LLC', 'NONPROFIT'];
var RESERVED_IDS = ['ADMIN', 'SYSTEM', 'MARKETPLACE', 'SELLER', 'SUPPORT', 'TEST'];
var ROLES = ['OWNER', 'MANAGER', 'CATALOG', 'FULFILLMENT', 'FINANCE', 'VIEWER'];
var TIERS = ['STANDARD', 'SILVER', 'GOLD', 'PLATINUM'];

var SELLER_FLOW = {
    DRAFT: ['PENDING_VERIFICATION', 'TERMINATED'],
    PENDING_VERIFICATION: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DRAFT', 'TERMINATED'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'TERMINATED'],
    APPROVED: ['SUSPENDED', 'TERMINATED'],
    REJECTED: ['DRAFT', 'TERMINATED'],
    SUSPENDED: ['APPROVED', 'TERMINATED'],
    TERMINATED: []
};

// Who may do what (role), and in which account status. A suspended seller keeps serving
// existing orders and seeing money owed, but cannot list.
var ALL_STATUSES = Object.keys(SELLER_FLOW);
var PERMISSIONS = {
    'profile.read': { roles: ROLES, statuses: ALL_STATUSES },
    'application.write': { roles: ['OWNER'], statuses: ['DRAFT', 'REJECTED'] },
    'settings.write': { roles: ['OWNER', 'MANAGER'], statuses: ['APPROVED', 'SUSPENDED'] },
    'catalog.read': { roles: ['OWNER', 'MANAGER', 'CATALOG', 'VIEWER'], statuses: ['APPROVED', 'SUSPENDED', 'TERMINATED'] },
    'catalog.write': { roles: ['OWNER', 'MANAGER', 'CATALOG'], statuses: ['APPROVED'] },
    'orders.read': { roles: ['OWNER', 'MANAGER', 'FULFILLMENT', 'VIEWER'], statuses: ['APPROVED', 'SUSPENDED', 'TERMINATED'] },
    'orders.write': { roles: ['OWNER', 'MANAGER', 'FULFILLMENT'], statuses: ['APPROVED', 'SUSPENDED'] },
    'finance.read': { roles: ['OWNER', 'FINANCE'], statuses: ['APPROVED', 'SUSPENDED', 'TERMINATED'] },
    'finance.write': { roles: ['OWNER'], statuses: ['APPROVED', 'SUSPENDED'] },
    'cases.read': { roles: ['OWNER', 'MANAGER', 'CATALOG', 'FULFILLMENT'], statuses: ['APPROVED', 'SUSPENDED', 'TERMINATED'] },
    'cases.write': { roles: ['OWNER', 'MANAGER', 'FULFILLMENT'], statuses: ['APPROVED', 'SUSPENDED'] },
    'notifications.read': { roles: ROLES, statuses: ALL_STATUSES }
};

var EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
var PHONE = /^\+?[0-9 ()-]{7,20}$/;

/**
 * @param {string} id - site preference ID
 * @returns {*} preference value
 */
function getPreference(id) {
    return Site.getCurrent().getCustomPreferenceValue(id);
}

/**
 * @param {string} id - enum-of-string preference ID
 * @returns {?string} selected value
 */
function getEnumPreference(id) {
    var value = getPreference(id);
    return value ? String(value.value !== undefined ? value.value : value) : null;
}

/**
 * @param {string} id - set-of-string preference ID
 * @returns {string[]} values
 */
function getListPreference(id) {
    return Array.prototype.slice.call(getPreference(id) || []).map(String);
}

/**
 * @returns {boolean} true when new applications are accepted
 */
function isRegistrationOpen() {
    return marketplaceHelpers.isMarketplaceEnabled() && getPreference('sellerRegistrationEnabled') === true && !!getPreference('sellerAgreementVersion');
}

/**
 * @param {dw.customer.Customer} customer - current customer
 * @returns {?string} customer number of a signed-in registered customer
 */
function getCustomerNo(customer) {
    return customer && customer.authenticated && customer.registered && customer.profile ? customer.profile.customerNo : null;
}

/**
 * @param {dw.customer.Customer} customer - current customer
 * @returns {?{seller: dw.object.CustomObject, member: dw.object.CustomObject}} the customer's seller account
 */
function getMembership(customer) {
    var customerNo = getCustomerNo(customer);
    var member = customerNo ? CustomObjectMgr.getCustomObject('MarketplaceSellerMember', customerNo) : null;
    if (!member || !member.custom.active) return null;
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', member.custom.sellerId);
    return seller ? { seller: seller, member: member } : null;
}

/**
 * Finds the signed-in customer's seller account and checks role and status for one permission.
 * @param {dw.customer.Customer} customer - current customer
 * @param {string} permission - key of PERMISSIONS
 * @returns {Object} {error: false, sellerId, seller, member, role, customerNo, actor}, or an error result
 */
function getSellerContext(customer, permission) {
    if (!marketplaceHelpers.isMarketplaceEnabled()) return marketplaceHelpers.errorResult('disabled');
    var customerNo = getCustomerNo(customer);
    if (!customerNo) return marketplaceHelpers.errorResult('unauthenticated');
    var membership = getMembership(customer);
    if (!membership) {
        var result = marketplaceHelpers.errorResult('forbidden');
        result.notSeller = true;
        return result;
    }
    var rule = PERMISSIONS[permission];
    var role = membership.member.custom.role;
    if (!rule || rule.roles.indexOf(role) < 0 || rule.statuses.indexOf(membership.seller.custom.status) < 0) return marketplaceHelpers.errorResult('forbidden');
    return {
        error: false,
        sellerId: membership.seller.custom.sellerId,
        seller: membership.seller,
        member: membership.member,
        role: role,
        customerNo: customerNo,
        actor: marketplaceHelpers.actor('SELLER', customerNo)
    };
}

/**
 * @param {dw.customer.Customer} customer - current customer
 * @returns {Object} permission => boolean, to show or hide navigation
 */
function getPermissions(customer) {
    var result = {};
    Object.keys(PERMISSIONS).forEach(function (permission) {
        result[permission] = !getSellerContext(customer, permission).error;
    });
    return result;
}

/**
 * @param {dw.object.CustomObject} seller - seller record
 * @returns {Object} view for the seller portal and API (no hashes or provider references)
 */
function getSellerView(seller) {
    var c = seller.custom;
    return {
        sellerId: c.sellerId,
        status: c.status,
        statusReason: c.statusReason || null,
        displayName: c.displayName,
        legalName: c.legalName,
        businessType: c.businessType,
        registrationNumber: c.registrationNumber,
        taxIdLast4: c.taxIdLast4,
        address: marketplaceHelpers.parseJson(c.address, {}),
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        website: c.website || null,
        categories: c.categories ? Array.prototype.slice.call(c.categories) : [],
        emailVerified: !!c.emailVerified,
        agreementVersion: c.agreementVersion,
        kycStatus: c.kycStatus,
        bankStatus: c.bankStatus,
        payoutAccountLast4: c.payoutAccountLast4 || null,
        tier: c.tier,
        settings: marketplaceHelpers.parseJson(c.settings, {}),
        rating: c.ratingCount > 0 ? Math.round((c.ratingSum / c.ratingCount) * 10) / 10 : null,
        ratingCount: c.ratingCount || 0,
        revision: c.revision || 0,
        submittedAt: c.submittedAt || null,
        decidedAt: c.decidedAt || null
    };
}

/**
 * @param {dw.object.CustomObject} seller - seller
 * @returns {Object} the data a provider needs; never the tax ID
 */
function getProviderData(seller) {
    var c = seller.custom;
    return { sellerId: c.sellerId, legalName: c.legalName, businessType: c.businessType, registrationNumber: c.registrationNumber, address: marketplaceHelpers.parseJson(c.address, {}), contactEmail: c.contactEmail };
}

/**
 * Checks the application fields. With `partial`, only fields that are present are checked.
 * @param {Object} data - untrusted fields; address as {line1, line2, city, stateCode, postalCode}
 * @param {boolean} partial - true when saving changes
 * @returns {{value: Object, invalid: Object}} clean values and field problems
 */
function checkApplication(data, partial) {
    var value = {};
    var invalid = {};
    var text = function (name, min, max, pattern) {
        var v = marketplaceHelpers.cleanText(data[name]);
        if (!v) {
            if (!partial && min > 0) invalid[name] = 'required';
            return;
        }
        if (v.length < min || v.length > max || /[\r\n]/.test(v) || (pattern && !pattern.test(v))) {
            invalid[name] = 'invalid';
            return;
        }
        value[name] = v;
    };
    text('displayName', 2, 80);
    text('legalName', 2, 120);
    text('registrationNumber', 2, 40, /^[A-Za-z0-9 ./-]+$/);
    text('taxId', 9, 11, /^\d{3}-?\d{2}-?\d{4}$|^\d{2}-?\d{7}$/);
    text('contactName', 2, 80);
    text('contactPhone', 7, 20, PHONE);
    text('website', 0, 200, /^https:\/\/[A-Za-z0-9.-]+(\/[^\s]*)?$/);
    var email = marketplaceHelpers.cleanText(data.contactEmail).toLowerCase();
    if (email) {
        if (EMAIL.test(email)) value.contactEmail = email;
        else invalid.contactEmail = 'invalid';
    } else if (!partial) {
        invalid.contactEmail = 'required';
    }
    var type = marketplaceHelpers.cleanText(data.businessType).toUpperCase();
    if (type) {
        if (BUSINESS_TYPES.indexOf(type) >= 0) value.businessType = type;
        else invalid.businessType = 'invalid';
    } else if (!partial) {
        invalid.businessType = 'required';
    }
    if (data.address) {
        var a = data.address;
        var address = {
            line1: marketplaceHelpers.cleanText(a.line1),
            line2: marketplaceHelpers.cleanText(a.line2),
            city: marketplaceHelpers.cleanText(a.city),
            stateCode: marketplaceHelpers.cleanText(a.stateCode).toUpperCase(),
            postalCode: marketplaceHelpers.cleanText(a.postalCode),
            countryCode: 'US'
        };
        if (address.line1.length < 3 || address.line1.length > 120 || address.line2.length > 120 || address.city.length < 2 || address.city.length > 60
            || US_STATES.indexOf(address.stateCode) < 0 || !/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
            invalid.address = 'invalid';
        } else {
            value.address = address;
        }
    } else if (!partial) {
        invalid.address = 'required';
    }
    if (data.categories !== undefined) {
        var categories = (Array.isArray(data.categories) ? data.categories : String(data.categories).split(','))
            .map(marketplaceHelpers.cleanText).filter(Boolean);
        if (categories.length > 10 || categories.some(function (c) { return c.length > 60; })) invalid.categories = 'invalid';
        else value.categories = categories;
    }
    return { value: value, invalid: invalid };
}

/**
 * @param {string} taxId - entered tax ID
 * @returns {{last4: string, hash: ?string}} what is kept of it: last four digits and a keyed hash
 */
function protectTaxId(taxId) {
    var digits = String(taxId).replace(/\D/g, '');
    return { last4: digits.slice(-4), hash: marketplaceHelpers.hmac('plugin-seller.hmac', 'taxid:' + digits) };
}

/**
 * Applications sharing a tax ID with another live seller get a case; the applicant is not
 * told, so the check cannot be used to probe other sellers. Inside a transaction.
 * @param {string} sellerId - seller
 * @param {string} taxIdHash - keyed hash
 */
function flagDuplicateTaxId(sellerId, taxIdHash) {
    var others = marketplaceHelpers.queryPage('MarketplaceSeller', 'custom.taxIdHash = {0} AND custom.sellerId != {1}', null, [taxIdHash, sellerId], 0, 5).items;
    var duplicate = others.filter(function (other) { return ['REJECTED', 'TERMINATED'].indexOf(other.custom.status) < 0; })[0];
    if (duplicate) {
        require('*/cartridge/scripts/helpers/caseHelpers').openCase({
            caseType: 'DUPLICATE_SELLER', sellerId: sellerId, entityId: sellerId, severity: 'HIGH',
            detail: { matchingSellerId: duplicate.custom.sellerId }, dedupeKey: 'dup-seller:' + sellerId
        });
    }
}

/**
 * Starts a seller application for the signed-in customer.
 * @param {dw.customer.Customer} customer - current customer
 * @param {Object} data - application fields plus sellerId, agreementAccepted, agreementVersion
 * @returns {Object} result with sellerView
 */
function applyAsSeller(customer, data) {
    if (!isRegistrationOpen()) return marketplaceHelpers.errorResult('disabled');
    var customerNo = getCustomerNo(customer);
    if (!customerNo) return marketplaceHelpers.errorResult('unauthenticated');
    var check = checkApplication(data || {}, false);
    var invalid = check.invalid;
    var sellerId = marketplaceHelpers.cleanText(data.sellerId).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(sellerId)) invalid.sellerId = 'invalid';
    else if (RESERVED_IDS.indexOf(sellerId) >= 0) invalid.sellerId = 'reserved';
    if ([true, 'true', 'on'].indexOf(data.agreementAccepted) < 0) invalid.agreementAccepted = 'required';
    if (String(data.agreementVersion) !== getPreference('sellerAgreementVersion')) invalid.agreementVersion = 'outdated';
    if (CustomObjectMgr.getCustomObject('MarketplaceSeller', sellerId)) invalid.sellerId = 'taken';
    if (Object.keys(invalid).length) return marketplaceHelpers.errorResult('invalid', invalid);
    if (CustomObjectMgr.getCustomObject('MarketplaceSellerMember', customerNo)) return marketplaceHelpers.errorResult('conflict');
    if (!marketplaceHelpers.checkRateLimit('seller-apply', customerNo, 5, 86400)) return marketplaceHelpers.errorResult('rate-limited');
    var tax = protectTaxId(check.value.taxId);
    if (!tax.hash) return marketplaceHelpers.errorResult('unavailable');
    var v = check.value;
    var seller;
    try {
        Transaction.wrap(function () {
            var now = new Date();
            seller = CustomObjectMgr.createCustomObject('MarketplaceSeller', sellerId);
            var c = seller.custom;
            c.status = 'DRAFT';
            c.displayName = v.displayName;
            c.legalName = v.legalName;
            c.businessType = v.businessType;
            c.registrationNumber = v.registrationNumber;
            c.taxIdLast4 = tax.last4;
            c.taxIdHash = tax.hash;
            c.address = JSON.stringify(v.address);
            c.contactName = v.contactName;
            c.contactEmail = v.contactEmail;
            c.contactPhone = v.contactPhone;
            c.website = v.website || null;
            c.categories = v.categories || [];
            c.emailVerified = false;
            c.agreementVersion = getPreference('sellerAgreementVersion');
            c.agreementAcceptedAt = now;
            c.kycStatus = 'NOT_STARTED';
            c.bankStatus = 'NOT_STARTED';
            c.tier = 'STANDARD';
            c.ratingSum = 0;
            c.ratingCount = 0;
            c.ownerCustomerNo = customerNo;
            c.revision = 0;
            c.createdAt = now;
            var member = CustomObjectMgr.createCustomObject('MarketplaceSellerMember', customerNo);
            member.custom.sellerId = sellerId;
            member.custom.role = 'OWNER';
            member.custom.active = true;
            member.custom.addedAt = now;
            marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'APPLY', actor: marketplaceHelpers.actor('SELLER', customerNo), to: 'DRAFT' });
            flagDuplicateTaxId(sellerId, tax.hash);
        });
    } catch (e) {
        // A parallel request took the same seller code or membership first.
        return marketplaceHelpers.errorResult('conflict');
    }
    log.info('Seller application {0} started', sellerId);
    return { error: false, sellerView: getSellerView(seller) };
}

/**
 * @param {Object} context - seller context (application.write)
 * @param {Object} data - changed fields
 * @param {?number} revision - revision the form was rendered from
 * @returns {Object} result with sellerView
 */
function updateApplication(context, data, revision) {
    var check = checkApplication(data || {}, true);
    if (Object.keys(check.invalid).length) return marketplaceHelpers.errorResult('invalid', check.invalid);
    var c = context.seller.custom;
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    var v = check.value;
    var tax = v.taxId ? protectTaxId(v.taxId) : null;
    if (tax && !tax.hash) return marketplaceHelpers.errorResult('unavailable');
    Transaction.wrap(function () {
        ['displayName', 'legalName', 'businessType', 'registrationNumber', 'contactName', 'contactPhone', 'website', 'categories'].forEach(function (name) {
            if (v[name] !== undefined) c[name] = v[name];
        });
        if (v.address) c.address = JSON.stringify(v.address);
        if (tax) {
            c.taxIdLast4 = tax.last4;
            c.taxIdHash = tax.hash;
            flagDuplicateTaxId(context.sellerId, tax.hash);
        }
        if (v.contactEmail && v.contactEmail !== c.contactEmail) {
            c.contactEmail = v.contactEmail;
            c.emailVerified = false;
            c.emailVerifiedAt = null;
        }
        if (c.status === 'REJECTED') c.status = 'DRAFT';
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: context.sellerId, sellerId: context.sellerId, action: 'UPDATE_APPLICATION', actor: context.actor, detail: { fields: Object.keys(v).join(',') } });
    });
    return { error: false, sellerView: getSellerView(context.seller) };
}

/**
 * E-mails a one-time code to the seller's contact address. Only a keyed hash of the code is
 * stored, bound to this session; resends are limited.
 * @param {Object} context - seller context (application.write)
 * @param {string} sessionRef - session ID
 * @returns {Object} result
 */
function sendVerificationCode(context, sessionRef) {
    var c = context.seller.custom;
    if (c.emailVerified) return marketplaceHelpers.errorResult('conflict');
    var from = getPreference('sellerFromEmail');
    if (!from) return marketplaceHelpers.errorResult('unavailable');
    var key = 'seller-email:' + context.sellerId;
    var record = CustomObjectMgr.getCustomObject('MarketplaceOtp', key);
    var cooldown = getPreference('sellerOtpResendCooldownSeconds') * 1000;
    if (record && record.custom.lastSentAt && Date.now() - record.custom.lastSentAt.getTime() < cooldown) return marketplaceHelpers.errorResult('rate-limited');
    if (!marketplaceHelpers.checkRateLimit('otp-send', key, getPreference('sellerOtpMaxSendsPerHour'), 3600)) return marketplaceHelpers.errorResult('rate-limited');
    var SecureRandom = require('dw/crypto/SecureRandom');
    var random = new SecureRandom();
    var code = '';
    for (var i = 0; i < getPreference('sellerOtpLength'); i++) code += String(random.nextInt(10));
    var salt = marketplaceHelpers.randomHex(16);
    var codeHash = marketplaceHelpers.hmac('plugin-seller.hmac', salt + ':' + code);
    if (!codeHash) return marketplaceHelpers.errorResult('unavailable');
    Transaction.wrap(function () {
        var otp = record || CustomObjectMgr.createCustomObject('MarketplaceOtp', key);
        otp.custom.codeHash = codeHash;
        otp.custom.salt = salt;
        otp.custom.sessionHash = marketplaceHelpers.sha256(sessionRef);
        otp.custom.expiresAt = new Date(Date.now() + getPreference('sellerOtpTtlMinutes') * 60000);
        otp.custom.attempts = 0;
        otp.custom.lastSentAt = new Date();
        otp.custom.consumedAt = null;
    });
    require('*/cartridge/scripts/helpers/emailHelpers').sendEmail({
        to: c.contactEmail,
        from: from,
        subject: Resource.msg('email.code.subject', 'seller', null)
    }, 'seller/email/verification-code', { code: code, displayName: c.displayName, minutes: String(getPreference('sellerOtpTtlMinutes')) });
    return { error: false };
}

/**
 * @param {Object} context - seller context (application.write)
 * @param {string} code - entered code
 * @param {string} sessionRef - session ID
 * @returns {Object} result; errorCode code-invalid | code-expired | code-locked | code-missing
 */
function verifyEmailCode(context, code, sessionRef) {
    var record = CustomObjectMgr.getCustomObject('MarketplaceOtp', 'seller-email:' + context.sellerId);
    if (!record || record.custom.consumedAt) return marketplaceHelpers.errorResult('code-missing');
    var maxAttempts = getPreference('sellerOtpMaxAttempts');
    var outcome = 'code-invalid';
    Transaction.wrap(function () {
        var o = record.custom;
        if (o.attempts >= maxAttempts) {
            outcome = 'code-locked';
        } else if (o.expiresAt.getTime() < Date.now()) {
            outcome = 'code-expired';
        } else {
            o.attempts += 1;
            var matches = /^\d{6,8}$/.test(String(code || ''))
                && marketplaceHelpers.safeEquals(o.codeHash, marketplaceHelpers.hmac('plugin-seller.hmac', o.salt + ':' + code))
                && marketplaceHelpers.safeEquals(o.sessionHash, marketplaceHelpers.sha256(sessionRef));
            if (matches) {
                o.consumedAt = new Date();
                outcome = 'ok';
                context.seller.custom.emailVerified = true;
                context.seller.custom.emailVerifiedAt = new Date();
                marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: context.sellerId, sellerId: context.sellerId, action: 'EMAIL_VERIFIED', actor: context.actor });
            } else if (o.attempts >= maxAttempts) {
                outcome = 'code-locked';
            }
        }
    });
    return outcome === 'ok' ? { error: false } : marketplaceHelpers.errorResult(outcome);
}

/**
 * Calls a provider hook implemented by an integration cartridge (identity check, payout
 * account, payout, document scan). MANUAL / NONE modes need no hook.
 * @param {string} name - kyc | bank | payout | scan
 * @param {Array} args - hook arguments
 * @returns {{status: string, reference: ?string, redirectUrl: ?string}} MANUAL | UNSCANNED | provider status | ERROR
 */
function callProvider(name, args) {
    var HookMgr = require('dw/system/HookMgr');
    var setup = {
        kyc: { preference: 'sellerKycProvider', hook: 'app.plugin.seller.kyc', fn: 'start', statuses: ['SUBMITTED', 'REDIRECT'] },
        bank: { preference: 'sellerBankVerificationProvider', hook: 'app.plugin.seller.bank', fn: 'start', statuses: ['REDIRECT'] },
        payout: { preference: 'sellerPayoutProvider', hook: 'app.plugin.seller.payout', fn: 'request', statuses: ['SUBMITTED', 'FAILED'] },
        scan: { preference: 'sellerDocumentScanProvider', hook: 'app.plugin.seller.scan', fn: 'submit', statuses: ['PENDING', 'CLEAN', 'INFECTED'] }
    }[name];
    var failed = { status: 'ERROR', reference: null, redirectUrl: null };
    var mode = getEnumPreference(setup.preference);
    if (mode === 'MANUAL') return { status: 'MANUAL', reference: null, redirectUrl: null };
    if (mode === 'NONE' || !mode) return { status: name === 'scan' ? 'UNSCANNED' : 'MANUAL', reference: null, redirectUrl: null };
    var integrationLog = Logger.getLogger('plugin-seller', 'seller-integration');
    if (!HookMgr.hasHook(setup.hook)) {
        integrationLog.error('Provider {0} is EXTERNAL but hook {1} is not registered', name, setup.hook);
        return failed;
    }
    try {
        var answer = HookMgr.callHook.apply(HookMgr, [setup.hook, setup.fn].concat(args)) || {};
        var status = String(answer.status || '');
        var reference = answer.reference ? String(answer.reference).slice(0, 128) : null;
        var redirectUrl = answer.redirectUrl ? String(answer.redirectUrl) : null;
        if (setup.statuses.indexOf(status) < 0 || (status !== 'FAILED' && !reference) || (redirectUrl && !/^https:\/\//.test(redirectUrl))) {
            integrationLog.error('Provider {0} returned an unexpected answer ({1})', name, status || 'empty');
            return failed;
        }
        return { status: status, reference: reference, redirectUrl: redirectUrl };
    } catch (e) {
        integrationLog.error('Provider {0} failed: {1}', name, e.message);
        return failed;
    }
}

/**
 * Inside a transaction: prepares an approved seller for selling.
 * @param {dw.object.CustomObject} seller - seller being approved
 */
function activateSeller(seller) {
    if (!seller.custom.inventoryListId) seller.custom.inventoryListId = getPreference('sellerInventoryListPrefix') + String(seller.custom.sellerId).toLowerCase();
    seller.custom.catalogDirty = true;
    seller.custom.decidedAt = new Date();
}

/**
 * Submits a complete DRAFT application for verification and starts the identity check.
 * @param {Object} context - seller context (application.write)
 * @returns {Object} result with status and an optional provider redirectUrl
 */
function submitApplication(context) {
    var c = context.seller.custom;
    if (c.status !== 'DRAFT') return marketplaceHelpers.errorResult('not-allowed-now');
    var problems = require('*/cartridge/scripts/helpers/sellerDocumentHelpers').getApplicationProblems(context.sellerId);
    if (!c.emailVerified) problems.unshift('email-not-verified');
    if (c.agreementVersion !== getPreference('sellerAgreementVersion')) problems.unshift('agreement-outdated');
    if (problems.length) {
        var result = marketplaceHelpers.errorResult('incomplete');
        result.problems = problems;
        return result;
    }
    Transaction.wrap(function () {
        c.status = 'PENDING_VERIFICATION';
        c.kycStatus = 'PENDING';
        c.submittedAt = new Date();
        c.statusReason = null;
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: context.sellerId, sellerId: context.sellerId, action: 'SUBMIT_APPLICATION', actor: context.actor, from: 'DRAFT', to: 'PENDING_VERIFICATION' });
        marketplaceHelpers.notify(context.sellerId, 'APPLICATION_SUBMITTED', {});
        marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_SELLER_PENDING', { sellerId: context.sellerId });
    });
    var answer = callProvider('kyc', [getProviderData(context.seller)]);
    var kycStatus = { MANUAL: 'MANUAL_REVIEW', SUBMITTED: 'PENDING', REDIRECT: 'PENDING' }[answer.status] || 'ERROR';
    Transaction.wrap(function () {
        c.kycStatus = kycStatus;
        c.kycReference = answer.reference;
        if (kycStatus === 'ERROR') {
            require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'INTEGRATION_FAILURE', sellerId: context.sellerId, entityId: context.sellerId, severity: 'MEDIUM', detail: { provider: 'kyc' }, dedupeKey: 'kyc-error:' + context.sellerId });
        }
    });
    return { error: false, status: c.status, redirectUrl: answer.status === 'REDIRECT' ? answer.redirectUrl : null };
}

/**
 * Applies an identity check result from the provider webhook or a reviewer.
 * @param {string} sellerId - seller
 * @param {string} outcome - VERIFIED | REJECTED | REVIEW
 * @param {?string} reference - provider reference, checked against the stored one
 * @param {Object} by - provider or admin actor
 * @returns {Object} result with status
 */
function recordIdentityResult(sellerId, outcome, reference, by) {
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!seller) return marketplaceHelpers.errorResult('not-found');
    var c = seller.custom;
    if (by.type === 'PROVIDER' && (!c.kycReference || c.kycReference !== reference)) return marketplaceHelpers.errorResult('conflict');
    if (['VERIFIED', 'REJECTED', 'REVIEW'].indexOf(outcome) < 0) return marketplaceHelpers.errorResult('invalid', { result: 'invalid' });
    if (c.status !== 'PENDING_VERIFICATION') return { error: false, status: c.status };
    Transaction.wrap(function () {
        if (outcome === 'VERIFIED') {
            c.kycStatus = 'VERIFIED';
            var to = getPreference('sellerApprovalRequired') === false && !require('*/cartridge/scripts/helpers/sellerDocumentHelpers').getApprovalProblems(sellerId).length ? 'APPROVED' : 'PENDING_APPROVAL';
            c.status = to;
            if (to === 'APPROVED') activateSeller(seller);
            marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'VERIFIED', actor: by, from: 'PENDING_VERIFICATION', to: to });
            marketplaceHelpers.notify(sellerId, to === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_VERIFIED', {});
        } else if (outcome === 'REJECTED') {
            c.kycStatus = 'REJECTED';
            c.status = 'REJECTED';
            c.statusReason = 'verification-failed';
            c.decidedAt = new Date();
            marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'VERIFICATION_REJECTED', actor: by, from: 'PENDING_VERIFICATION', to: 'REJECTED' });
            marketplaceHelpers.notify(sellerId, 'APPLICATION_REJECTED', {});
        } else {
            c.kycStatus = 'REVIEW';
            marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'VERIFICATION_REVIEW', actor: by });
        }
        c.revision = (c.revision || 0) + 1;
    });
    return { error: false, status: c.status };
}

var DECISIONS = {
    approve: { from: ['PENDING_VERIFICATION', 'PENDING_APPROVAL'], to: 'APPROVED', notice: 'APPLICATION_APPROVED' },
    reject: { from: ['PENDING_VERIFICATION', 'PENDING_APPROVAL'], to: 'REJECTED', notice: 'APPLICATION_REJECTED', reason: true },
    requestChanges: { from: ['PENDING_VERIFICATION', 'PENDING_APPROVAL'], to: 'DRAFT', notice: 'APPLICATION_RETURNED', reason: true },
    suspend: { from: ['APPROVED'], to: 'SUSPENDED', notice: 'SELLER_SUSPENDED', reason: true },
    reactivate: { from: ['SUSPENDED'], to: 'APPROVED', notice: 'SELLER_REACTIVATED' },
    terminate: { from: ['DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED'], to: 'TERMINATED', notice: 'SELLER_TERMINATED', reason: true }
};

/**
 * Business Manager decision on a seller account.
 * @param {string} sellerId - seller
 * @param {string} action - key of DECISIONS
 * @param {string} reason - reason (required except approve and reactivate)
 * @param {?number} revision - revision the page showed
 * @param {Object} by - admin actor
 * @returns {Object} result with sellerView
 */
function decideSeller(sellerId, action, reason, revision, by) {
    var rule = DECISIONS[action];
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!rule) return marketplaceHelpers.errorResult('invalid', { action: 'invalid' });
    if (!seller) return marketplaceHelpers.errorResult('not-found');
    var c = seller.custom;
    var text = marketplaceHelpers.cleanText(reason).slice(0, 1000);
    if (rule.reason && text.length < 3) return marketplaceHelpers.errorResult('invalid', { reason: 'required' });
    var from = c.status;
    if (rule.from.indexOf(from) < 0 || !marketplaceHelpers.canMove(SELLER_FLOW, from, rule.to)) return marketplaceHelpers.errorResult('not-allowed-now');
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    if (action === 'approve') {
        var problems = require('*/cartridge/scripts/helpers/sellerDocumentHelpers').getApprovalProblems(sellerId);
        if (!c.emailVerified) problems.push('email-not-verified');
        if (from === 'PENDING_VERIFICATION' && getEnumPreference('sellerKycProvider') !== 'MANUAL') problems.push('verification-pending');
        if (problems.length) {
            var blocked = marketplaceHelpers.errorResult('incomplete');
            blocked.problems = problems;
            return blocked;
        }
    }
    Transaction.wrap(function () {
        c.status = rule.to;
        c.statusReason = text || null;
        c.decidedBy = by.ref;
        c.decidedAt = new Date();
        if (action === 'approve' && from === 'PENDING_VERIFICATION') c.kycStatus = 'VERIFIED_MANUAL';
        if (action === 'suspend' || action === 'terminate') c.catalogDirty = true;
        if (rule.to === 'APPROVED') activateSeller(seller);
        if (action === 'terminate') {
            // Members lose access; the owner keeps it to read settlement statements.
            marketplaceHelpers.queryPage('MarketplaceSellerMember', 'custom.sellerId = {0} AND custom.active = {1}', null, [sellerId, true], 0, 500).items.forEach(function (member) {
                if (member.custom.role !== 'OWNER') member.custom.active = false;
            });
        }
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: action.toUpperCase(), actor: by, from: from, to: rule.to, reason: text });
        marketplaceHelpers.notify(sellerId, rule.notice, {});
    });
    log.info('Seller {0} moved {1} -> {2} by {3}', sellerId, from, rule.to, by.ref);
    return { error: false, sellerView: getSellerView(seller) };
}

/**
 * Inside a transaction: suspends an approved seller automatically (expired documents,
 * performance breach) when the merchant enabled that.
 * @param {dw.object.CustomObject} seller - seller
 * @param {string} reason - reason code
 * @param {Object} by - system actor
 */
function suspendSeller(seller, reason, by) {
    var c = seller.custom;
    if (c.status !== 'APPROVED') return;
    c.status = 'SUSPENDED';
    c.statusReason = reason;
    c.catalogDirty = true;
    c.revision = (c.revision || 0) + 1;
    marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: c.sellerId, sellerId: c.sellerId, action: 'SUSPEND', actor: by, from: 'APPROVED', to: 'SUSPENDED', reason: reason });
    marketplaceHelpers.notify(c.sellerId, 'SELLER_SUSPENDED', {});
}

/**
 * Business Manager: gives an existing customer a role at a seller, or removes access.
 * @param {string} sellerId - seller
 * @param {string} customerNo - customer
 * @param {string} role - role, or REMOVE
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function setMember(sellerId, customerNo, role, by) {
    if (!CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId))) return marketplaceHelpers.errorResult('not-found');
    var member = CustomObjectMgr.getCustomObject('MarketplaceSellerMember', String(customerNo));
    if (role === 'REMOVE') {
        if (!member || member.custom.sellerId !== sellerId) return marketplaceHelpers.errorResult('not-found');
        if (member.custom.role === 'OWNER') return marketplaceHelpers.errorResult('invalid', { customerNo: 'owner' });
        Transaction.wrap(function () {
            member.custom.active = false;
            marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'MEMBER_REMOVED', actor: by });
        });
        return { error: false };
    }
    if (ROLES.indexOf(role) < 0 || role === 'OWNER') return marketplaceHelpers.errorResult('invalid', { role: 'invalid' });
    if (!require('dw/customer/CustomerMgr').getCustomerByCustomerNumber(String(customerNo))) return marketplaceHelpers.errorResult('invalid', { customerNo: 'unknown' });
    if (member && member.custom.sellerId !== sellerId) return marketplaceHelpers.errorResult('conflict');
    Transaction.wrap(function () {
        var record = member || CustomObjectMgr.createCustomObject('MarketplaceSellerMember', String(customerNo));
        record.custom.sellerId = sellerId;
        record.custom.role = role;
        record.custom.active = true;
        if (!member) record.custom.addedAt = new Date();
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'MEMBER_SET', actor: by, detail: { role: role } });
    });
    return { error: false };
}

/**
 * Business Manager: commission tier and restricted categories a seller may list in.
 * @param {string} sellerId - seller
 * @param {string} tier - one of TIERS
 * @param {string[]} grants - restricted category IDs
 * @param {Object} by - admin actor
 * @returns {Object} result
 */
function setTierAndGrants(sellerId, tier, grants, by) {
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!seller) return marketplaceHelpers.errorResult('not-found');
    if (TIERS.indexOf(tier) < 0) return marketplaceHelpers.errorResult('invalid', { tier: 'invalid' });
    var restricted = getListPreference('sellerRestrictedCategoryIds');
    var clean = (grants || []).map(function (g) { return String(g).trim(); }).filter(function (g) { return restricted.indexOf(g) >= 0; });
    Transaction.wrap(function () {
        seller.custom.tier = tier;
        seller.custom.restrictedCategoryGrants = clean;
        seller.custom.revision = (seller.custom.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'SET_TIER_GRANTS', actor: by, detail: { tier: tier, grants: clean.join(',') } });
    });
    return { error: false };
}

/**
 * Starts payout account verification at the provider (or manual review).
 * @param {Object} context - seller context (finance.write)
 * @param {string} returnUrl - where the provider sends the seller back
 * @returns {Object} result with bankStatus and an optional redirectUrl
 */
function startPayoutAccount(context, returnUrl) {
    var c = context.seller.custom;
    if (c.bankStatus === 'VERIFIED') return marketplaceHelpers.errorResult('conflict');
    var answer = callProvider('bank', [getProviderData(context.seller), returnUrl]);
    var status = { MANUAL: 'MANUAL_REVIEW', REDIRECT: 'PENDING' }[answer.status] || 'ERROR';
    Transaction.wrap(function () {
        c.bankStatus = status;
        c.bankReference = answer.reference;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: context.sellerId, sellerId: context.sellerId, action: 'PAYOUT_ACCOUNT_STARTED', actor: context.actor, detail: { result: status } });
        if (status === 'MANUAL_REVIEW') marketplaceHelpers.notify(marketplaceHelpers.ADMIN, 'ADMIN_PAYOUT_ACCOUNT_PENDING', { sellerId: context.sellerId });
    });
    return { error: false, bankStatus: status, redirectUrl: answer.status === 'REDIRECT' ? answer.redirectUrl : null };
}

/**
 * @param {string} sellerId - seller
 * @param {string} outcome - VERIFIED | REJECTED
 * @param {?string} reference - provider reference (provider results must match the stored one)
 * @param {?string} last4 - last four digits of the payout account, display only
 * @param {Object} by - provider or admin actor
 * @returns {Object} result
 */
function recordPayoutAccountResult(sellerId, outcome, reference, last4, by) {
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!seller) return marketplaceHelpers.errorResult('not-found');
    var c = seller.custom;
    if (by.type === 'PROVIDER' && (!c.bankReference || c.bankReference !== reference)) return marketplaceHelpers.errorResult('conflict');
    if (['VERIFIED', 'REJECTED'].indexOf(outcome) < 0) return marketplaceHelpers.errorResult('invalid', { result: 'invalid' });
    Transaction.wrap(function () {
        c.bankStatus = outcome;
        c.payoutAccountLast4 = outcome === 'VERIFIED' && /^\d{4}$/.test(String(last4 || '')) ? String(last4) : null;
        c.bankReference = reference || c.bankReference;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: sellerId, sellerId: sellerId, action: 'PAYOUT_ACCOUNT_' + outcome, actor: by });
        marketplaceHelpers.notify(sellerId, 'PAYOUT_ACCOUNT_' + outcome, {});
    });
    return { error: false };
}

/**
 * @param {Object} context - seller context (settings.write)
 * @param {Object} data - {contactName, contactPhone, customerServiceEmail, handlingDays, shippingFee, freeShippingOver, returnsAccepted, returnDays, returnPolicy}
 * @param {?number} revision - revision the form was rendered from
 * @returns {Object} result with sellerView
 */
function updateSettings(context, data, revision) {
    var c = context.seller.custom;
    if (revision !== null && revision !== undefined && revision !== (c.revision || 0)) return marketplaceHelpers.errorResult('stale');
    var invalid = {};
    var settings = marketplaceHelpers.parseJson(c.settings, {});
    var number = function (name, max) {
        if (data[name] === undefined || data[name] === null || data[name] === '') return;
        var n = Number(data[name]);
        if (Math.floor(n) !== n || n < 0 || n > max) invalid[name] = 'out-of-range';
        else settings[name] = n;
    };
    var amount = function (name, target, max) {
        if (data[name] === undefined || data[name] === null || data[name] === '') return;
        var cents = marketplaceHelpers.toCents(data[name]);
        if (cents === null || (max !== null && cents > max)) invalid[name] = 'out-of-range';
        else settings[target] = cents;
    };
    number('handlingDays', getPreference('sellerMaxHandlingDays'));
    number('returnDays', getPreference('sellerMaxReturnDays'));
    amount('shippingFee', 'shippingFeeCents', getPreference('sellerMaxShippingFeeCents'));
    amount('freeShippingOver', 'freeShippingOverCents', null);
    if (data.returnsAccepted !== undefined) settings.returnsAccepted = [true, 'true', 'on'].indexOf(data.returnsAccepted) >= 0;
    var policy = marketplaceHelpers.cleanText(data.returnPolicy);
    if (policy.length > 2000) invalid.returnPolicy = 'too-long';
    else if (data.returnPolicy !== undefined) settings.returnPolicy = policy;
    var serviceEmail = marketplaceHelpers.cleanText(data.customerServiceEmail).toLowerCase();
    if (serviceEmail && !EMAIL.test(serviceEmail)) invalid.customerServiceEmail = 'invalid';
    else if (serviceEmail) settings.customerServiceEmail = serviceEmail;
    var contactName = marketplaceHelpers.cleanText(data.contactName);
    var contactPhone = marketplaceHelpers.cleanText(data.contactPhone);
    if (contactName && (contactName.length < 2 || contactName.length > 80)) invalid.contactName = 'invalid';
    if (contactPhone && !PHONE.test(contactPhone)) invalid.contactPhone = 'invalid';
    if (Object.keys(invalid).length) return marketplaceHelpers.errorResult('invalid', invalid);
    Transaction.wrap(function () {
        c.settings = JSON.stringify(settings);
        if (contactName) c.contactName = contactName;
        if (contactPhone) c.contactPhone = contactPhone;
        c.catalogDirty = true;
        c.revision = (c.revision || 0) + 1;
        marketplaceHelpers.logAudit({ entityType: 'SELLER', entityId: context.sellerId, sellerId: context.sellerId, action: 'UPDATE_SETTINGS', actor: context.actor });
    });
    return { error: false, sellerView: getSellerView(context.seller) };
}

/**
 * @param {dw.object.CustomObject} seller - seller
 * @returns {Object} the seller's terms used by offers and checkout
 */
function getSellerTerms(seller) {
    var settings = marketplaceHelpers.parseJson(seller.custom.settings, {});
    return {
        handlingDays: typeof settings.handlingDays === 'number' ? settings.handlingDays : getPreference('sellerDefaultHandlingDays'),
        shippingFeeCents: getPreference('sellerShippingFeesEnabled') === true && typeof settings.shippingFeeCents === 'number' ? settings.shippingFeeCents : 0,
        freeShippingOverCents: typeof settings.freeShippingOverCents === 'number' ? settings.freeShippingOverCents : null,
        returnsAccepted: settings.returnsAccepted !== false,
        returnDays: typeof settings.returnDays === 'number' ? settings.returnDays : 0
    };
}

/**
 * @param {string} sellerId - seller
 * @returns {?Object} public profile of an approved seller
 */
function getPublicProfile(sellerId) {
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', String(sellerId));
    if (!seller || seller.custom.status !== 'APPROVED') return null;
    var view = getSellerView(seller);
    return { sellerId: view.sellerId, displayName: view.displayName, rating: view.rating, ratingCount: view.ratingCount, terms: getSellerTerms(seller), returnPolicy: view.settings.returnPolicy || null };
}

module.exports = {
    US_STATES: US_STATES,
    BUSINESS_TYPES: BUSINESS_TYPES,
    ROLES: ROLES,
    TIERS: TIERS,
    PERMISSIONS: PERMISSIONS,
    getPreference: getPreference,
    getEnumPreference: getEnumPreference,
    getListPreference: getListPreference,
    isRegistrationOpen: isRegistrationOpen,
    getMembership: getMembership,
    getSellerContext: getSellerContext,
    getPermissions: getPermissions,
    getSellerView: getSellerView,
    getProviderData: getProviderData,
    applyAsSeller: applyAsSeller,
    updateApplication: updateApplication,
    sendVerificationCode: sendVerificationCode,
    verifyEmailCode: verifyEmailCode,
    callProvider: callProvider,
    submitApplication: submitApplication,
    recordIdentityResult: recordIdentityResult,
    decideSeller: decideSeller,
    suspendSeller: suspendSeller,
    setMember: setMember,
    setTierAndGrants: setTierAndGrants,
    startPayoutAccount: startPayoutAccount,
    recordPayoutAccountResult: recordPayoutAccountResult,
    updateSettings: updateSettings,
    getSellerTerms: getSellerTerms,
    getPublicProfile: getPublicProfile
};
