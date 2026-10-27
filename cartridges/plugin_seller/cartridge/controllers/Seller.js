'use strict';

/**
 * Seller Central pages. Every change is a CSRF-protected POST that redirects back with a
 * message. The seller is found from the signed-in customer (sellerHelpers.getSellerContext),
 * never from request parameters.
 */

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

var LOGIN_SLOT = 7;
var FLASH = 'sellerFlash';
var PAGE_SIZE = 20;

/**
 * Sends signed-out visitors to the login page, back to Seller Central afterwards.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Function} next - next middleware
 * @returns {void}
 */
function requireLogin(req, res, next) {
    if (!req.currentCustomer.profile) {
        res.redirect(URLUtils.url('Login-Show', 'rurl', LOGIN_SLOT));
        return this.done(req, res);
    }
    return next();
}

/**
 * @param {Object} req - request
 * @param {Object} flash - {message} or {error, fields, problems}
 */
function setFlash(req, flash) {
    req.session.privacyCache.set(FLASH, JSON.stringify(flash));
}

/**
 * @param {Object} req - request
 * @returns {?Object} flash message, read once
 */
function takeFlash(req) {
    var raw = req.session.privacyCache.get(FLASH);
    req.session.privacyCache.set(FLASH, null);
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Saves the outcome of an action as the flash message and redirects.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Object} result - helper result
 * @param {string} message - success message key (flash.<message>)
 * @param {dw.web.URL} successUrl - target after success
 * @param {dw.web.URL} errorUrl - target after an error
 */
function finish(req, res, result, message, successUrl, errorUrl) {
    if (result.error) {
        setFlash(req, { error: result.errorCode, fields: result.fields, problems: result.problems });
        res.redirect(errorUrl);
    } else {
        setFlash(req, { message: message });
        res.redirect(successUrl);
    }
}

/**
 * @param {Object} req - request
 * @param {string} permission - required permission
 * @returns {Object} seller context, or an error result
 */
function getContext(req, permission) {
    return require('*/cartridge/scripts/helpers/sellerHelpers').getSellerContext(req.currentCustomer.raw, permission);
}

/**
 * Renders a Seller Central page, or the access page when the customer lacks the permission.
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {string} template - template
 * @param {Object} context - seller context or error result
 * @param {Object} data - page data
 */
function renderPage(req, res, template, context, data) {
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    if (context.error) {
        if (context.notSeller) {
            res.redirect(URLUtils.url('Seller-Show'));
            return;
        }
        res.setStatusCode(context.errorCode === 'disabled' ? 404 : 403);
        res.render('seller/denied', { reason: context.errorCode });
        return;
    }
    var viewData = data || {};
    viewData.seller = sellerHelpers.getSellerView(context.seller);
    viewData.role = context.role;
    viewData.can = sellerHelpers.getPermissions(req.currentCustomer.raw);
    viewData.flash = viewData.flash || takeFlash(req);
    viewData.active = template;
    res.render(template, viewData);
}

/**
 * @param {Object} req - request
 * @returns {?number} posted revision, or null
 */
function getRevision(req) {
    var value = req.form.revision;
    return value === undefined || value === '' ? null : Number(value);
}

/**
 * @param {Object} req - request
 * @returns {number} page offset from the query string
 */
function getOffset(req) {
    var n = Number(req.querystring.offset);
    return n > 0 && n < 100000 ? Math.floor(n) : 0;
}

/**
 * @param {Object} req - request
 * @returns {?string} status filter from the query string
 */
function getStatusFilter(req) {
    return /^[A-Z_]{3,30}$/.test(String(req.querystring.status || '')) ? String(req.querystring.status) : null;
}

/**
 * @param {Object} form - sellerApplication form
 * @returns {Object} application fields for sellerHelpers
 */
function getApplicationData(form) {
    return {
        sellerId: form.sellerId.value,
        displayName: form.displayName.value,
        legalName: form.legalName.value,
        businessType: form.businessType.value,
        registrationNumber: form.registrationNumber.value,
        taxId: form.taxId.value,
        address: { line1: form.line1.value, line2: form.line2.value, city: form.city.value, stateCode: form.stateCode.value, postalCode: form.postalCode.value },
        contactName: form.contactName.value,
        contactEmail: form.contactEmail.value,
        contactPhone: form.contactPhone.value,
        website: form.website.value,
        categories: form.categories.value || undefined,
        agreementAccepted: form.agreementAccepted.checked,
        agreementVersion: form.agreementVersion.value
    };
}

/**
 * @param {Object} form - SFRA form
 * @returns {Object} result for an invalid form
 */
function invalidForm(form) {
    var result = require('*/cartridge/scripts/helpers/marketplaceHelpers').errorResult('invalid');
    result.fields = require('*/cartridge/scripts/formErrors').getFormErrors(form);
    return result;
}

server.get('Show', server.middleware.https, function (req, res, next) {
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    if (!require('*/cartridge/scripts/helpers/marketplaceHelpers').isMarketplaceEnabled()) {
        res.setStatusCode(404);
        res.render('seller/denied', { reason: 'disabled' });
        return next();
    }
    var membership = sellerHelpers.getMembership(req.currentCustomer.raw);
    if (membership) {
        res.redirect(URLUtils.url(['APPROVED', 'SUSPENDED', 'TERMINATED'].indexOf(membership.seller.custom.status) >= 0 ? 'Seller-Dashboard' : 'Seller-Application'));
        return next();
    }
    res.render('seller/landing', { open: sellerHelpers.isRegistrationOpen(), signedIn: !!req.currentCustomer.profile, agreementAssetId: sellerHelpers.getPreference('sellerAgreementContentAssetId') });
    return next();
});

server.get('Apply', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    if (!sellerHelpers.isRegistrationOpen()) {
        res.redirect(URLUtils.url('Seller-Show'));
        return next();
    }
    if (sellerHelpers.getMembership(req.currentCustomer.raw)) {
        res.redirect(URLUtils.url('Seller-Application'));
        return next();
    }
    var flash = takeFlash(req);
    var applicationForm = server.forms.getForm('sellerApplication');
    // after a failed POST the session form still holds what the customer typed
    if (!flash || !flash.error) {
        applicationForm.clear();
        applicationForm.contactEmail.value = req.currentCustomer.profile.email;
    }
    applicationForm.agreementVersion.value = sellerHelpers.getPreference('sellerAgreementVersion');
    res.render('seller/apply', {
        applicationForm: applicationForm,
        flash: flash,
        agreementVersion: sellerHelpers.getPreference('sellerAgreementVersion'),
        agreementAssetId: sellerHelpers.getPreference('sellerAgreementContentAssetId'),
        states: sellerHelpers.US_STATES,
        businessTypes: sellerHelpers.BUSINESS_TYPES,
        isNew: true
    });
    return next();
});

server.post('SubmitApply', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var applicationForm = server.forms.getForm('sellerApplication');
    var result = applicationForm.valid
        ? require('*/cartridge/scripts/helpers/sellerHelpers').applyAsSeller(req.currentCustomer.raw, getApplicationData(applicationForm))
        : invalidForm(applicationForm);
    finish(req, res, result, 'application-started', URLUtils.url('Seller-Application'), URLUtils.url('Seller-Apply'));
    return next();
});

server.get('Application', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var documentHelpers = require('*/cartridge/scripts/helpers/sellerDocumentHelpers');
    var context = getContext(req, 'profile.read');
    var flash = takeFlash(req);
    var data = { flash: flash };
    if (!context.error) {
        var view = sellerHelpers.getSellerView(context.seller);
        var applicationForm = server.forms.getForm('sellerApplication');
        if (!flash || !flash.error) {
            applicationForm.clear();
            applicationForm.copyFrom({
                displayName: view.displayName, legalName: view.legalName, businessType: view.businessType, registrationNumber: view.registrationNumber,
                line1: view.address.line1, line2: view.address.line2, city: view.address.city, stateCode: view.address.stateCode, postalCode: view.address.postalCode,
                contactName: view.contactName, contactEmail: view.contactEmail, contactPhone: view.contactPhone, website: view.website
            });
            // SFRA copyFrom only flags the options of an options field; the select renders from htmlValue
            applicationForm.businessType.htmlValue = view.businessType;
        }
        data = {
            flash: flash,
            applicationForm: applicationForm,
            documents: documentHelpers.getDocuments(context.sellerId),
            documentTypes: documentHelpers.DOCUMENT_TYPES,
            requiredTypes: sellerHelpers.getListPreference('sellerRequiredDocumentTypes'),
            problems: context.seller.custom.status === 'DRAFT' ? documentHelpers.getApplicationProblems(context.sellerId) : [],
            states: sellerHelpers.US_STATES,
            businessTypes: sellerHelpers.BUSINESS_TYPES,
            taxIdLast4: view.taxIdLast4,
            maxMegabytes: String(Math.floor(sellerHelpers.getPreference('sellerDocumentMaxBytes') / 1048576))
        };
    }
    renderPage(req, res, 'seller/application', context, data);
    return next();
});

server.post('SaveApplication', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'application.write');
    var applicationForm = server.forms.getForm('sellerApplication');
    var result = context;
    if (!context.error) {
        var data = getApplicationData(applicationForm);
        if (!data.taxId) delete data.taxId;
        delete data.categories;
        result = applicationForm.valid ? require('*/cartridge/scripts/helpers/sellerHelpers').updateApplication(context, data, getRevision(req)) : invalidForm(applicationForm);
    }
    finish(req, res, result, 'saved', URLUtils.url('Seller-Application'), URLUtils.url('Seller-Application'));
    return next();
});

server.post('SendCode', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'application.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerHelpers').sendVerificationCode(context, String(req.session.raw.sessionID));
    finish(req, res, result, 'code-sent', URLUtils.url('Seller-Application'), URLUtils.url('Seller-Application'));
    return next();
});

server.post('VerifyCode', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'application.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerHelpers').verifyEmailCode(context, String(req.form.code || '').trim(), String(req.session.raw.sessionID));
    finish(req, res, result, 'email-verified', URLUtils.url('Seller-Application'), URLUtils.url('Seller-Application'));
    return next();
});

server.post('UploadDocument', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'profile.read');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerDocumentHelpers').uploadDocument(context, request.httpParameterMap);
    var back = String(req.form.back) === 'settings' ? URLUtils.url('Seller-Settings') : URLUtils.url('Seller-Application');
    finish(req, res, result, 'document-uploaded', back, back);
    return next();
});

server.post('WithdrawDocument', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'application.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerDocumentHelpers').withdrawDocument(context, String(req.form.documentId || ''));
    finish(req, res, result, 'document-withdrawn', URLUtils.url('Seller-Application'), URLUtils.url('Seller-Application'));
    return next();
});

server.post('SubmitApplication', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'application.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerHelpers').submitApplication(context);
    finish(req, res, result, 'application-submitted', result.redirectUrl || URLUtils.url('Seller-Application'), URLUtils.url('Seller-Application'));
    return next();
});

server.get('Dashboard', server.middleware.https, requireLogin, function (req, res, next) {
    var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
    var context = getContext(req, 'profile.read');
    var data = {};
    if (!context.error && ['APPROVED', 'SUSPENDED', 'TERMINATED'].indexOf(context.seller.custom.status) < 0) {
        data.pending = true;
    } else if (!context.error) {
        var id = context.sellerId;
        data.counts = {
            awaiting: marketplaceHelpers.queryCount('MarketplaceSellerOrder', 'custom.sellerId = {0} AND (custom.status = {1} OR custom.status = {2})', [id, 'AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED']),
            late: marketplaceHelpers.queryCount('MarketplaceSellerOrder', 'custom.sellerId = {0} AND (custom.status = {1} OR custom.status = {2}) AND custom.promisedShipBy < {3}', [id, 'AWAITING_FULFILLMENT', 'PARTIALLY_SHIPPED', new Date()]),
            activeOffers: marketplaceHelpers.queryCount('MarketplaceOffer', 'custom.sellerId = {0} AND custom.status = {1}', [id, 'ACTIVE']),
            inReview: marketplaceHelpers.queryCount('MarketplaceSubmission', 'custom.sellerId = {0} AND (custom.status = {1} OR custom.status = {2})', [id, 'SUBMITTED', 'UNDER_REVIEW']),
            openCases: marketplaceHelpers.queryCount('MarketplaceCase', 'custom.sellerId = {0} AND custom.visibleToSeller = {1} AND (custom.status = {2} OR custom.status = {3})', [id, true, 'OPEN', 'IN_PROGRESS'])
        };
        data.metrics = marketplaceHelpers.parseJson(context.seller.custom.metrics, null);
        if (context.role === 'OWNER' || context.role === 'FINANCE') data.balances = require('*/cartridge/scripts/helpers/sellerOrderHelpers').getBalances(id);
    }
    renderPage(req, res, 'seller/dashboard', context, data);
    return next();
});

server.get('Products', server.middleware.https, requireLogin, function (req, res, next) {
    var context = getContext(req, 'catalog.read');
    var offset = getOffset(req);
    var data = context.error ? {} : { list: require('*/cartridge/scripts/helpers/productSubmissionHelpers').getSellerSubmissions(context, getStatusFilter(req), offset, PAGE_SIZE), offset: offset, pageSize: PAGE_SIZE, status: getStatusFilter(req) };
    renderPage(req, res, 'seller/products', context, data);
    return next();
});

server.get('Product', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var submissionHelpers = require('*/cartridge/scripts/helpers/productSubmissionHelpers');
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var context = getContext(req, 'catalog.write');
    var data = {};
    if (!context.error) {
        var id = String(req.querystring.id || '');
        var submission = id ? submissionHelpers.getOwnSubmission(context, id) : null;
        var productForm = server.forms.getForm('sellerProduct');
        productForm.clear();
        var view = submission ? submissionHelpers.getSubmissionView(submission) : null;
        if (view) {
            var p = view.payload;
            productForm.copyFrom({
                mode: p.mode, productId: p.productId, sellerSku: p.sellerSku, name: p.name, shortDescription: p.shortDescription, longDescription: p.longDescription, brand: p.brand,
                categoryId: p.categoryId, productType: p.productType, gtin: p.gtin, price: typeof p.priceCents === 'number' ? (p.priceCents / 100).toFixed(2) : '', quantity: p.quantity,
                taxClassId: p.taxClassId, weightOz: p.weightOz, lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn, returnDays: p.returnDays, warranty: p.warranty,
                specifications: (p.specifications || []).join('\n'), complianceDocumentIds: (p.complianceDocumentIds || []).join(', '),
                variants: (p.variants || []).map(function (v) { return [v.sellerSku, v.values.color || '', v.values.size || '', v.quantity, v.priceCents ? (v.priceCents / 100).toFixed(2) : '', v.gtin || ''].join(','); }).join('\n')
            });
            productForm.returnable.checked = p.returnable !== false;
            // options fields: copyFrom does not set htmlValue, which the selects render from
            productForm.mode.htmlValue = p.mode;
            productForm.productType.htmlValue = p.productType;
        }
        data = {
            productForm: productForm,
            submission: view,
            categories: sellerHelpers.getListPreference('sellerAllowedCategoryIds'),
            taxClasses: sellerHelpers.getListPreference('sellerAllowedTaxClassIds'),
            maxImages: String(sellerHelpers.getPreference('sellerMaxImagesPerProduct'))
        };
    }
    renderPage(req, res, 'seller/product-form', context, data);
    return next();
});

/**
 * @param {Object} form - sellerProduct form
 * @returns {Object} submission fields; variants come one per line as "sku,color,size,quantity,price,gtin"
 */
function getProductData(form) {
    var data = {};
    ['mode', 'productId', 'sellerSku', 'name', 'shortDescription', 'longDescription', 'brand', 'categoryId', 'productType', 'gtin', 'price', 'quantity',
        'taxClassId', 'weightOz', 'lengthIn', 'widthIn', 'heightIn', 'returnDays', 'warranty', 'specifications', 'complianceDocumentIds'].forEach(function (name) {
        if (form[name].value !== null && form[name].value !== '') data[name] = form[name].value;
    });
    data.returnable = form.returnable.checked;
    if (form.variants.value) {
        data.variants = String(form.variants.value).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
            var parts = line.split(',').map(function (p) { return p.trim(); });
            return { sellerSku: parts[0], color: parts[1], size: parts[2], quantity: parts[3], price: parts[4], gtin: parts[5] };
        });
    }
    return data;
}

server.post('SaveProduct', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var submissionHelpers = require('*/cartridge/scripts/helpers/productSubmissionHelpers');
    var context = getContext(req, 'catalog.write');
    var productForm = server.forms.getForm('sellerProduct');
    var id = String(req.form.submissionId || '');
    var result = context;
    if (!context.error && !productForm.valid) result = invalidForm(productForm);
    else if (!context.error) result = id ? submissionHelpers.updateDraft(context, id, getProductData(productForm), getRevision(req)) : submissionHelpers.createDraft(context, getProductData(productForm));
    var savedId = result.submissionView ? result.submissionView.submissionId : id;
    finish(req, res, result, 'draft-saved', URLUtils.url('Seller-Product', 'id', savedId), id ? URLUtils.url('Seller-Product', 'id', id) : URLUtils.url('Seller-Product'));
    return next();
});

server.post('UploadImages', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'catalog.write');
    var id = String(req.form.submissionId || '');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').addImages(context, id, request.httpParameterMap);
    finish(req, res, result, 'images-uploaded', URLUtils.url('Seller-Product', 'id', id), URLUtils.url('Seller-Product', 'id', id));
    return next();
});

server.post('RemoveImage', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'catalog.write');
    var id = String(req.form.submissionId || '');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').removeImage(context, id, Number(req.form.index));
    finish(req, res, result, 'image-removed', URLUtils.url('Seller-Product', 'id', id), URLUtils.url('Seller-Product', 'id', id));
    return next();
});

server.post('SubmitProduct', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'catalog.write');
    var id = String(req.form.submissionId || '');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/productSubmissionHelpers').submitProduct(context, id);
    finish(req, res, result, 'product-submitted', URLUtils.url('Seller-Products'), URLUtils.url('Seller-Product', 'id', id));
    return next();
});

server.get('Offers', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var context = getContext(req, 'catalog.read');
    var offset = getOffset(req);
    var data = context.error ? {} : { list: require('*/cartridge/scripts/helpers/offerHelpers').getSellerOffers(context, getStatusFilter(req), offset, PAGE_SIZE), offset: offset, pageSize: PAGE_SIZE, status: getStatusFilter(req) };
    renderPage(req, res, 'seller/offers', context, data);
    return next();
});

server.get('Offer', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');
    var context = getContext(req, 'catalog.write');
    var data = {};
    if (!context.error) {
        var pid = String(req.querystring.pid || '');
        var offer = pid ? require('dw/object/CustomObjectMgr').getCustomObject('MarketplaceOffer', context.sellerId + ':' + pid) : null;
        var product = pid ? require('dw/catalog/ProductMgr').getProduct(pid) : null;
        var offerForm = server.forms.getForm('sellerOffer');
        offerForm.clear();
        var view = offer ? offerHelpers.getOfferView(offer) : null;
        if (view) {
            offerForm.copyFrom({ price: (view.priceCents / 100).toFixed(2), sellerSku: view.sellerSku, condition: view.condition, handlingDays: view.handlingDays, returnDays: view.returnDays, warranty: view.warranty });
            offerForm.returnable.checked = view.returnable !== false;
            offerForm.active.checked = view.status === 'ACTIVE';
            // options field: copyFrom does not set htmlValue, which the select renders from
            offerForm.condition.htmlValue = view.condition;
        } else {
            offerForm.returnable.checked = true;
        }
        data = { offerForm: offerForm, pid: pid, offer: view, productName: product ? product.name : null };
    }
    renderPage(req, res, 'seller/offer-form', context, data);
    return next();
});

server.post('SaveOffer', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');
    var context = getContext(req, 'catalog.write');
    var offerForm = server.forms.getForm('sellerOffer');
    var pid = String(req.form.pid || '');
    var result = context;
    if (!context.error && !offerForm.valid) {
        result = invalidForm(offerForm);
    } else if (!context.error) {
        var data = {
            price: offerForm.price.value, sellerSku: offerForm.sellerSku.value, condition: offerForm.condition.value, handlingDays: offerForm.handlingDays.value,
            returnable: offerForm.returnable.checked, returnDays: offerForm.returnDays.value, warranty: offerForm.warranty.value
        };
        if (require('dw/object/CustomObjectMgr').getCustomObject('MarketplaceOffer', context.sellerId + ':' + pid)) {
            data.active = offerForm.active.checked;
            result = offerHelpers.updateOffer(context, pid, data, getRevision(req));
        } else {
            data.quantity = offerForm.quantity.value;
            result = offerHelpers.createOffer(context, pid, data);
        }
    }
    finish(req, res, result, 'offer-saved', URLUtils.url('Seller-Offers'), URLUtils.url('Seller-Offer', 'pid', pid));
    return next();
});

server.post('SetStock', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'catalog.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/offerHelpers').setOfferStock(context, String(req.form.pid || ''), req.form.quantity);
    finish(req, res, result, 'stock-saved', URLUtils.url('Seller-Offers'), URLUtils.url('Seller-Offers'));
    return next();
});

server.get('Orders', server.middleware.https, requireLogin, function (req, res, next) {
    var context = getContext(req, 'orders.read');
    var offset = getOffset(req);
    var data = context.error ? {} : { list: require('*/cartridge/scripts/helpers/sellerOrderHelpers').getSellerOrders(context, getStatusFilter(req), offset, PAGE_SIZE), offset: offset, pageSize: PAGE_SIZE, status: getStatusFilter(req) };
    renderPage(req, res, 'seller/orders', context, data);
    return next();
});

server.get('Order', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
    var context = getContext(req, 'orders.read');
    var data = {};
    if (!context.error) {
        var order = orderHelpers.getSellerOrderDetail(context, String(req.querystring.orderNo || ''));
        if (!order) {
            res.setStatusCode(404);
            data.flash = { error: 'not-found' };
        }
        data.order = order;
        data.carriers = orderHelpers.CARRIERS;
        data.shipmentKey = require('*/cartridge/scripts/helpers/marketplaceHelpers').randomHex(16);
    }
    renderPage(req, res, 'seller/order', context, data);
    return next();
});

server.post('Ship', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'orders.write');
    var f = req.form;
    var result = context;
    if (!context.error) {
        var lines = [];
        Object.keys(f).forEach(function (name) {
            var match = /^qty_([A-Za-z0-9]+)$/.exec(name);
            if (match && Number(f[name]) > 0) lines.push({ lineId: match[1], quantity: Number(f[name]) });
        });
        result = require('*/cartridge/scripts/helpers/sellerOrderHelpers').shipOrder(context, String(f.orderNo || ''), { carrier: f.carrier, trackingNumber: f.trackingNumber, lines: lines }, f.shipmentKey);
    }
    var back = URLUtils.url('Seller-Order', 'orderNo', String(f.orderNo || ''));
    finish(req, res, result, 'shipment-recorded', back, back);
    return next();
});

server.post('RequestCancel', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'orders.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerOrderHelpers').requestCancellation(context, String(req.form.orderNo || ''), { lineId: req.form.lineId, quantity: req.form.quantity, reason: req.form.reason });
    var back = URLUtils.url('Seller-Order', 'orderNo', String(req.form.orderNo || ''));
    finish(req, res, result, 'cancel-requested', back, back);
    return next();
});

server.get('Finance', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var orderHelpers = require('*/cartridge/scripts/helpers/sellerOrderHelpers');
    var context = getContext(req, 'finance.read');
    var offset = getOffset(req);
    var data = context.error ? {} : {
        balances: orderHelpers.getBalances(context.sellerId),
        entries: orderHelpers.getLedgerEntries(context.sellerId, null, offset, PAGE_SIZE),
        settlements: require('*/cartridge/scripts/helpers/settlementHelpers').getSellerSettlements(context.sellerId, 0, 10),
        offset: offset,
        pageSize: PAGE_SIZE
    };
    renderPage(req, res, 'seller/finance', context, data);
    return next();
});

server.get('Statement', server.middleware.https, requireLogin, function (req, res, next) {
    var context = getContext(req, 'finance.read');
    var statement = context.error ? null : require('*/cartridge/scripts/helpers/settlementHelpers').getStatement(context.sellerId, String(req.querystring.id || ''));
    if (!context.error && !statement) {
        res.redirect(URLUtils.url('Seller-Finance'));
        return next();
    }
    renderPage(req, res, 'seller/statement', context, { statement: statement });
    return next();
});

server.post('PayoutAccount', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'finance.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/sellerHelpers').startPayoutAccount(context, URLUtils.https('Seller-Finance').toString());
    finish(req, res, result, 'payout-account-started', result.redirectUrl || URLUtils.url('Seller-Finance'), URLUtils.url('Seller-Finance'));
    return next();
});

server.get('Cases', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var context = getContext(req, 'cases.read');
    var offset = getOffset(req);
    var data = context.error ? {} : { list: require('*/cartridge/scripts/helpers/caseHelpers').getSellerCases(context.sellerId, getStatusFilter(req), offset, PAGE_SIZE), offset: offset, pageSize: PAGE_SIZE };
    renderPage(req, res, 'seller/cases', context, data);
    return next();
});

server.post('RespondCase', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'cases.write');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/caseHelpers').answerCase(context, String(req.form.caseId || ''), req.form.message);
    finish(req, res, result, 'case-answered', URLUtils.url('Seller-Cases'), URLUtils.url('Seller-Cases'));
    return next();
});

server.get('Notifications', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var context = getContext(req, 'notifications.read');
    var offset = getOffset(req);
    var data = context.error ? {} : { inbox: require('*/cartridge/scripts/helpers/marketplaceHelpers').getInbox(context.sellerId, offset, PAGE_SIZE), offset: offset, pageSize: PAGE_SIZE };
    renderPage(req, res, 'seller/notifications', context, data);
    return next();
});

server.post('MarkRead', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'notifications.read');
    var result = context.error ? context : require('*/cartridge/scripts/helpers/marketplaceHelpers').markNotificationRead(context.sellerId, String(req.form.id || ''));
    finish(req, res, result, 'marked-read', URLUtils.url('Seller-Notifications'), URLUtils.url('Seller-Notifications'));
    return next();
});

server.get('Settings', server.middleware.https, requireLogin, csrfProtection.generateToken, function (req, res, next) {
    var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
    var documentHelpers = require('*/cartridge/scripts/helpers/sellerDocumentHelpers');
    var context = getContext(req, 'profile.read');
    var flash = takeFlash(req);
    var data = { flash: flash };
    if (!context.error) {
        var view = sellerHelpers.getSellerView(context.seller);
        var s = view.settings;
        var settingsForm = server.forms.getForm('sellerSettings');
        if (!flash || !flash.error) {
            settingsForm.clear();
            settingsForm.copyFrom({
                contactName: view.contactName, contactPhone: view.contactPhone, customerServiceEmail: s.customerServiceEmail, handlingDays: s.handlingDays, returnDays: s.returnDays,
                shippingFee: typeof s.shippingFeeCents === 'number' ? (s.shippingFeeCents / 100).toFixed(2) : '',
                freeShippingOver: typeof s.freeShippingOverCents === 'number' ? (s.freeShippingOverCents / 100).toFixed(2) : '',
                returnPolicy: s.returnPolicy
            });
            settingsForm.returnsAccepted.checked = s.returnsAccepted !== false;
        }
        data = {
            flash: flash,
            settingsForm: settingsForm,
            documents: documentHelpers.getDocuments(context.sellerId),
            documentTypes: documentHelpers.DOCUMENT_TYPES,
            documentBack: 'settings',
            maxMegabytes: String(Math.floor(sellerHelpers.getPreference('sellerDocumentMaxBytes') / 1048576)),
            shippingFeesEnabled: sellerHelpers.getPreference('sellerShippingFeesEnabled') === true
        };
    }
    renderPage(req, res, 'seller/settings', context, data);
    return next();
});

server.post('SaveSettings', server.middleware.https, requireLogin, csrfProtection.validateRequest, function (req, res, next) {
    var context = getContext(req, 'settings.write');
    var settingsForm = server.forms.getForm('sellerSettings');
    var result = context;
    if (!context.error && !settingsForm.valid) {
        result = invalidForm(settingsForm);
    } else if (!context.error) {
        result = require('*/cartridge/scripts/helpers/sellerHelpers').updateSettings(context, {
            contactName: settingsForm.contactName.value, contactPhone: settingsForm.contactPhone.value, customerServiceEmail: settingsForm.customerServiceEmail.value,
            handlingDays: settingsForm.handlingDays.value, shippingFee: settingsForm.shippingFee.value, freeShippingOver: settingsForm.freeShippingOver.value,
            returnsAccepted: settingsForm.returnsAccepted.checked, returnDays: settingsForm.returnDays.value, returnPolicy: settingsForm.returnPolicy.value
        }, getRevision(req));
    }
    finish(req, res, result, 'saved', URLUtils.url('Seller-Settings'), URLUtils.url('Seller-Settings'));
    return next();
});

module.exports = server.exports();
