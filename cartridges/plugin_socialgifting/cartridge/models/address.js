'use strict';

var Base = module.superModule;
/**
 * Redact only address types that define the private-delivery marker.
 * @param {*} address - address input
 */
function Address(address) {
    if (address && address.custom && address.describe
        && address.describe().getCustomAttributeDefinition('sgPrivateDelivery') && address.custom.sgPrivateDelivery) {
        this.address = { firstName: 'Registry recipient', lastName: '', address1: '', address2: '', city: '', postalCode: '', stateCode: '', phone: '', countryCode: { value: '', displayValue: '' } };
    } else Base.call(this, address);
}
module.exports = Address;
