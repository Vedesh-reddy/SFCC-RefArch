'use strict';

module.exports = function (element, message) {
    var errorHtml = '<div class="alert alert-danger alert-dismissible '
        + 'fade show" role="alert">'
        + '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close">'
        + '</button>' + message + '</div>';

    $(element).append(errorHtml);
};
