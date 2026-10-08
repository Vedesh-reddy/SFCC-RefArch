'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('Smart commerce one-time codes', function () {
    var otp;
    var nextCode;

    beforeEach(function () {
        nextCode = 42;
        function Bytes(value) { this.value = value; }
        function MessageDigest() {}
        MessageDigest.DIGEST_SHA_256 = 'SHA-256';
        MessageDigest.prototype.digestBytes = function (bytes) { return 'sha(' + bytes.value + ')'; };
        function SecureRandom() {}
        SecureRandom.prototype.nextInt = function () { return nextCode; };
        SecureRandom.prototype.nextBytes = function () { return 'salt'; };
        otp = proxyquire('../../../cartridges/plugin_smartcommerce/cartridge/scripts/otp', {
            'dw/crypto/SecureRandom': SecureRandom,
            'dw/crypto/MessageDigest': MessageDigest,
            'dw/crypto/Encoding': { toHex: function (value) { return String(value); } },
            'dw/util/Bytes': Bytes
        });
    });

    it('pads codes to six digits and stores only a hash', function () {
        var privacy = {};
        var code = otp.issue(privacy, 'login', 'a@b.com');
        assert.equal(code, '000042');
        assert.notInclude(JSON.stringify(privacy), '"000042"');
        assert.equal(privacy.smartOtpHash, 'sha(salt:000042)');
    });

    it('returns the subject once for the right code and purpose', function () {
        var privacy = {};
        var code = otp.issue(privacy, 'login', 'a@b.com');
        assert.isNull(otp.verify(privacy, 'order-track', code));
        assert.equal(otp.verify(privacy, 'login', ' ' + code + ' '), 'a@b.com');
        assert.isNull(otp.verify(privacy, 'login', code), 'single use');
    });

    it('throttles resends of the same challenge', function () {
        var privacy = {};
        assert.ok(otp.issue(privacy, 'login', 'a@b.com'));
        assert.isNull(otp.issue(privacy, 'login', 'a@b.com'));
        assert.ok(otp.issue(privacy, 'login', 'c@d.com'), 'different subject is not throttled');
    });

    it('dies after the maximum wrong attempts', function () {
        var privacy = {};
        var code = otp.issue(privacy, 'login', 'a@b.com');
        for (var i = 0; i < otp.MAX_ATTEMPTS; i++) {
            assert.isNull(otp.verify(privacy, 'login', '999999'));
        }
        assert.isNull(otp.verify(privacy, 'login', code));
        assert.isNull(otp.pendingSubject(privacy, 'login'));
    });

    it('expires after ten minutes', function () {
        var privacy = {};
        var code = otp.issue(privacy, 'login', 'a@b.com');
        privacy.smartOtpExpires = Date.now() - 1;
        assert.isNull(otp.verify(privacy, 'login', code));
    });
});
