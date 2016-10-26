# Style Guide
## What is the style guide
The style guide documents the visual elements used in the web application. You can read about [style guides](http://styleguides.io/) and see [examples of style guides](http://styleguides.io/examples.html).

## SiteGenesis Style Guide
The SiteGenesis Style Guide (SSG) helps designers and developers to define a common visual language used for their e-commerce application. It includes design elements such as colors, typography, and icons, as well as more complex UI components, such as the product tile or navigation menu.

By documenting only what is essential to the design of the application, the style guide frees up the constraints that are traditionally imposed on designers by old-school wireframes, allowing them to be creative and experiment with new and user-friendly interface design that is centered around the user experience.

_**Disclaimer**: this is still a work in progress and is not complete. The example style guide provided here is meant as a proof of concept. Further development on top of is strongly encouranged._

## What it does
This style guide imports the SASS styles in `app_storefront_base`. This way, any update to the application's style is reflected in the style guide.

The guide is broken down into four major sections: Foundation, Elements, Components and Pages.

- Foundation include things such as colors, typography and icons.
- Elements represent small UI elements that are used repeatedly throughout the application, such as buttons, color swatches etc.
- One or more elements put together create components. Components are atomic and holistic UI interfaces that carry a semantic meaning on its own. Examples of components include navigation menu or product tile.
- Pages are templates for pages or full pages that represent a good structure of how different components come together. Some examples of pages include the homepage or the product search page.

For most elements and components, the UI demo is accompanied with HTML markup.

## What it uses
SSG is built as a client-side app using [Ampersand](http://ampersandjs.com/).

Templates are written in Handlebars. Data are specified in JSON. Even though SiteGenesis the application is not using client-side templating at the moment, these templates could grow to become guideliens of how that could be done in the future.
