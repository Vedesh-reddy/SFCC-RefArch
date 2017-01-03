'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('forms', function () {
    var buildObj = function (obj) {
        Object.keys(obj).forEach(function (key) {
            this[key] = obj[key];
        }, this);
    };
    var FormGroup = function (obj) { this.init.call(this, obj); }; FormGroup.prototype.init = buildObj;
    var FormAction = function (obj) { this.init.call(this, obj); }; FormAction.prototype.init = buildObj;
    var FormField = function (obj) { this.init.call(this, obj); }; FormField.prototype.init = buildObj;
    var formsRequire = proxyquire('../../../../cartridges/modules/server/forms/forms', {
        'dw/web/FormField': FormField,
        'dw/web/FormAction': FormAction,
        'dw/web/FormGroup': FormGroup,
        './formfield': proxyquire('../../../../cartridges/modules/server/forms/formfield', {
            'dw/web/Resource': { msg: function (value) { return value; } }
        })
    });

    it('should load a form', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                firstName: new FormField({
                    value: 'Jon',
                    htmlValue: 'Jon',
                    valid: true,
                    mandatory: true,
                    htmlName: 'dwfrm_shippingaddress_firstName',
                    dynamicHtmlName: 'dwfrm_shippingaddress_firstName_asdf8979asd8f',
                    type: 1,
                    FIELD_TYPE_STRING: 1,
                    label: 'hello',
                    regEx: '/[a-zA-Z]*/',
                    maxLength: 50,
                    minLength: 1
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isTrue(currentForm.valid);
        assert.isNull(currentForm.error);
        assert.equal(currentForm.htmlName, 'dwfrm_shippingaddress');
        assert.isNotNull(currentForm.firstName);
    });

    it('should load a form with correct string form fields', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                firstName: new FormField({
                    value: 'Jon',
                    htmlValue: 'Jon',
                    valid: true,
                    mandatory: true,
                    htmlName: 'dwfrm_shippingaddress_firstName',
                    dynamicHtmlName: 'dwfrm_shippingaddress_firstName_asdf8979asd8f',
                    type: 1,
                    FIELD_TYPE_STRING: 1,
                    label: 'hello',
                    regEx: '/[a-zA-Z]*/',
                    maxLength: 50,
                    minLength: 1
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.firstName);
        assert.equal(currentForm.firstName.value, 'Jon');
        assert.equal(currentForm.firstName.htmlValue, 'Jon');
        assert.isTrue(currentForm.firstName.valid);
        assert.isUndefined(currentForm.firstName.error);
        assert.isTrue(currentForm.firstName.mandatory);
        assert.equal(currentForm.firstName.label, 'hello');
        assert.equal(currentForm.firstName.attributes, 'name = "dwfrm_shippingaddress_firstName" required value = "Jon" maxLength = "50" minLength = "1" pattern = "/[a-zA-Z]*/"');
    });

    it('should load a form with correct bool form fields', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                boolField: new FormField({
                    value: true,
                    selected: true,
                    checked: true,
                    htmlValue: true,
                    htmlName: 'dwfrm_shippingaddress_boolField',
                    dynamicHtmlName: 'dwfrm_shippingaddress_boolField_a89sa7d9f8a7sd',
                    type: 2,
                    FIELD_TYPE_BOOLEAN: 2,
                    valid: false,
                    error: 'Found an issue'
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.boolField);
        assert.equal(currentForm.boolField.value, true);
        assert.equal(currentForm.boolField.htmlValue, true);
        assert.isFalse(currentForm.boolField.valid);
        assert.equal(currentForm.boolField.error, 'Found an issue');
        assert.equal(currentForm.boolField.attributes, 'name = "dwfrm_shippingaddress_boolField"');
    });

    it('should load a form with correct int form fields', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                intField: new FormField({
                    value: null,
                    htmlValue: null,
                    mandatory: true,
                    htmlName: 'dwfrm_shippingaddress_intField',
                    dynamicHtmlName: 'dwfrm_shippingaddress_intField_as8df7asd98',
                    type: 3,
                    FIELD_TYPE_INTEGER: 3,
                    maxValue: 999,
                    minValue: 1,
                    valid: true
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.intField);
        assert.equal(currentForm.intField.value, '');
        assert.equal(currentForm.intField.htmlValue, '');
        assert.isTrue(currentForm.intField.valid);
        assert.isUndefined(currentForm.intField.error);
        assert.isTrue(currentForm.intField.mandatory);
        assert.equal(currentForm.intField.attributes, 'name = "dwfrm_shippingaddress_intField" required value = "" max = "999" min = "1"');
    });

    it('should load a form with correct date form fields', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                dateField: new FormField({
                    value: null,
                    htmlValue: null,
                    mandatory: true,
                    htmlName: 'dwfrm_shippingaddress_dateField',
                    dynamicHtmlName: 'dwfrm_shippingaddress_dateField_as8df7asd98',
                    type: 4,
                    FIELD_TYPE_DATE: 4,
                    valid: true
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.dateField);
        assert.equal(currentForm.dateField.value, '');
        assert.equal(currentForm.dateField.htmlValue, '');
        assert.isTrue(currentForm.dateField.valid);
        assert.isUndefined(currentForm.dateField.error);
        assert.isTrue(currentForm.dateField.mandatory);
        assert.equal(currentForm.dateField.attributes, 'name = "dwfrm_shippingaddress_dateField" required value = ""');
    });

    it('should load a form with correct string form field with options', function () {
        var Options = function () {};
        Options.prototype = [];
        var options = new Options();
        options.push({
            checked: false,
            htmlValue: 'hello',
            optionId: 1,
            selected: false,
            value: 'hello'
        });
        options.push({
            checked: true,
            htmlValue: 'goodbye',
            optionId: 2,
            selected: true,
            value: 'goodbye',
            label: 'label'
        });
        options.optionsCount = 2;
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                firstName: new FormField({
                    value: 'Jon',
                    htmlValue: 'Jon',
                    valid: true,
                    mandatory: true,
                    htmlName: 'dwfrm_shippingaddress_firstName',
                    dynamicHtmlName: 'dwfrm_shippingaddress_firstName_asdf8979asd8f',
                    type: 1,
                    FIELD_TYPE_STRING: 1,
                    options: options,
                    selectedOption: {
                        optionId: 2
                    }
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.firstName);
        assert.isNotNull(currentForm.firstName.options);
        assert.equal(currentForm.firstName.options.length, 2);
        assert.equal(currentForm.firstName.options[0].id, 1);
        assert.isFalse(currentForm.firstName.options[0].selected);
        assert.equal(currentForm.firstName.options[1].id, 2);
        assert.isTrue(currentForm.firstName.options[1].selected);
        assert.equal(currentForm.firstName.selectedOption, 2);
    });

    it('should load a form with correct actions', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                action: new FormAction({
                    submitted: false,
                    triggered: false
                }),
                action2: new FormAction({
                    description: 'Some action',
                    label: 'My action',
                    submitted: true,
                    triggered: true
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.action);
        assert.isFalse(currentForm.action.submitted);
        assert.isFalse(currentForm.action.triggered);
        assert.isNull(currentForm.action.description);
        assert.isNotNull(currentForm.action2);
        assert.isTrue(currentForm.action2.submitted);
        assert.isTrue(currentForm.action2.triggered);
        assert.equal(currentForm.action2.description, 'Some action');
        assert.equal(currentForm.action2.label, 'My action');
    });
    it('should load a form with another form embeded', function () {
        var session = { forms: {
            shippingaddress: {
                valid: true,
                error: null,
                htmlName: 'dwfrm_shippingaddress',
                dynamicHtmlName: 'dwfrm_shippingaddress_a98dfa9sd8',
                innerForm: new FormGroup({
                    valid: true,
                    error: null,
                    htmlName: 'dwfrm_shippingaddress_innerForm',
                    dynamicHtmlName: 'dwfrm_shippingaddress_innerForm_a90a9s8fasd',
                    firstName: new FormField({
                        value: 'Jon',
                        htmlValue: 'Jon',
                        valid: true,
                        mandatory: true,
                        htmlName: 'dwfrm_shippingaddress_innerForm_firstName',
                        dynamicHtmlName: 'dwfrm_shippingaddress_innerForm_firstName_asdf8979asd8f',
                        type: 1,
                        FIELD_TYPE_STRING: 1,
                        label: 'hello',
                        regEx: '/[a-zA-Z]*/',
                        maxLength: 50,
                        minLength: 1
                    })
                })
            }
        } };
        var forms = formsRequire(session);
        var currentForm = forms.getForm('shippingaddress');
        assert.isNotNull(currentForm.innerForm.firstName);
        assert.equal(currentForm.innerForm.firstName.value, 'Jon');
        assert.equal(currentForm.innerForm.firstName.htmlValue, 'Jon');
        assert.isTrue(currentForm.innerForm.firstName.valid);
        assert.isUndefined(currentForm.innerForm.firstName.error);
        assert.isTrue(currentForm.innerForm.firstName.mandatory);
        assert.equal(currentForm.innerForm.firstName.label, 'hello');
        assert.equal(currentForm.innerForm.firstName.attributes, 'name = "dwfrm_shippingaddress_innerForm_firstName" required value = "Jon" maxLength = "50" minLength = "1" pattern = "/[a-zA-Z]*/"');
    });
});
