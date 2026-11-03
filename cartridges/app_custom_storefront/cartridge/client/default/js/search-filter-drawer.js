'use strict';

// Base only opens the refinement bar below the md breakpoint. This keeps it a drawer at every
// width and adds the close paths base leaves out: Escape and clicking outside.
var OPEN_CLASS = 'search-filter-open';

/**
 * Shows or hides the filter drawer
 * @param {boolean} open - Whether the drawer should be open
 */
function setOpen(open) {
    document.body.classList.toggle(OPEN_CLASS, open);
}

/**
 * Closes the drawer through the base close button, so base restores focus and aria state
 */
function closeDrawer() {
    var closeButton = document.querySelector('.refinement-bar button.close');
    if (closeButton) {
        closeButton.click();
    }
}

// Capture phase: base focuses the close button on click, which needs the drawer visible first.
document.addEventListener('click', function (e) {
    if (e.target.closest('button.filter-results')) {
        setOpen(true);
    } else if (e.target.closest('.refinement-bar button.close')) {
        setOpen(false);
    } else if (e.target.closest('.modal-background') && document.body.classList.contains(OPEN_CLASS)) {
        closeDrawer();
    }
}, true);

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains(OPEN_CLASS)) {
        closeDrawer();
    }
});

// Base hides the drawer and backdrop on every resize, and phones fire resize when the address bar
// moves. Only a real width change closes the drawer; otherwise the backdrop goes back on.
var lastWidth = window.innerWidth;
window.addEventListener('resize', function () {
    var open = document.body.classList.contains(OPEN_CLASS);
    if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        setOpen(false);
    } else if (open) {
        document.querySelector('.modal-background').style.display = 'block';
    }
});
