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
    template: function template(view, viewData, response) {
        // create a shallow copy of the data
        var data = {};
        Object.keys(viewData).forEach(function (key) {
            data[key] = viewData[key];
        });

        try {
            isml.renderTemplate(view, data);
        } catch (e) {
            response.print('<h1>' + e.javaMessage + '</h1>');
            response.print('<h3>File: ' + e.fileName + ', line: ' + e.lineNumber + '</h3>');
            response.print('<h3>Template: ' + view + '</h3>');
            response.print('<pre>' + e.stack + '</pre>');
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
    }
};
