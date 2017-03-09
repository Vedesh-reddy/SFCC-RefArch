'use strict';

function assertRequiredParameter( param, name ){
	if( !param ) throw new Error('"'+name+'" is a required parameter.');
}


module.exports = {
	assertRequiredParameter: assertRequiredParameter
};
