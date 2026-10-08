'use strict';

/**
 * One-time codes. Codes are never stored in clear text: only a salted SHA-256
 * hash is kept, in session.privacy for shopper challenges and on the order for
 * store pickup.
 * @module scripts/otp
 */

var SecureRandom = require('dw/crypto/SecureRandom');
var MessageDigest = require('dw/crypto/MessageDigest');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');

var TTL_MS = 10 * 60 * 1000;
var RESEND_MS = 60 * 1000;
var MAX_ATTEMPTS = 5;

/**
 * @returns {string} Six-digit code
 */
function generateCode() {
    return ('00000' + new SecureRandom().nextInt(1000000)).slice(-6);
}

/**
 * @returns {string} Random hex salt
 */
function generateSalt() {
    return Encoding.toHex(new SecureRandom().nextBytes(16));
}

/**
 * @param {string} code - Code as typed by the shopper or employee
 * @param {string} salt - Salt stored with the hash
 * @returns {string} Hex SHA-256 of salt and code
 */
function hash(code, salt) {
    var digest = new MessageDigest(MessageDigest.DIGEST_SHA_256);
    return Encoding.toHex(digest.digestBytes(new Bytes(salt + ':' + String(code || '').trim())));
}

/**
 * @param {dw.system.SessionPrivacy|Object} privacy - session.privacy
 */
function clear(privacy) {
    ['smartOtpPurpose', 'smartOtpSubject', 'smartOtpHash', 'smartOtpSalt', 'smartOtpExpires', 'smartOtpAttempts', 'smartOtpSentAt'].forEach(function (key) {
        privacy[key] = null; // eslint-disable-line no-param-reassign
    });
}

/**
 * Starts a challenge for this session. A repeat request for the same subject
 * inside the resend interval keeps the code already sent.
 * @param {dw.system.SessionPrivacy|Object} privacy - session.privacy
 * @param {string} purpose - Flow the code unlocks, e.g. login or order-track
 * @param {string} subject - Value returned on success (email, order number)
 * @returns {string|null} New code to send, or null when throttled
 */
function issue(privacy, purpose, subject) {
    var now = Date.now();
    // ponytail: resend throttle is per session | upgrade path: per-subject counter in a custom cache if code requests are abused across sessions
    if (privacy.smartOtpPurpose === purpose && privacy.smartOtpSubject === subject
        && privacy.smartOtpSentAt && now - privacy.smartOtpSentAt < RESEND_MS) {
        return null;
    }
    var code = generateCode();
    var salt = generateSalt();
    /* eslint-disable no-param-reassign */
    privacy.smartOtpPurpose = purpose;
    privacy.smartOtpSubject = subject;
    privacy.smartOtpSalt = salt;
    privacy.smartOtpHash = hash(code, salt);
    privacy.smartOtpExpires = now + TTL_MS;
    privacy.smartOtpAttempts = 0;
    privacy.smartOtpSentAt = now;
    /* eslint-enable no-param-reassign */
    return code;
}

/**
 * The challenge is single use and dies after MAX_ATTEMPTS wrong codes.
 * @param {dw.system.SessionPrivacy|Object} privacy - session.privacy
 * @param {string} purpose - Expected flow
 * @param {string} code - Code from the request
 * @returns {string|null} Subject when the code matches
 */
function verify(privacy, purpose, code) {
    if (privacy.smartOtpPurpose !== purpose || !privacy.smartOtpHash) {
        return null;
    }
    if (Date.now() > privacy.smartOtpExpires || privacy.smartOtpAttempts >= MAX_ATTEMPTS) {
        clear(privacy);
        return null;
    }
    privacy.smartOtpAttempts += 1; // eslint-disable-line no-param-reassign
    if (hash(code, privacy.smartOtpSalt) !== privacy.smartOtpHash) {
        return null;
    }
    var subject = privacy.smartOtpSubject;
    clear(privacy);
    return subject;
}

/**
 * @param {dw.system.SessionPrivacy|Object} privacy - session.privacy
 * @param {string} purpose - Flow
 * @returns {string|null} Subject of the open challenge
 */
function pendingSubject(privacy, purpose) {
    return privacy.smartOtpPurpose === purpose ? privacy.smartOtpSubject : null;
}

module.exports = {
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    generateCode: generateCode,
    generateSalt: generateSalt,
    hash: hash,
    issue: issue,
    verify: verify,
    pendingSubject: pendingSubject
};
