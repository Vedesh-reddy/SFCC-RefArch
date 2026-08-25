'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var componentPath = '../../../../../cartridges/app_storefront_base/cartridge/client/default/js/components/keyboardAccessibility';

/**
 * The component binds a keydown handler through jQuery's `$(selector).on('keydown', fn)`.
 * These tests capture that bound handler so it can be invoked directly with a synthetic
 * event, without a DOM or jsdom.
 */
function loadWithCapturedHandler() {
    var captured = {};
    global.$ = sinon.stub().returns({
        on: function (eventName, handler) {
            captured.eventName = eventName;
            captured.handler = handler;
        }
    });
    var keyboardAccessibility = proxyquire(componentPath, {});
    return { keyboardAccessibility: keyboardAccessibility, captured: captured };
}

function keydownEvent(keyCode) {
    return { which: keyCode, preventDefault: sinon.spy(), stopPropagation: sinon.spy() };
}

describe('keyboardAccessibility', function () {
    afterEach(function () {
        delete global.$;
    });

    it('passes the keydown event to the registered key handler', function () {
        var loaded = loadWithCapturedHandler();
        var enterHandler = sinon.spy();

        loaded.keyboardAccessibility('.selector', { 13: enterHandler }, function () {
            return 'scope';
        });

        var event = keydownEvent(13);
        loaded.captured.handler.call({}, event);

        assert.isTrue(enterHandler.calledOnce);
        assert.strictEqual(enterHandler.firstCall.args[0], 'scope');
        assert.strictEqual(
            enterHandler.firstCall.args[1],
            event,
            'handler must receive the event so it can decide whether to preventDefault'
        );
    });

    it('does not centrally preventDefault Enter, leaving leaf-link navigation intact', function () {
        var loaded = loadWithCapturedHandler();

        loaded.keyboardAccessibility('.selector', {}, function () {
            return 'scope';
        });

        var event = keydownEvent(13);
        loaded.captured.handler.call({}, event);

        assert.isFalse(
            event.preventDefault.called,
            'Enter must reach the browser unless a handler opts to suppress it'
        );
    });

    it('centrally preventDefaults the arrow and escape keys it owns', function () {
        var loaded = loadWithCapturedHandler();

        loaded.keyboardAccessibility('.selector', {}, function () {
            return 'scope';
        });

        [37, 38, 39, 40, 27].forEach(function (keyCode) {
            var event = keydownEvent(keyCode);
            loaded.captured.handler.call({}, event);
            assert.isTrue(
                event.preventDefault.called,
                'key ' + keyCode + ' should be preventDefaulted centrally'
            );
        });
    });

    it('leaves propagation alone so other listeners still observe the key', function () {
        var loaded = loadWithCapturedHandler();

        loaded.keyboardAccessibility('.selector', {}, function () {
            return 'scope';
        });

        [37, 38, 39, 40, 27, 9, 13, 32].forEach(function (keyCode) {
            var event = keydownEvent(keyCode);
            loaded.captured.handler.call({}, event);
            assert.isFalse(
                event.stopPropagation.called,
                'key ' + keyCode + ' should keep propagating'
            );
        });
    });
});
