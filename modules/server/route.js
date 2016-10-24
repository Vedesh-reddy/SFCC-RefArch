'use strict';

var EventEmitter = require('./EventEmitter');

/**
 * @constructor
 * @param {string} name - Name of the route, corresponds to the second part of the URL
 * @param {Function[]} chain - List of functions to be executed
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function Route(name, chain, req, res) {
    this.name = name;
    this.chain = chain;
    this.req = req;
    this.res = res;
    EventEmitter.call(this);
}

Route.prototype = EventEmitter.prototype;

/**
 * Create a single function that chains all of the calls together, one after another
 * @returns {Function} Function to be executed when URL is hit
 */
Route.prototype.getRoute = function () {
    var me = this;
    return (function () {
        var i = 0;

        /**
         * Go to the next step in the chain or complete the chain after the last step
         * @param {Object} error - Error object from the prevous step
         * @returns {void}
         */
        function next(error) {
            if (error) {
                // process error here and output error template
                me.res.log(error);
                throw new Error(error);
            }

            if (me.res.redirectUrl) {
                // if there's a pending redirect, break the chain
                me.emit('route:Redirect', me.req, me.res);
                me.res.base.redirect(me.res.redirectUrl);
                return;
            }

            if (i < me.chain.length) {
                me.emit('route:Step', me.req, me.res);
                me.chain[i++].call(me, me.req, me.res, next);
            } else {
                me.done.call(me, me.req, me.res);
            }
        }

        i++;
        me.emit('route:Start', me.req, me.res);
        me.chain[0].call(me, me.req, me.res, next);
    });
};

/**
 * Append a middleware step into current chain
 *
 * @param {Function} step - New middleware step
 * @return {void}
 */
Route.prototype.append = function append(step) {
    this.chain.push(step);
};

/**
 * Last step in the chain, this will render a template or output a json string
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {void}
 */
Route.prototype.done = function done(req, res) {
    this.emit('route:BeforeComplete', req, res);
    this.emit('route:Complete', req, res);
};

module.exports = Route;
