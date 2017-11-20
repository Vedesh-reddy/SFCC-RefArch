'use strict';

module.exports = function (object) {
    Object.defineProperty(object, 'rating', {
        enumerable: true,
        value: (function () {
            var id = object.id;
            var sum = id.split('').reduce(function (total, letter) {
                return total + letter.charCodeAt(0);
            }, 0);

            return Math.ceil((sum % 5) * 2) / 2;
        }())
    });
};
