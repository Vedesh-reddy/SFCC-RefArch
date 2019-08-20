const I = actor();

module.exports = {
    locators: {
        mainBanner: '.mainbanner-container',
        mainBannerHeading: '.image-heading-text',
        mainBannerSubHeading: '.mainbanner-sub-text',
        mainBannerLink: '.mainbanner-container a',
        pageTitle: '.page-title'

    },
    clickPopulareCategory(index, selector, url) {
        let locator = locate(selector)
            .at(index);

        I.seeElement(locator);
        I.click(locator);
        I.seeInCurrentUrl(url);
    }
};
