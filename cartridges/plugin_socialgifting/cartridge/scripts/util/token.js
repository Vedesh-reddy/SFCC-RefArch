'use strict';

var Encoding = require('dw/crypto/Encoding');
var MessageDigest = require('dw/crypto/MessageDigest');
var Bytes = require('dw/util/Bytes');
var SecureRandom = require('dw/crypto/SecureRandom');
/**
 * Generate a cryptographic bearer capability.
 * @returns {*} Domain result
 */
function random() {
    var result = Encoding.toHex(new SecureRandom().nextBytes(32));
    if (result.length !== 64) throw new Error('Unexpected cryptographic token length');
    return result;
}
/**
 * Hash a capability before persistence.
 * @param {*} value - value input
 * @returns {*} Domain result
 */
function hash(value) {
    return Encoding.toHex(new MessageDigest(MessageDigest.DIGEST_SHA_256).digestBytes(new Bytes(String(value))));
}
/**
 * Hash a length-delimited composite key.
 * @param {*} parts - parts input
 * @returns {*} Domain result
 */
function key(parts) { return hash(JSON.stringify(parts)); }
module.exports = { random: random, hash: hash, key: key };
