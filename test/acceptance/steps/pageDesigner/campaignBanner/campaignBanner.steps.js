const { I } = inject();

Then('shopper should see the campaign banner', () => {
    I.waitForElement('.campaign-banner');
    I.seeElement('.campaign-banner .campaign-banner-message');
    I.see('We\'re Taking Sale To the Next Level! 80% OFF!', '.campaign-banner .campaign-banner-message');
});

Then('shopper should see the campaign banner message', () => {
    I.see('We\'re Taking Sale To the Next Level! 80% OFF!', '.campaign-banner .campaign-banner-message');
});


Then('shopper should see a close button on campaign banner', () => {
    I.seeElement('.campaign-banner .close-button .close');
});

Then('shopper should be able to close the campaign banner', () => {
    I.click('.campaign-banner .close-button .close');
});

Then('shopper should no longer see the campaign banner', () => {
    I.dontSeeElement('.campaign-banner');
});
