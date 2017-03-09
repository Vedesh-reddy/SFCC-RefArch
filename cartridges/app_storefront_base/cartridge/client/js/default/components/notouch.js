 // Based on: https://github.com/Modernizr/Modernizr/blob/master/feature-detects/touchevents.js
 // and http://www.w3.org/TR/pointerevents/#examples
 module.exports = function () {
     var testDiv;
     var isTouch = ('ontouchstart' in window)
         || (window.navigator.pointerEnabled && window.navigator.maxTouchPoints > 0);

     if (!isTouch) {
         testDiv = $('<div class="bs-touch-test"></div>').appendTo(document.body);
         isTouch = testDiv.css('top') === '-99px';
         testDiv.remove();
     }
     if (!isTouch) {
         (document.documentElement.className += ' bs-no-touch');
     }
 };
