/* globals google */
'use strict';

/**
 * appends params to a url
 * @param {string} url - Original url
 * @param {Object} params - Parameters to append
 * @returns {string} result url with appended parameters
 */
function appendToUrl(url, params) {
    var newUrl = url;
    newUrl += (newUrl.indexOf('?') !== -1 ? '&' : '?') + Object.keys(params).map(function (key) {
        return key + '=' + encodeURIComponent(params[key]);
    }).join('&');

    return newUrl;
}

/**
 * Uses google maps api to render a map
 */
function maps() {
    var map;
    var latlng = new google.maps.LatLng(-34.397, 150.644);
    var mapOptions = {
        scrollwheel: false,
        zoom: 8,
        center: latlng
    };

    map = new google.maps.Map($('.map-canvas')[0], mapOptions);
    var mapdiv = $('.map-canvas').attr('data-locations');

    mapdiv = JSON.parse(mapdiv);

    Object.keys(mapdiv).forEach(function (key) {
        var item = mapdiv[key];
        var storeLocation = new google.maps.LatLng(item.latitude, item.longitude);
        map.setCenter(storeLocation);
        var marker = new google.maps.Marker({
            position: storeLocation,
            map: map,
            title: item.name
        });
        marker.setMap(map);
    });
}

/**
 * Renders the results of the search and updates the map
 * @param {Object} data - Response from the server
 */
function updateStoresResults(data) {
    var $resultsDiv = $('.results');
    var $mapDiv = $('.map-canvas');

    if (data.stores.length === 0) {
        $('.store-locator-no-results').show();
    } else {
        $('.store-locator-no-results').hide();
    }

    $resultsDiv.empty();
    $resultsDiv.attr('data-hasResults', data.stores.length);
    $resultsDiv.attr('data-radius', data.radius);
    $resultsDiv.attr('data-searchKey', JSON.stringify(data.searchKey));

    $('.maxdistance').val(parseInt($('.results').attr('data-radius'), 10));

    $mapDiv.attr('data-locations', JSON.stringify(data.locations));

    if (JSON.parse($mapDiv.attr('data-hasGoogleApi')) !== false) {
        maps();
    } else {
        $('.store-locator-no-apiKey').show();
    }

    if (data.stores) {
        for (var i = 0; i < data.stores.length; i++) {
            var item = data.stores[i];
            var html;

            var phoneHtml = '<p> <i class="fa fa-phone" aria-hidden="true"></i>' +
                '<span class="storelocator-phone"> ' +
                item.phone +
                '</span></p>';

            var beginhtml = '<div class="row">' +
                '<div class="col-xs-2 col-sm-4 col-md-5">' +
                '<i class="fa fa-map-marker pull-right map-marker"></i>' +
                '</div>' +
                '<div class="store-information col-xs-10 col-sm-8 col-md-7">' +
                '<strong>' + item.name + '</strong> <br/>' +
                '<p>' + item.address1 + ' ' + item.city + ', ' +
                item.stateCode + ' ' + item.postalCode;

            var endinghtml = '</p>' +
                '</div>' +
                '</div>' +
                '<hr class="hidden-md hidden-lg store-separator">' +
                '<br class="hidden-sm hidden-xs">';

            if (item.phone) {
                html = beginhtml + phoneHtml + endinghtml;
            } else {
                html = beginhtml + endinghtml;
            }

            $resultsDiv.append(html);
        }
    }
}

module.exports = function () {
    if (JSON.parse($('.map-canvas').attr('data-hasGoogleApi')) !== false) {
        maps();
    } else {
        $('.store-locator-no-apiKey').show();
    }


    if ($('.results').attr('data-hasResults') === 0) {
        $('.store-locator-no-results').show();
    }

    $('.maxdistance').val(parseInt($('.results').attr('data-radius'), 10));

    $('.detectLocation').submit(function (e) {
        e.preventDefault();
        if (!navigator.geolocation) {
            return;
        }

        navigator.geolocation.getCurrentPosition(function (position) {
            var $form = $('.detectLocation');
            var url = $form.attr('action');
            var urlParams = {
                lat: position.coords.latitude,
                long: position.coords.longitude
            };

            url = appendToUrl(url, urlParams);

            $.ajax({
                url: url,
                type: $form.attr('method'),
                data: $form.serialize(),
                dataType: 'json',
                success: function (data) {
                    updateStoresResults(data);
                }
            });
        });
    });

    $('.storelocator').submit(function (e) {
        e.preventDefault();
        var $form = $('.storelocator');

        $.ajax({
            url: $form.attr('action'),
            type: $form.attr('method'),
            data: $form.serialize(),
            dataType: 'json',
            success: function (data) {
                updateStoresResults(data);
            }
        });
        return false;
    });

    $('.maxdistance').change(function () {
        var radius = $(this).val();
        var searchKeys = $('.results').attr('data-searchKey');
        var url = $('.radius').attr('action');
        var urlParams = {};

        searchKeys = JSON.parse(searchKeys);

        if (searchKeys.postalCode) {
            urlParams = {
                radius: radius,
                postalCode: searchKeys.postalCode
            };
        } else if (searchKeys.lat && searchKeys.long) {
            urlParams = {
                radius: radius,
                lat: searchKeys.lat,
                long: searchKeys.long
            };
        }

        url = appendToUrl(url, urlParams);

        $.ajax({
            url: url,
            type: 'get',
            dataType: 'json',
            success: function (data) {
                updateStoresResults(data);
            }
        });
    });
};
