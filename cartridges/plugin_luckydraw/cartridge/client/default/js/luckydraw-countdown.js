'use strict';

// Live countdown next to the draw time. The draw time itself is printed in the page, so the
// countdown is decoration only (aria-hidden) and the page works without script.

/**
 * @param {number} ms - remaining time
 * @returns {string} "2d 03:04:05"
 */
function format(ms) {
    var seconds = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(seconds / 86400);
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    var clock = two(Math.floor((seconds % 86400) / 3600)) + ':' + two(Math.floor((seconds % 3600) / 60)) + ':' + two(seconds % 60);
    return (days ? days + 'd ' : '') + clock;
}

$(function () {
    var $targets = $('.luckydraw-countdown[data-target]');
    if (!$targets.length) return;
    var tick = function () {
        $targets.each(function () {
            var target = Date.parse($(this).attr('data-target'));
            if (!Number.isNaN(target)) $(this).text(format(target - Date.now()));
        });
    };
    tick();
    setInterval(tick, 1000);
});
