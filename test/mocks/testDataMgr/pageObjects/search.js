'use strict'

export const SEARCH_FORM = 'form[role*=search]';
export const PDP_MAIN = '.search-results';
export const SEARCH_RESULT_Large = '.search-results .hidden-xs-down';
//export const SEARCH_RESULT_Medium = '.search-results .hidden-md-up';
export const SEARCH_RESULT_Small = '.search-results .hidden-sm-up';

export function getQuerySearchSelector(selector1, selector2) {
    let mySelector;
    return browser.isVisible(selector1)
        .then(visible => {
            if(visible){
                mySelector = selector1;
                return mySelector;
            }
            return mySelector = selector2;

        })
}
//per _variables.scss defines:
//If you detect the end user's screen is smaller than 544 pixels you have to show the smartphone layout
//If the screen is larger than 544 pixels but smaller than 769 pixels, show us the tablet layout
//If the screen is larger than 769 show the regular desktop layout

export function getSearchResultSelector(selector1, selector3, screenWidth) {
   if(screenWidth > 769) {
       return selector1
   }else if (screenWidth < 544){
       return selector3
   }
    return selector1;

}
