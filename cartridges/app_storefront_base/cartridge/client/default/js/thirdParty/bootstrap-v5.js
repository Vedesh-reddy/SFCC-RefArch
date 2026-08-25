import Alert from 'bootstrap/js/src/alert.js';
import Button from 'bootstrap/js/src/button.js';
import Carousel from 'bootstrap/js/src/carousel.js';
import Collapse from 'bootstrap/js/src/collapse.js';
import Modal from 'bootstrap/js/src/modal.js';
import Offcanvas from 'bootstrap/js/src/offcanvas.js';
import Popover from 'bootstrap/js/src/popover.js';
import ScrollSpy from 'bootstrap/js/src/scrollspy.js';
import Tab from 'bootstrap/js/src/tab.js';
import Toast from 'bootstrap/js/src/toast.js';
import Tooltip from 'bootstrap/js/src/tooltip.js';

/**
 * Bootstrap's Dropdown is deliberately absent.
 *
 * Importing it registers two document-level keydown listeners delegated to `.dropdown-menu`,
 * and those listeners resolve their owning toggle exclusively through
 * `[data-bs-toggle="dropdown"]`. No template in this cartridge carries that attribute — the
 * header mega-menu, the country selector, and the mobile account dropdown are all opened and
 * positioned by our own jQuery in `components/menu.js` and `components/countrySelector.js`,
 * which Bootstrap's Popper-based positioning fought with. With no toggle to find, every
 * arrow-key or escape press inside a menu built a Dropdown around a null element and threw
 * on `this._element.parentNode`.
 *
 * Those listeners register in the capture phase, so they run before any handler bound to the
 * menu links themselves; nothing bound further down the tree can stop them. Not importing the
 * module is what keeps them off the document.
 *
 * Re-add the import only alongside `data-bs-toggle="dropdown"` markup and the removal of the
 * custom menu keyboard handling, since the two implementations compete for focus.
 */
window.bootstrap = {
    Alert: Alert,
    Button: Button,
    Carousel: Carousel,
    Collapse: Collapse,
    Modal: Modal,
    Offcanvas: Offcanvas,
    Popover: Popover,
    ScrollSpy: ScrollSpy,
    Tab: Tab,
    Toast: Toast,
    Tooltip: Tooltip
};
