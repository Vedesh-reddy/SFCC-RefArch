# Page Designer Components for Storefront Reference Architecture

SFRA uses the following Page Designer components:

* [Campaign Banner](#Campaign-Banner)
* [Carousel](#Carousel)
* [Einstein Carousel](#Einstein-Carousel)
* [Shop Category](#Shop-Category)
* [Editorial Rich Text](#Editorial-Rich-Text)
* [Image and Text](#Image-and-Text)
* [Main Banner](#Main-Banner)
* [Mobile Grid 2 Rows 3 Columns](#Mobile-Grid-2-Rows-3-Columns)
* [Photo Tile](#Photo-Tile)
* [Popular Categories](#Popular-Categories)
* [Popular Category](#Popular-Category)
* [Product Tile](#Product-Tile)
* [Shop the Look](#Shop-the-Look)

-------------------

## Campaign Banner

This component is a thin banner used for campaigns and announcements.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/js/campaignBanner.js
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/campaignBanner.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/campaignBanner.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/campaignBanner.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/campaignBanner.isml
./cartridges/app_storefront_base/cartridge/templates/resources/campaignBanner.properties
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/components/storefront/campaignBanner.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/campaignBanner.properties
```

### Notes

This component has a text attribute for a campaign announcement.

This component depends on either the “Customer Groups” settings or the “Schedule” settings at the top of the component attributes panel.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Carousel

Enables a shopper to visually cycle through multiple other components, such as [Product Tile](#Product-Tile) components.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/js/carousel.js
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/carousel.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/carousel.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/carousel.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/carousel.isml
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/components/storefront/carousel.css
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/sfra_carousel.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/carousel.properties
```

### Notes

The carousel has configurable display attributes for phone and desktop.

This component reuses and overrides the Bootstrap Carousel.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Einstein Carousel

Enables a shopper to visually cycle through [Product Tile](#Product-Tile) components that are based on product IDs coming from the Einstein engine.  This component depends on the [Product Tile](#Product-Tile) component and the [Carousel](#Carousel) component.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/js/carousel.js
./cartridges/app_storefront_base/cartridge/client/default/js/einstienCarousel.js
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/einsteinCarousel.scss
./cartridges/app_storefront_base/cartridge/controllers/EinsteinCarousel.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarousel.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarousel.json
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarouselCategory.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarouselCategory.json
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarouselProduct.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/einsteinCarouselProduct.json
./cartridges/app_storefront_base/cartridge/scripts/experience/storefront/carouselBuilder.js
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/einsteinCarousel.isml
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/product/productTileWrapper.isml
./cartridges/app_storefront_base/cartridge/templates/resources/error.properties
./cartridges/app_storefront_base/cartridge/templates/resources/pageDesigner.properties
./cartridges/app_storefront_base/cartridge/experience/editors/einstein/categoryrecommenderselector.js
./cartridges/app_storefront_base/cartridge/experience/editors/einstein/categoryrecommenderselector.json
./cartridges/bm_app_storefront_base/cartridge/experience/editors/einstein/globalrecommenderselector.js
./cartridges/app_storefront_base/cartridge/experience/editors/einstein/globalrecommenderselector.json
./cartridges/app_storefront_base/cartridge/experience/editors/einstein/productrecommenderselector.js
./cartridges/app_storefront_base/cartridge/static/default/experience/editors/einstein/recommenderselector.js
./cartridges/app_storefront_base/cartridge/templates/resources/experience/components/storefront/einsteinCarousel.properties
./cartridges/app_storefront_base/cartridge/templates/resources/experience/components/storefront/einsteinCarouselCategory.properties
./cartridges/app_storefront_base/cartridge/templates/resources/experience/components/storefront/einsteinCarouselProduct.properties
```

### Notes

This component has configurable display attributes for phone and desktop. It reuses and overrides the Bootstrap Carousel.

This component uses the product tile component isml file.

There are three Einstein components to choose from.

    1. Einstein recommendations Component recommenders
        a. recently viewed
        b. viewed-recently-einstein
        c. products-in-all-categories
        d. home-page-recommender-mens
        e. home-page-recommender-womens
    2. Einstein recommendations (product) Component recommenders
        a. Product to Product Recommendation
        b. pdp
    3. Einstein recommendations (category) Component recommenders
        a. products-in-a-category-einstein

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Shop Category

Shows a navigation bar with links to categories.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/category.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/category.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/category.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/category.isml
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/category.css
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/components/storefront/category.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/category.properties
```

### Notes

Has a text headline attribute.

Has four required and eight optional category attributes.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Editorial Rich Text

Shows text or pictures within a section.

### Files
```
./cartridges/app_storefront_base/cartridge/experience/components/storefront/editorialRichText.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/editorialRichText.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/editorialRichText.isml
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/editorialRichText.properties
```

### Notes

Has one rich text attribute.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Image and Text

A component showing combined image and text.

### Files
```
./cartridges/app_storefront_base/cartridge/experience/components/storefront/imageAndText.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/imageAndText.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/imageAndText.isml
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/imageAndText.properties
```

### Notes

Has an image picker attribute, a text overlay attribute, and a link.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Main Banner

Shows a hero image with a text overlay and a ‘Shop Now’ link.

### Files
```
./cartridges/app_storefront_base/cartridge/experience/components/storefront/MainBanner.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/MainBanner.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/assets/mainBanner.isml
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/mainBanner.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/mainBanner.properties
```

### Notes

Has an image attribute, a text overlay attribute and a category picker to create a link.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Mobile Grid 2 Rows 3 Columns

Shows a grid with six regions into which a merchant can drop other components.

### Files
```
./cartridges/app_storefront_base/cartridge/experience/components/storefront/mobileGrid2r3c.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/mobileGrid2r3c.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/mobileGrid2r3c.isml
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/mobileGrid2r3c.properties
```

### Notes

Desktop and Tablet mode show 1 row by 6 columns.

Mobile Phone mode shows 2 rows by 3 Columns.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Photo Tile

Adds an image to a page or section.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/photoTile.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/photoTile.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/photoTile.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/photoTile.isml
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/photoTile.properties
```

### Notes

Has a single image picker attribute.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------


## Popular Categories

Shows one or more [Popular Category](#Popular-Category) components.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/popularCategories.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/popularCategories.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/popularCategories.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/popularCategories.isml
./cartridges/app_storefront_base/cartridge/templates/resources/experience/components/storefront/popularCategories.properties
```

### Notes

Has a text headline attribute. This component can hold an arbitrary number of [Popular Category](#Popular-Category) components.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Popular Category

Shows a popular category.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/popularCategory.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/popularCategory.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/popularCategory.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/popularCategory.isml
./cartridges/app_storefront_base/cartridge/templates/resources/experience/components/storefront/popularCategory.properties

```

### Notes

This component requires a selection of a category. The merchant can change the category's display name.

By default, this component uses one of the images assigned to the category (used in slots). If the fall-back images are used, there are two fields to add inline css rules for adjusting the image display size and css positioning within the circle used to display in the isml template.

The merchant can override the image using the image selector and choosing a focal point.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Product Tile

Shows a product in a tile and a ‘Shop Now’ overlay.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/productTile.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/productTile.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/productTile.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/product/productTile.isml
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/components/storefront/productTile.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/productTile.properties
```

### Notes

Has a product picker attribute and a boolean attribute to toggle display ratings.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)

-------------------

## Shop the Look

Shows [Product Tile](#Product-Tile) components that link to the Quick View of a set.

### Files
```
./cartridges/app_storefront_base/cartridge/client/default/scss/experience/components/storefront/shopTheLook.scss
./cartridges/app_storefront_base/cartridge/experience/components/storefront/shopTheLook.js
./cartridges/app_storefront_base/cartridge/experience/components/storefront/shopTheLook.json
./cartridges/app_storefront_base/cartridge/templates/default/experience/components/storefront/shopTheLook.isml
./cartridges/bm_app_storefront_base/cartridge/static/default/css/experience/components/storefront/shopTheLook.css
./cartridges/bm_app_storefront_base/cartridge/templates/resources/experience/components/storefront/shopTheLook.properties
```

### Notes

Has a product picker attribute and a boolean attribute to toggle display product pricing.

[Return to top](#Page-Designer-Components-for-Storefront-Reference-Architecture)


