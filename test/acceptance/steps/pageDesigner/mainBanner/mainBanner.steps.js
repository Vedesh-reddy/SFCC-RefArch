const { I, mainBanner } = inject();

Then('shopper should see the main banner', () => {
    I.waitForElement(mainBanner.locators.mainBanner);
    I.seeElement(mainBanner.locators.mainBanner);
});

Then('shopper should see the main banner message', () => {
    let mainBannerElement = locate(mainBanner.locators.mainBanner).at(1);
    let heading = mainBannerElement.find(mainBanner.locators.mainBannerHeading);
    let subHeading = mainBannerElement.find(mainBanner.locators.mainBannerSubHeading);

    I.see('Dresses\nfor\nBesties', heading);
    I.see('Shop Now', subHeading);
});

Then('shopper should go to womens clothing dresses clicking on the main banner', () => {
    I.click(mainBanner.locators.mainBannerLink);
    I.wait(1);
    I.amOnPage('/s/RefArch/womens/clothing/dresses/?lang=en_US');
});
