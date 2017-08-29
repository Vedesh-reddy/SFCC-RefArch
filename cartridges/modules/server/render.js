'use strict';

var isml = require('dw/template/ISML');

module.exports = {
    /**
     * Render an ISML template
     * @param {string} view - Path to an ISML template
     * @param {Object} viewData - Data to be passed as pdict
     * @param {Object} response - Response object
     * @returns {void}
     */
    template: function template(view, viewData) {
        // create a shallow copy of the data
        var data = {};
        Object.keys(viewData).forEach(function (key) {
            data[key] = viewData[key];
        });

        try {
            isml.renderTemplate(view, data);
        } catch (e) {
            throw new Error(e.javaMessage + '\n\r' + e.stack, e.fileName, e.lineNumber);
        }
    },
    /**
     * Render JSON as an output
     * @param {Object} data - Object to be turned into JSON
     * @param {Object} response - Response object
     * @returns {void}
     */
    json: function json(data, response) {
        response.setContentType('application/json');
        response.print(JSON.stringify(data, null, 2));
    },
     /**
     * Render XML as an output
     * @param {String} xmlString - The XML string
     * @param {Object} response - Response object
     * @returns {void}
     */
    xml: function xml(xmlString, response) {
        response.setContentType('application/xml');
        response.print(xmlString);
    }
};
