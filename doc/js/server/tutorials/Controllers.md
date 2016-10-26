All controllers need to be placed in the controllers directory to work correctly. They serve as entry points for external and internal (remote include) requests.

Here are a few important aspects

* The controller directory should only contain controllers and no other scripts.
* All controllers should use the View concept to render template output.
* Controllers should only define public endpoints (including endpoints required for remote includes), all other functionality should be located in modules.

To properly document controllers as modules we recommend the following approach.

```
'use strict';
/**
 * Controller summary
 *
 * @module controller/XYZ
 */
 
/**
 * Description of the url entry point. On pipelines used to be called start node.
 */
function show() { }
 
/** @see module:controller/XYZ~show */
exports.Show    = guard.ensure(['get'],show);
```

Please note the use of the [guard concept]{@link module:guard} which allows developers to easily declare access restrictions for the given endpoint such as request method or protocol.