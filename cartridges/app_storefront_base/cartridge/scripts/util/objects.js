function keys(obj, own){
	var arr = [];
	for( var key in obj ){
		if( !own || obj.hasOwnProperty(key) ){
			arr.push(key);
		}
	}
	return arr;
}

function values(obj, own){
	var arr = [];
	for( var key in obj ){
		if( !own || obj.hasOwnProperty(key) ){
			arr.push(obj[key]);
		}
	}
	return arr;
}

function createClass( prototype, properties ){
	var $model = Object.create( prototype||{} );
	if( properties ) {
		for( var key in properties ){
			if( properties.hasOwnProperty(key) ) {
				$model[key] = properties[key];
			}
		}
	}
	return $model;
}

function valueForKeyPath(context, keyPath){
	var keys = keyPath.split('.'),
		value = ctx;
	
	try {
		for( var i=0, ii=keys.length; i<ii; i++ ){
			value = value ? value[keys[i]] : null;
		}
	} catch(e){
		value = null;
	}
	
	return value;
}

module.exports = {
	keys: keys,
	values: values,
	createClass: createClass,
	valueForKeyPath: valueForKeyPath
};