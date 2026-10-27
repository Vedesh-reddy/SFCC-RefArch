'use strict';

/**
 * Catalog publishing and offer synchronization, run by jobs only.
 *
 * Products: approved submissions become catalog products, category assignments, marketplace
 * price book entries and seller inventory records, either as import files for the
 * platform's ImportCatalog / ImportPriceBook / ImportInventoryLists steps (IMPEX) or through
 * SCAPI Admin (SCAPI_ADMIN). A verify step reads the result back and only then marks the
 * submission PUBLISHED and activates its offers.
 *
 * Offers: changed stock and prices go to the seller inventory lists. For seller-created
 * products, the featured offer sets the marketplace price and the site inventory list holds
 * the sum of seller stock, so listing pages show what can really be bought.
 */

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var File = require('dw/io/File');
var Logger = require('dw/system/Logger');
var marketplaceHelpers = require('*/cartridge/scripts/helpers/marketplaceHelpers');
var sellerHelpers = require('*/cartridge/scripts/helpers/sellerHelpers');
var offerHelpers = require('*/cartridge/scripts/helpers/offerHelpers');

var log = Logger.getLogger('plugin-seller', 'seller-integration');
var SYSTEM = marketplaceHelpers.actor('SYSTEM', 'provisioning');
var STALE_MINUTES = 120;
var NS = {
    catalog: 'http://www.demandware.com/xml/impex/catalog/2006-10-31',
    pricebook: 'http://www.demandware.com/xml/impex/pricebook/2006-10-31',
    inventory: 'http://www.demandware.com/xml/impex/inventory/2007-05-31'
};
// Each job imports only its own folders, so publishing never consumes files of the offer sync.
var FOLDERS = {
    provision: { catalog: 'plugin-seller/provision/catalog', pricebook: 'plugin-seller/provision/pricebook', inventory: 'plugin-seller/provision/inventory' },
    sync: { catalog: 'plugin-seller/sync/catalog', pricebook: 'plugin-seller/sync/pricebook', inventory: 'plugin-seller/sync/inventory' }
};

/**
 * @returns {boolean} true when every catalog, price book and inventory preference is set
 */
function canPublish() {
    var ready = marketplaceHelpers.isMarketplaceEnabled() && ['sellerMasterCatalogId', 'sellerSiteCatalogId', 'sellerPriceBookId', 'sellerSiteInventoryListId'].every(function (id) {
        return !!sellerHelpers.getPreference(id);
    });
    return ready && (sellerHelpers.getEnumPreference('sellerProvisioningStrategy') !== 'SCAPI_ADMIN' || !!sellerHelpers.getPreference('sellerScapiOrganizationId'));
}

// ---------------------------------------------------------------- import XML

/**
 * @param {*} value - text
 * @returns {string} XML-escaped text
 */
function escapeXml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * @param {string} name - element name
 * @param {*} value - text; the element is left out when empty
 * @param {string} [attrs] - attributes
 * @returns {string} element or ''
 */
function element(name, value, attrs) {
    if (value === null || value === undefined || value === '') return '';
    return '<' + name + (attrs || '') + '>' + escapeXml(value) + '</' + name + '>';
}

/**
 * @param {Object} p - {productId, gtin, name, shortDescription, longDescription, online, searchable, images[], taxClassId, brand, custom{}, variation}
 * @returns {string} product element, children in XSD order
 */
function getProductXml(p) {
    var parts = ['<product product-id="' + escapeXml(p.productId) + '">'];
    parts.push(element('upc', p.gtin));
    parts.push(element('display-name', p.name, ' xml:lang="x-default"'));
    parts.push(element('short-description', p.shortDescription, ' xml:lang="x-default"'));
    parts.push(element('long-description', p.longDescription, ' xml:lang="x-default"'));
    if (p.online !== undefined) parts.push(element('online-flag', p.online ? 'true' : 'false'));
    if (p.searchable !== undefined) parts.push(element('searchable-flag', p.searchable ? 'true' : 'false'));
    if (p.images && p.images.length) {
        parts.push('<images><image-group view-type="large">' + p.images.map(function (path) { return '<image path="' + escapeXml(path) + '"/>'; }).join('') + '</image-group></images>');
    }
    parts.push(element('tax-class-id', p.taxClassId));
    parts.push(element('brand', p.brand));
    var custom = p.custom || {};
    var keys = Object.keys(custom).filter(function (k) { return custom[k] !== null && custom[k] !== undefined; });
    if (keys.length) {
        parts.push('<custom-attributes>' + keys.map(function (k) { return '<custom-attribute attribute-id="' + escapeXml(k) + '">' + escapeXml(custom[k]) + '</custom-attribute>'; }).join('') + '</custom-attributes>');
    }
    if (p.variation) {
        var attributes = p.variation.attributes.map(function (a) {
            var values = a.values.map(function (v) { return '<variation-attribute-value value="' + escapeXml(v) + '"><display-value xml:lang="x-default">' + escapeXml(v) + '</display-value></variation-attribute-value>'; }).join('');
            return '<variation-attribute attribute-id="' + escapeXml(a.id) + '" variation-attribute-id="' + escapeXml(a.id) + '"><variation-attribute-values>' + values + '</variation-attribute-values></variation-attribute>';
        }).join('');
        var variants = p.variation.variants.map(function (id) { return '<variant product-id="' + escapeXml(id) + '"/>'; }).join('');
        parts.push('<variations><attributes>' + attributes + '</attributes><variants>' + variants + '</variants></variations>');
    }
    parts.push('</product>');
    return parts.join('');
}

/**
 * @param {string} catalogId - catalog
 * @param {Object[]} products - products for getProductXml
 * @param {Object[]} assignments - {categoryId, productId, primary}
 * @returns {string} catalog import document
 */
function getCatalogXml(catalogId, products, assignments) {
    return '<?xml version="1.0" encoding="UTF-8"?><catalog xmlns="' + NS.catalog + '" catalog-id="' + escapeXml(catalogId) + '">'
        + (products || []).map(getProductXml).join('')
        + (assignments || []).map(function (a) {
            return '<category-assignment category-id="' + escapeXml(a.categoryId) + '" product-id="' + escapeXml(a.productId) + '">' + (a.primary ? '<primary-flag>true</primary-flag>' : '') + '</category-assignment>';
        }).join('')
        + '</catalog>';
}

/**
 * @param {string} priceBookId - price book
 * @param {Object[]} entries - {productId, cents}
 * @returns {string} price book import document
 */
function getPriceBookXml(priceBookId, entries) {
    return '<?xml version="1.0" encoding="UTF-8"?><pricebooks xmlns="' + NS.pricebook + '"><pricebook>'
        + '<header pricebook-id="' + escapeXml(priceBookId) + '"><currency>USD</currency></header><price-tables>'
        + entries.map(function (e) { return '<price-table product-id="' + escapeXml(e.productId) + '"><amount quantity="1">' + (e.cents / 100).toFixed(2) + '</amount></price-table>'; }).join('')
        + '</price-tables></pricebook></pricebooks>';
}

/**
 * @param {Object[]} lists - {listId, description, records: [{productId, allocation, timestamp}]}
 * @returns {string} inventory import document
 */
function getInventoryXml(lists) {
    var record = function (r) {
        return '<record product-id="' + escapeXml(r.productId) + '"><allocation>' + Math.max(0, Math.floor(r.allocation)) + '</allocation>'
            + '<allocation-timestamp>' + r.timestamp.toISOString() + '</allocation-timestamp><perpetual>false</perpetual><preorder-backorder-handling>none</preorder-backorder-handling></record>';
    };
    return '<?xml version="1.0" encoding="UTF-8"?><inventory xmlns="' + NS.inventory + '">' + lists.map(function (list) {
        return '<inventory-list><header list-id="' + escapeXml(list.listId) + '"><default-instock>false</default-instock>' + element('description', list.description)
            + '<use-bundle-inventory-only>false</use-bundle-inventory-only><on-order>false</on-order></header><records>' + list.records.map(record).join('') + '</records></inventory-list>';
    }).join('') + '</inventory>';
}

/**
 * Writes an import file under IMPEX/src (temporary name first, then renamed).
 * @param {string} folder - folder below IMPEX/src
 * @param {string} name - file name without extension
 * @param {string} content - XML
 */
function writeImportFile(folder, name, content) {
    var FileWriter = require('dw/io/FileWriter');
    var dir = new File(File.IMPEX + '/src/' + folder);
    if (!dir.exists()) dir.mkdirs();
    var temp = new File(dir, name + '.tmp');
    var writer = new FileWriter(temp, 'UTF-8');
    try {
        writer.write(content);
    } finally {
        writer.close();
    }
    var target = new File(dir, name + '.xml');
    if (target.exists()) target.remove();
    temp.renameTo(target);
}

// ---------------------------------------------------------------- publishing

/**
 * Copies a submission's staged images into the master catalog's static folder.
 * @param {dw.object.CustomObject} submission - submission
 * @returns {string[]} catalog-relative image paths
 */
function publishImages(submission) {
    var documents = require('*/cartridge/scripts/helpers/sellerDocumentHelpers');
    var relative = 'marketplace/' + submission.custom.sellerId + '/' + submission.custom.productId;
    var dir = new File(File.CATALOGS + '/' + sellerHelpers.getPreference('sellerMasterCatalogId') + '/default/' + relative);
    if (!dir.exists()) dir.mkdirs();
    return marketplaceHelpers.parseJson(submission.custom.images, []).map(function (image, index) {
        var source = documents.getStoredFile(image.path);
        if (!source) throw new Error('missing-image');
        var name = (index + 1) + '.' + image.extension;
        var target = new File(dir, name);
        if (target.exists()) target.remove();
        source.copyTo(target);
        return relative + '/' + name;
    });
}

/**
 * @param {dw.object.CustomObject} submission - submission
 * @param {Object} payload - payload
 * @param {string[]} images - catalog image paths
 * @returns {{products: Object[], sellable: Object[], categoryProductId: string}} catalog data
 */
function getCatalogData(submission, payload, images) {
    var productId = submission.custom.productId;
    var sellerId = submission.custom.sellerId;
    var main = {
        productId: productId,
        gtin: payload.productType === 'MASTER' ? null : payload.gtin,
        name: payload.name,
        shortDescription: payload.shortDescription,
        longDescription: payload.longDescription,
        online: true,
        searchable: true,
        images: images,
        taxClassId: payload.taxClassId,
        brand: payload.brand,
        custom: {
            mktOwnerSellerId: sellerId,
            mktSubmissionId: submission.custom.submissionId,
            mktSpecifications: payload.specifications && payload.specifications.length ? JSON.stringify(payload.specifications) : null,
            mktWarranty: payload.warranty || null,
            mktDimensions: payload.weightOz || payload.lengthIn ? JSON.stringify({ weightOz: payload.weightOz || 0, lengthIn: payload.lengthIn || 0, widthIn: payload.widthIn || 0, heightIn: payload.heightIn || 0 }) : null
        }
    };
    if (payload.productType !== 'MASTER') {
        return { products: [main], sellable: [{ productId: productId, cents: payload.priceCents, quantity: payload.quantity }], categoryProductId: productId };
    }
    var colorId = sellerHelpers.getPreference('sellerColorAttributeId');
    var sizeId = sellerHelpers.getPreference('sellerSizeAttributeId');
    var attributes = [];
    [[colorId, 'color'], [sizeId, 'size']].forEach(function (pair) {
        var values = [];
        payload.variants.forEach(function (v) {
            var value = v.values[pair[1]];
            if (value && values.indexOf(value) < 0) values.push(value);
        });
        if (values.length) attributes.push({ id: pair[0], values: values });
    });
    var variants = payload.variants.map(function (v) {
        var custom = { mktOwnerSellerId: sellerId, mktSubmissionId: submission.custom.submissionId };
        if (v.values.color) custom[colorId] = v.values.color;
        if (v.values.size) custom[sizeId] = v.values.size;
        return { productId: productId + '-' + v.sellerSku, gtin: v.gtin, name: payload.name, online: true, searchable: true, taxClassId: payload.taxClassId, brand: payload.brand, custom: custom, cents: v.priceCents || payload.priceCents, quantity: v.quantity };
    });
    main.variation = { attributes: attributes, variants: variants.map(function (v) { return v.productId; }) };
    return {
        products: variants.map(function (v) {
            var copy = Object.assign({}, v);
            delete copy.cents;
            delete copy.quantity;
            return copy;
        }).concat([main]),
        sellable: variants.map(function (v) { return { productId: v.productId, cents: v.cents, quantity: v.quantity }; }),
        categoryProductId: productId
    };
}

/**
 * @param {Object} p - catalog data product
 * @returns {Object} SCAPI Admin Product body
 */
function getScapiProduct(p) {
    var site = require('dw/system/Site').getCurrent().getID();
    var body = { id: p.productId, name: { default: p.name }, brand: p.brand || undefined, upc: p.gtin || undefined, taxClassId: p.taxClassId || undefined, onlineFlag: {}, searchable: {} };
    body.onlineFlag[site] = p.online !== false;
    body.searchable[site] = p.searchable !== false;
    if (p.shortDescription) body.shortDescription = { default: { markup: p.shortDescription, source: p.shortDescription } };
    if (p.longDescription) body.longDescription = { default: { markup: p.longDescription, source: p.longDescription } };
    if (p.images && p.images.length) body.imageGroups = [{ viewType: 'large', images: p.images.map(function (path) { return { path: path }; }) }];
    Object.keys(p.custom || {}).forEach(function (k) {
        if (p.custom[k] !== null && p.custom[k] !== undefined) body['c_' + k] = p.custom[k];
    });
    if (p.variation) {
        body.variationAttributes = p.variation.attributes.map(function (a) { return { id: a.id, attributeDefinitionId: a.id, values: a.values.map(function (v) { return { value: v, name: { default: v } }; }) }; });
    }
    return body;
}

/**
 * @param {dw.object.CustomObject} seller - seller
 * @param {Object} data - catalog data
 * @returns {?string} error text, or null when every call succeeded
 */
function publishWithScapi(seller, data) {
    var api = require('*/cartridge/scripts/services/scapiAdminService').client(sellerHelpers.getPreference('sellerScapiOrganizationId'));
    var listId = seller.custom.inventoryListId;
    var calls = [function () { return api.putInventoryList(listId, 'Marketplace seller ' + seller.custom.sellerId); }];
    data.products.forEach(function (p) { calls.push(function () { return api.putProduct(getScapiProduct(p)); }); });
    var master = data.products.filter(function (p) { return p.variation; })[0];
    if (master) calls.push(function () { return api.patchProduct(master.productId, { variants: master.variation.variants.map(function (id) { return { productId: id }; }) }); });
    calls.push(function () { return api.assignCategory(sellerHelpers.getPreference('sellerSiteCatalogId'), data.categoryId, data.categoryProductId); });
    data.sellable.forEach(function (s) {
        calls.push(function () { return api.putPrice(sellerHelpers.getPreference('sellerPriceBookId'), s.productId, s.cents); });
        calls.push(function () { return api.putInventoryRecord(listId, s.productId, s.quantity, new Date()); });
        calls.push(function () { return api.putInventoryRecord(sellerHelpers.getPreference('sellerSiteInventoryListId'), s.productId, s.quantity, new Date()); });
    });
    for (var i = 0; i < calls.length; i++) {
        var result = calls[i]();
        if (!result.ok) return 'scapi-' + result.status;
    }
    return null;
}

/**
 * Marks a publishing attempt failed; after the last attempt a case is opened.
 * @param {dw.object.CustomObject} submission - submission
 * @param {string} problem - error text
 */
function failPublishing(submission, problem) {
    var c = submission.custom;
    var exhausted = (c.provisionAttempts || 0) >= sellerHelpers.getPreference('sellerProvisioningMaxAttempts');
    Transaction.wrap(function () {
        var from = c.status;
        c.status = 'PROVISIONING_FAILED';
        c.lastError = String(problem).slice(0, 500);
        c.nextAttemptAt = exhausted ? null : new Date(Date.now() + sellerHelpers.getPreference('sellerProvisioningRetryMinutes') * 60000);
        c.updatedAt = new Date();
        marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: c.sellerId, action: 'PROVISIONING_FAILED', actor: SYSTEM, from: from, to: 'PROVISIONING_FAILED', detail: { error: String(problem).slice(0, 200), attempts: c.provisionAttempts } });
        if (exhausted) {
            require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'PROVISIONING_FAILED', sellerId: c.sellerId, entityId: c.submissionId, severity: 'HIGH', detail: { error: String(problem).slice(0, 200) }, dedupeKey: 'provision:' + c.submissionId });
            marketplaceHelpers.notify(c.sellerId, 'PROVISIONING_FAILED', { submissionId: c.submissionId });
        }
    });
    log.warn('Publishing of {0} failed: {1}', c.submissionId, problem);
}

/**
 * Job step: builds (or sends) the catalog data of due submissions.
 * @param {number} limit - maximum submissions per run
 * @returns {{prepared: number, failed: number}} counts
 */
function preparePublishing(limit) {
    var counts = { prepared: 0, failed: 0 };
    if (!canPublish()) {
        log.error('Publishing skipped: marketplace catalog preferences are incomplete');
        return counts;
    }
    var strategy = sellerHelpers.getEnumPreference('sellerProvisioningStrategy') || 'IMPEX';
    var maxAttempts = sellerHelpers.getPreference('sellerProvisioningMaxAttempts');
    var now = Date.now();
    var batchId = marketplaceHelpers.createId('BATCH');
    var files = { products: [], assignments: [], prices: [], inventory: {} };
    var due = marketplaceHelpers.queryPage('MarketplaceSubmission', 'custom.status = {0} OR custom.status = {1} OR custom.status = {2}', 'custom.updatedAt asc', ['APPROVED', 'PROVISIONING_FAILED', 'PROVISIONING'], 0, limit * 3).items.filter(function (s) {
        var c = s.custom;
        var ready = c.nextAttemptAt && c.nextAttemptAt.getTime() <= now;
        return (c.status === 'APPROVED' && ready) || (c.status === 'PROVISIONING_FAILED' && ready && (c.provisionAttempts || 0) < maxAttempts)
            || (c.status === 'PROVISIONING' && c.updatedAt && c.updatedAt.getTime() < now - STALE_MINUTES * 60000);
    }).slice(0, limit);
    due.forEach(function (submission) {
        var c = submission.custom;
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', c.sellerId);
        if (!seller || seller.custom.status !== 'APPROVED' || !seller.custom.inventoryListId) {
            failPublishing(submission, 'seller-not-approved');
            counts.failed += 1;
            return;
        }
        var payload = marketplaceHelpers.parseJson(c.payload, {});
        var data;
        try {
            data = getCatalogData(submission, payload, publishImages(submission));
            data.categoryId = payload.categoryId;
        } catch (e) {
            failPublishing(submission, e.message);
            counts.failed += 1;
            return;
        }
        Transaction.wrap(function () {
            var from = c.status;
            c.status = 'PROVISIONING';
            c.batchId = batchId;
            c.provisionAttempts = (c.provisionAttempts || 0) + 1;
            c.updatedAt = new Date();
            marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: c.sellerId, action: 'PROVISIONING', actor: SYSTEM, from: from, to: 'PROVISIONING', detail: { strategy: strategy } });
        });
        if (strategy === 'SCAPI_ADMIN') {
            var problem = publishWithScapi(seller, data);
            if (problem) {
                failPublishing(submission, problem);
                counts.failed += 1;
                return;
            }
        } else {
            var listId = seller.custom.inventoryListId;
            files.products = files.products.concat(data.products);
            files.assignments.push({ categoryId: data.categoryId, productId: data.categoryProductId, primary: true });
            if (!files.inventory[listId]) files.inventory[listId] = { listId: listId, description: 'Marketplace seller ' + c.sellerId, records: [] };
            data.sellable.forEach(function (s) {
                files.prices.push({ productId: s.productId, cents: s.cents });
                files.inventory[listId].records.push({ productId: s.productId, allocation: s.quantity, timestamp: new Date() });
            });
        }
        counts.prepared += 1;
    });
    if (strategy === 'IMPEX' && files.products.length) {
        var lists = Object.keys(files.inventory).map(function (k) { return files.inventory[k]; });
        var siteList = { listId: sellerHelpers.getPreference('sellerSiteInventoryListId'), description: null, records: [] };
        lists.forEach(function (l) { siteList.records = siteList.records.concat(l.records); });
        writeImportFile(FOLDERS.provision.catalog, '1-' + batchId + '-products', getCatalogXml(sellerHelpers.getPreference('sellerMasterCatalogId'), files.products, []));
        writeImportFile(FOLDERS.provision.catalog, '2-' + batchId + '-assignments', getCatalogXml(sellerHelpers.getPreference('sellerSiteCatalogId'), [], files.assignments));
        writeImportFile(FOLDERS.provision.pricebook, batchId, getPriceBookXml(sellerHelpers.getPreference('sellerPriceBookId'), files.prices));
        writeImportFile(FOLDERS.provision.inventory, batchId, getInventoryXml(lists.concat([siteList])));
    }
    marketplaceHelpers.saveJobState('provision-batch', { batchId: batchId, startedAt: new Date().toISOString(), strategy: strategy });
    return counts;
}

/**
 * @param {dw.object.CustomObject} submission - submission in PROVISIONING
 * @returns {?string} what is missing, or null when the catalog matches the submission
 */
function getPublishingProblem(submission) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var payload = marketplaceHelpers.parseJson(submission.custom.payload, {});
    var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', submission.custom.sellerId);
    var product = ProductMgr.getProduct(submission.custom.productId);
    if (!product) return 'product-missing';
    if (!product.online) return 'product-offline';
    var category = require('dw/catalog/CatalogMgr').getCategory(payload.categoryId);
    if (!category || !product.isAssignedToCategory(category)) return 'category-assignment-missing';
    var list = seller ? require('dw/catalog/ProductInventoryMgr').getInventoryList(seller.custom.inventoryListId) : null;
    if (!list) return 'inventory-list-missing';
    var sellable = payload.productType === 'MASTER'
        ? payload.variants.map(function (v) { return { productId: submission.custom.productId + '-' + v.sellerSku, cents: v.priceCents || payload.priceCents }; })
        : [{ productId: submission.custom.productId, cents: payload.priceCents }];
    for (var i = 0; i < sellable.length; i++) {
        var item = ProductMgr.getProduct(sellable[i].productId);
        if (!item) return 'variant-missing';
        var price = item.priceModel.getPriceBookPrice(sellerHelpers.getPreference('sellerPriceBookId'));
        if (!price || !price.available || marketplaceHelpers.centsOf(price) !== sellable[i].cents) return 'price-mismatch';
        if (!list.getRecord(item)) return 'inventory-record-missing';
    }
    return null;
}

/**
 * Job step: reads published data back and publishes what is complete.
 * @param {number} limit - maximum submissions
 * @returns {{published: number, failed: number}} counts
 */
function verifyPublishing(limit) {
    var counts = { published: 0, failed: 0 };
    var batch = marketplaceHelpers.getJobState('provision-batch');
    var startedAt = batch.startedAt ? new Date(batch.startedAt).getTime() : Date.now();
    var due = marketplaceHelpers.queryPage('MarketplaceSubmission', 'custom.status = {0}', 'custom.updatedAt asc', ['PROVISIONING'], 0, limit).items.filter(function (s) {
        return !batch.batchId || s.custom.batchId === batch.batchId;
    });
    due.forEach(function (submission) {
        var problem = getPublishingProblem(submission);
        if (problem) {
            failPublishing(submission, problem);
            counts.failed += 1;
            return;
        }
        var c = submission.custom;
        Transaction.wrap(function () {
            c.status = 'PUBLISHED';
            c.publishedAt = new Date();
            c.lastError = null;
            c.nextAttemptAt = null;
            c.updatedAt = new Date();
            marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.submissionId = {0}', null, [c.submissionId], 0, 100).items.forEach(function (offer) {
                offer.custom.priceDirty = true;
                if (offer.custom.stockUpdatedAt && offer.custom.stockUpdatedAt.getTime() <= startedAt) offer.custom.stockDirty = false;
                if (offer.custom.status === 'DRAFT') offer.custom.status = 'ACTIVE';
            });
            marketplaceHelpers.logAudit({ entityType: 'SUBMISSION', entityId: c.submissionId, sellerId: c.sellerId, action: 'PUBLISHED', actor: SYSTEM, from: 'PROVISIONING', to: 'PUBLISHED' });
            marketplaceHelpers.notify(c.sellerId, 'PRODUCT_PUBLISHED', { productId: c.productId });
        });
        counts.published += 1;
    });
    return counts;
}

// ---------------------------------------------------------------- offer sync

/**
 * @param {dw.object.CustomObject} offer - offer
 * @param {dw.object.CustomObject} seller - seller
 * @returns {number} units used for ranking and the site total during a sync
 */
function getEstimatedStock(offer, seller) {
    if (offer.custom.status !== 'ACTIVE' || !seller || seller.custom.status !== 'APPROVED') return 0;
    // Dirty stock is about to be imported, so the declared amount is the best estimate.
    return offer.custom.stockDirty ? Math.max(0, offer.custom.stock || 0) : offerHelpers.getAvailableQuantity(offer, seller);
}

/**
 * Job step: writes changed seller stock, featured prices and site totals.
 * @param {number} limit - maximum offers per run
 * @returns {{offers: number, products: number, failed: number}} counts
 */
function prepareOfferSync(limit) {
    var counts = { offers: 0, products: 0, failed: 0 };
    if (!canPublish()) {
        log.error('Offer sync skipped: marketplace catalog preferences are incomplete');
        return counts;
    }
    var startedAt = new Date();
    marketplaceHelpers.queryPage('MarketplaceSeller', 'custom.catalogDirty = {0}', null, [true], 0, 100).items.forEach(function (s) {
        Transaction.wrap(function () {
            marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.sellerId = {0}', null, [s.custom.sellerId], 0, 1000).items.forEach(function (o) { o.custom.priceDirty = true; });
            s.custom.catalogDirty = false;
        });
    });
    var dirty = marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.stockDirty = {0} OR custom.priceDirty = {0}', 'custom.updatedAt asc', [true], 0, limit).items;
    var productIds = [];
    var lists = {};
    dirty.forEach(function (o) {
        if (productIds.indexOf(o.custom.productId) < 0) productIds.push(o.custom.productId);
        if (!o.custom.stockDirty) return;
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', o.custom.sellerId);
        if (!seller || !seller.custom.inventoryListId) return;
        var id = seller.custom.inventoryListId;
        if (!lists[id]) lists[id] = { listId: id, description: 'Marketplace seller ' + seller.custom.sellerId, records: [] };
        lists[id].records.push({ productId: o.custom.productId, allocation: o.custom.stock || 0, timestamp: o.custom.stockUpdatedAt || startedAt });
    });
    var siteRecords = [];
    var prices = [];
    var attributes = [];
    productIds.forEach(function (productId) {
        var product = require('dw/catalog/ProductMgr').getProduct(productId);
        if (!product) return;
        var candidates = [];
        var total = 0;
        marketplaceHelpers.queryPage('MarketplaceOffer', 'custom.productId = {0}', null, [productId], 0, 100).items.forEach(function (o) {
            var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', o.custom.sellerId);
            var units = getEstimatedStock(o, seller);
            total += units;
            if (units > 0) {
                candidates.push({
                    offerId: o.custom.offerId,
                    sellerId: o.custom.sellerId,
                    priceCents: o.custom.priceCents,
                    rating: sellerHelpers.getSellerView(seller).rating,
                    handlingDays: typeof o.custom.handlingDays === 'number' ? o.custom.handlingDays : sellerHelpers.getSellerTerms(seller).handlingDays,
                    available: units
                });
            }
        });
        var ranked = offerHelpers.rankOffers(candidates);
        // First-party products can live in another master catalog, so only seller-created
        // products get catalog attributes, a marketplace price and a site stock total.
        if (product.custom.mktOwnerSellerId) {
            attributes.push({ productId: productId, custom: { mktFeaturedSellerId: ranked.length ? ranked[0].sellerId : '', mktOfferCount: String(ranked.length) } });
            siteRecords.push({ productId: productId, allocation: total, timestamp: startedAt });
            if (ranked.length) prices.push({ productId: productId, cents: ranked[0].priceCents });
        }
        counts.products += 1;
    });
    var siteListId = sellerHelpers.getPreference('sellerSiteInventoryListId');
    var priceBookId = sellerHelpers.getPreference('sellerPriceBookId');
    var ok = true;
    if (sellerHelpers.getEnumPreference('sellerProvisioningStrategy') === 'SCAPI_ADMIN') {
        var api = require('*/cartridge/scripts/services/scapiAdminService').client(sellerHelpers.getPreference('sellerScapiOrganizationId'));
        var calls = [];
        Object.keys(lists).forEach(function (id) {
            calls.push(function () { return api.putInventoryList(id, lists[id].description); });
            lists[id].records.forEach(function (r) { calls.push(function () { return api.putInventoryRecord(id, r.productId, r.allocation, r.timestamp); }); });
        });
        siteRecords.forEach(function (r) { calls.push(function () { return api.putInventoryRecord(siteListId, r.productId, r.allocation, r.timestamp); }); });
        prices.forEach(function (p) { calls.push(function () { return api.putPrice(priceBookId, p.productId, p.cents); }); });
        attributes.forEach(function (a) { calls.push(function () { return api.patchProduct(a.productId, { c_mktFeaturedSellerId: a.custom.mktFeaturedSellerId, c_mktOfferCount: Number(a.custom.mktOfferCount) }); }); });
        for (var i = 0; i < calls.length && ok; i++) ok = calls[i]().ok;
    } else if (dirty.length) {
        var batch = marketplaceHelpers.createId('SYNC');
        var allLists = Object.keys(lists).map(function (k) { return lists[k]; });
        if (siteRecords.length) allLists.push({ listId: siteListId, description: null, records: siteRecords });
        if (allLists.length) writeImportFile(FOLDERS.sync.inventory, batch, getInventoryXml(allLists));
        if (prices.length) writeImportFile(FOLDERS.sync.pricebook, batch, getPriceBookXml(priceBookId, prices));
        if (attributes.length) writeImportFile(FOLDERS.sync.catalog, '3-' + batch + '-offers', getCatalogXml(sellerHelpers.getPreference('sellerMasterCatalogId'), attributes, []));
    }
    if (!ok) {
        counts.failed = dirty.length;
        log.error('Offer sync through SCAPI Admin failed; offers stay dirty for the next run');
        return counts;
    }
    counts.offers = dirty.length;
    marketplaceHelpers.saveJobState('sync-batch', { startedAt: startedAt.toISOString(), offerIds: dirty.map(function (o) { return o.custom.offerId; }) });
    return counts;
}

/**
 * Job step after the imports: clears dirty flags of offers unchanged since the batch started,
 * and opens a case for active offers whose inventory record is still missing.
 * @returns {{confirmed: number, mismatches: number}} counts
 */
function confirmOfferSync() {
    var batch = marketplaceHelpers.getJobState('sync-batch');
    var counts = { confirmed: 0, mismatches: 0 };
    if (!batch.startedAt || !batch.offerIds) return counts;
    var startedAt = new Date(batch.startedAt).getTime();
    batch.offerIds.forEach(function (offerId) {
        var offer = CustomObjectMgr.getCustomObject('MarketplaceOffer', offerId);
        if (!offer) return;
        var c = offer.custom;
        var seller = CustomObjectMgr.getCustomObject('MarketplaceSeller', c.sellerId);
        var list = seller && seller.custom.inventoryListId ? require('dw/catalog/ProductInventoryMgr').getInventoryList(seller.custom.inventoryListId) : null;
        var missing = c.status === 'ACTIVE' && (!list || !list.getRecord(c.productId));
        Transaction.wrap(function () {
            if (c.stockDirty && c.stockUpdatedAt && c.stockUpdatedAt.getTime() <= startedAt && !missing) c.stockDirty = false;
            if (c.priceDirty && (!c.updatedAt || c.updatedAt.getTime() <= startedAt)) c.priceDirty = false;
            if (missing) {
                require('*/cartridge/scripts/helpers/caseHelpers').openCase({ caseType: 'INVENTORY_MISMATCH', sellerId: c.sellerId, entityId: offerId, productId: c.productId, severity: 'MEDIUM', detail: { reason: 'record-missing' }, dedupeKey: 'inventory:' + offerId });
            }
        });
        if (missing) counts.mismatches += 1;
        counts.confirmed += 1;
    });
    marketplaceHelpers.saveJobState('sync-batch', {});
    return counts;
}

module.exports = {
    FOLDERS: FOLDERS,
    canPublish: canPublish,
    getCatalogXml: getCatalogXml,
    getPriceBookXml: getPriceBookXml,
    getInventoryXml: getInventoryXml,
    getCatalogData: getCatalogData,
    getScapiProduct: getScapiProduct,
    preparePublishing: preparePublishing,
    verifyPublishing: verifyPublishing,
    prepareOfferSync: prepareOfferSync,
    confirmOfferSync: confirmOfferSync
};
