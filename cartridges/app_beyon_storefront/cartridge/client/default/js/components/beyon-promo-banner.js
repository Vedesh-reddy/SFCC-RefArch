'use strict';

/**
 * Runs the rotating promo banner.
 */
module.exports = function () {
    var banner = document.getElementById('promo-banner');
    var slides = banner.getAttribute('data-slides').split('||').map(function (slide) {
        return slide.split('|');
    });
    var title = document.getElementById('promo-banner-title');
    var sub = document.getElementById('promo-banner-sub');
    var dots = document.getElementById('promo-banner-dots');
    var index = 0;
    var draw = function () {
        title.textContent = slides[index][0];
        sub.textContent = slides[index][1];
        dots.innerHTML = '';
        slides.forEach(function (slide, position) {
            var dot = document.createElement('span');
            dot.className = 'banner-dot' + (position === index ? ' on' : '');
            dots.appendChild(dot);
        });
    };
    draw();
    setInterval(function () {
        index = (index + 1) % slides.length;
        draw();
    }, 2000);
};
