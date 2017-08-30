'use strict';
/* global XML */

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
    * @param {Object} viewData - Object to be turned into XML
    * @param {Object} response - Response object
    * @returns {void}
    */
    xml: function xml(viewData, response) {
        var XML_CHAR_MAP = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&apos;'
        };

        // Valid XML needs a single root.
        var xmlData = '<response>';

        Object.keys(viewData).forEach(function (key) {
            if (key === 'xml') {
                xmlData += viewData[key];
            } else {
                xmlData +=
                    '<' + key + '>' + viewData[key].replace(/[<>&"']/g, function (ch) {
                        return XML_CHAR_MAP[ch];
                    }) + '</' + key + '>';
            }
        });

        // Close the root
        xmlData += '</response>';

        response.setContentType('application/xml');

        try {
            response.print(new XML(xmlData));
        } catch (e) {
            throw new Error(e.message + '\n\r' + e.stack, e.fileName, e.lineNumber);
        }
    }
};
