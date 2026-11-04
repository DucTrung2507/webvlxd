/* Run from project root with macOS JavaScriptCore jsc. Actual form listeners; no network. */
var window = {}, checks = 0;
function assert(ok, message) { if (!ok) throw new Error(message); checks++; }
function equal(a, b, message) { assert(a === b, message + ': ' + String(a) + ' !== ' + String(b)); }
function Element(tag, attrs) {
    this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.parentElement = null;
    this.listeners = {}; this.className = ''; this.value = ''; this.defaultValue = ''; this.textContent = '';
    this.hidden = false; this.disabled = false; this.open = false;
    var self = this;
    this.classList = {remove:function (name) { self.className = self.className.split(/\s+/).filter(function (x) { return x !== name; }).join(' '); }};
    Object.keys(attrs || {}).forEach(function (k) { self.setAttribute(k, attrs[k]); });
}
Element.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'value') this.value = this.defaultValue = String(v); };
Element.prototype.removeAttribute = function (k) { delete this.attributes[k]; };
Element.prototype.getAttribute = function (k) { return this.attributes[k] === undefined ? null : this.attributes[k]; };
Element.prototype.matches = function (s) { return s[0] === '.' ? this.className.split(/\s+/).includes(s.slice(1)) : s[0] === '[' ? Object.prototype.hasOwnProperty.call(this.attributes, s.slice(1, -1)) : this.tagName === s.toUpperCase(); };
Element.prototype.querySelectorAll = function (selectors) {
    var found = [], wanted = selectors.split(',').map(function (s) { return s.trim(); });
    function walk(node) { node.children.forEach(function (child) { if (wanted.some(function (s) { return child.matches(s); })) found.push(child); walk(child); }); }
    walk(this); return found;
};
Element.prototype.querySelector = function (s) { return this.querySelectorAll(s)[0] || null; };
Element.prototype.closest = function (s) { var n = this; while (n) { if (n.matches(s)) return n; n = n.parentElement; } return null; };
Element.prototype.appendChild = function (child) { this.children.push(child); child.parentElement = this; return child; };
Element.prototype.replaceChildren = function () { this.children.forEach(function (n) { n.parentElement = null; }); this.children = []; Array.from(arguments).forEach(this.appendChild.bind(this)); };
Element.prototype.remove = function () { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; };
Element.prototype.addEventListener = function (type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); };
Element.prototype.focus = function () { document.activeElement = this; };
Element.prototype.reset = function () { this.querySelectorAll('input').forEach(function (n) { n.value = n.defaultValue; }); };
Element.prototype.showModal = function () { this.open = true; };
Element.prototype.close = function () { this.open = false; };
Element.prototype.getBoundingClientRect = function () { return {left:0,right:900,top:0,bottom:900}; };
['nextElementSibling', 'previousElementSibling'].forEach(function (k) { Object.defineProperty(Element.prototype, k, {get:function () { if (!this.parentElement) return null; var list = this.parentElement.children; return list[list.indexOf(this) + (k === 'nextElementSibling' ? 1 : -1)] || null; }}); });
// Parse actual flat addItem template instead of reconstructing row contents in the test.
Object.defineProperty(Element.prototype, 'innerHTML', {set:function (source) {
    this.replaceChildren(); var tags = /<([a-z][\w-]*)([^>]*)>/gi, tag;
    while ((tag = tags.exec(source))) {
        var attrs = {}, attribute, pattern = /([\w-]+)(?:="([^"]*)")?/g;
        while ((attribute = pattern.exec(tag[2]))) attrs[attribute[1]] = attribute[2] || '';
        this.appendChild(new Element(tag[1], attrs));
    }
}});
var nodes = {}, body = new Element('body');
var document = {activeElement:body, listeners:{}, getElementById:function (id) { if (!nodes[id]) throw new Error('Missing fixture ' + id); return nodes[id]; }, createElement:function (tag) { return new Element(tag); }, querySelectorAll:body.querySelectorAll.bind(body), addEventListener:Element.prototype.addEventListener};
function add(id, tag, parent, attrs) { var el = new Element(tag, attrs); nodes[id] = el; (parent || body).appendChild(el); return el; }
var openButton = add('openButton', 'button', body, {'data-open-order':''});
var dialog = add('orderPanel', 'dialog'), form = add('createForm', 'form', dialog);
add('closeButton', 'button', form, {'data-close-order':''});
['customer','address','shipper','paid'].forEach(function (id) { add(id, 'input', form); });
['items','orderId','orderFormError','total','debt'].forEach(function (id) { add(id, 'div', form); });
['addItem','payFull','saveOrder','saveAndPrint'].forEach(function (id) { add(id, 'button', form); });
nodes.saveOrder.value = 'save'; nodes.saveAndPrint.value = 'print'; add('toast', 'div');
function setTimeout() { return 1; } function clearTimeout() {}
load('js/order-data.js');
var app = window.InvoiceApp, saved = [], remembered = [], refreshes = 0;
app.API = {nextId:async function () { return 'HD031120260001'; }, save:async function (order) { saved.push(JSON.parse(JSON.stringify(order))); return order; }};
app.List = {init:function () {}, getOrders:function () { return []; }, remember:function (order) { remembered.push(order); }, load:function () { refreshes++; }};
app.Print = {print:function () {}};
load('js/order.js');
async function emit(el, type, extra) { var event = Object.assign({target:el,preventDefault:function () {}}, extra || {}); for (var fn of el.listeners[type] || []) await fn(event); }
function rows() { return nodes.items.querySelectorAll('.item'); }
function field(index, selector) { var el = rows()[index] && rows()[index].querySelector(selector); if (!el) throw new Error('Missing row field ' + index + selector); return el; }
async function input(index, selector, value) { var target = field(index, selector); target.value = String(value); await emit(nodes.items, 'input', {target:target}); }
async function name(index, value) { await input(index, '.name', value); }
async function removeRow(index) { await emit(nodes.items, 'click', {target:field(index, '[data-delete-item]')}); }
function expectRows(names, label) {
    equal(JSON.stringify(rows().map(function (row) { return row.querySelector('.name').value.trim(); })), JSON.stringify(names), label);
    rows().forEach(function (row, i) { equal(String(row.querySelector('.stt').textContent), String(i + 1), label + ' STT'); });
    equal(rows().filter(function (row) { return !row.querySelector('.name').value.trim(); }).length, 1, label + ' single empty row');
    equal(rows().at(-1).querySelector('.name').value.trim(), '', label + ' trailing empty row');
}
async function fresh() { if (dialog.open) await emit(nodes.closeButton, 'click'); await emit(openButton, 'click'); equal(dialog.open, true, 'Dialog opens'); }
async function three() { await fresh(); await name(0, 'Xi măng'); await name(1, 'Gạch'); await name(2, 'Cát'); }
async function run() {
    await emit(document, 'DOMContentLoaded'); await fresh();
    expectRows([''], 'Initial row 1 only');
    equal(field(0, '.qty').getAttribute('step'), '1', 'Native quantity buttons use whole-number steps');
    equal(field(0, '.qty').getAttribute('min'), '0', 'Native quantity steps align to integers');
    equal(field(0, '.unit').tagName, 'SELECT', 'Sales units come from configured product units');
    equal(field(0, '.unit').getAttribute('required'), '', 'Unit selector is required');
    await input(0, '.qty', '2.3'); nodes.paid.value = '500';
    await emit(nodes.items, 'keydown', {target:field(0, '.qty'),key:'ArrowUp'});
    equal(field(0, '.qty').value, '3', 'Arrow up snaps decimal to next integer');
    equal(nodes.paid.value, '', 'Arrow step clears customer payment');
    await input(0, '.qty', '2.3');
    await emit(nodes.items, 'keydown', {target:field(0, '.qty'),key:'ArrowDown'});
    equal(field(0, '.qty').value, '2', 'Arrow down snaps decimal to prior integer');
    await emit(nodes.items, 'keydown', {target:field(0, '.qty'),key:'ArrowDown'});
    equal(field(0, '.qty').value, '1', 'Integer quantities decrease by one');
    await input(0, '.qty', '0.125'); equal(field(0, '.qty').value, '0.125', 'Typing preserves fractional quantity');
    await emit(nodes.addItem, 'click'); expectRows([''], 'Manual add cannot bypass row 1');
    equal(document.activeElement, field(0, '.name'), 'Manual add focuses existing empty name');
    await name(0, '   '); expectRows([''], 'Whitespace does not create row 2');
    await name(0, 'Xi măng'); expectRows(['Xi măng',''], 'Name row 1 creates row 2');
    await name(1, 'Gạch'); expectRows(['Xi măng','Gạch',''], 'Name row 2 creates row 3');
    await emit(nodes.addItem, 'click'); expectRows(['Xi măng','Gạch',''], 'Manual add reuses trailing blank');
    equal(document.activeElement, field(2, '.name'), 'Manual add focuses trailing blank');
    await name(2, 'Cát'); await name(3, 'Đá'); expectRows(['Xi măng','Gạch','Cát','Đá',''], 'Rows appear sequentially');
    await name(2, ' \t '); expectRows(['Xi măng','Gạch',''], 'Whitespace row 3 removes every later row');
    await name(1, ''); expectRows(['Xi măng',''], 'Clearing row 2 removes row 3');
    await name(0, ''); expectRows([''], 'Clearing row 1 leaves row 1');
    await three(); await removeRow(0); expectRows(['Gạch','Cát',''], 'Delete first');
    equal(document.activeElement, field(0, '.name'), 'Deletion focuses successor');
    await three(); await removeRow(1); expectRows(['Xi măng','Cát',''], 'Delete middle');
    await three(); await removeRow(3); expectRows(['Xi măng','Gạch','Cát',''], 'Delete trailing blank restores blank');
    await removeRow(2); expectRows(['Xi măng','Gạch',''], 'Delete last named');
    await fresh(); await removeRow(0); expectRows([''], 'Delete only row restores row 1');
    await three();
    await input(0, '.qty', 2); await input(0, '.price', 1000); await input(0, '.unit', 'bao');
    await input(1, '.qty', 3); await input(1, '.price', 2000);
    await input(2, '.qty', 4); await input(2, '.price', 3000);
    nodes.paid.value = '500'; await emit(nodes.paid, 'input');
    equal(app.Data.money(nodes.total.textContent), 20000, 'Total before clearing');
    equal(app.Data.money(nodes.debt.textContent), 19500, 'Debt before clearing');
    await name(1, ''); expectRows(['Xi măng',''], 'Clear middle removes later data');
    equal(app.Data.money(nodes.total.textContent), 2000, 'Total excludes cleared and removed rows');
    equal(nodes.paid.value, '', 'Clearing item name clears customer payment');
    equal(app.Data.money(nodes.debt.textContent), 2000, 'Debt uses cleared payment immediately');
    await name(1, 'Sỏi'); expectRows(['Xi măng','Sỏi',''], 'Re-enter name creates fresh successor only');
    equal(field(2, '.qty').value, '1', 'Recreated row starts with quantity 1');
    equal(field(2, '.price').value, '', 'Removed row price never resurrects');
    await name(1, ''); nodes.customer.value = 'Khách thử';
    await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(saved.length, 1, 'Save invoked once'); equal(saved[0].items.length, 1, 'Payload excludes every removed and empty row');
    equal(saved[0].items[0].name, 'Xi măng', 'Payload keeps surviving name'); equal(saved[0].items[0].unit, 'bao', 'Payload keeps unit');
    equal(app.Data.money(saved[0].total), 2000, 'Saved total excludes removed data'); equal(app.Data.money(saved[0].debt), 2000, 'Saved debt uses cleared customer payment');
    equal(remembered.length, 1, 'Save updates list'); equal(refreshes, 1, 'Save refreshes history'); equal(dialog.open, false, 'Save closes form');
    await fresh(); expectRows([''], 'Reopening resets row data');
    await name(0, 'Hàng thử'); await input(0, '.price', 1000); nodes.customer.value = 'Khách thử';
    await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(saved.length, 1, 'Missing unit blocks invoice save');
    assert(nodes.orderFormError.textContent.includes('đơn vị tính'), 'Missing unit has useful validation');
    equal(field(0, '.unit').getAttribute('aria-invalid'), 'true', 'Missing unit marked invalid');
    var catalog = [{id:'SP000001',name:'Xi măng',price:90000,status:'active',baseUnit:'kg',units:[{unit:'bao',price:90000,factor:50},{unit:'kg',price:2000,factor:1}]},
        {id:'SP000002',name:'Cát',price:150000,status:'active',baseUnit:'m³',units:[{unit:'m³',price:150000,factor:1}]},
        {id:'SP000003',name:'Hàng chờ',price:1000,status:'pending',baseUnit:'cái',units:[{unit:'cái',price:1000,factor:1}]}];
    var stockRefreshes = 0;
    app.Inventory = {
        ensureLoaded:async function () {}, getProducts:function () { return catalog; },
        resolveProduct:function (value) { return catalog.find(function (p) { return [p.id,p.name,p.id+' — '+p.name].includes(value); }); },
        load:function () { stockRefreshes++; }
    };
    await fresh();
    await name(0, 'SP000001 — Xi măng');
    equal(app.Data.money(field(0, '.price').value), 90000, 'Selecting catalog product fills sale price');
    equal(field(0, '.unit').value, 'bao', 'Product selects its first configured unit');
    nodes.paid.value = '500'; field(0, '.unit').value = 'kg';
    await emit(nodes.items, 'change', {target:field(0, '.unit')});
    equal(app.Data.money(field(0, '.price').value), 2000, 'Changing unit loads its own selling price');
    equal(nodes.paid.value, '', 'Changing unit clears customer payment');
    field(0, '.unit').value = 'bao'; await emit(nodes.items, 'change', {target:field(0, '.unit')});
    await input(0, '.price', 95000); await name(0, 'SP000001 — Xi măng');
    equal(app.Data.money(field(0, '.price').value), 95000, 'Same product preserves edited sale price');
    await name(1, 'Cát'); equal(app.Data.money(field(1, '.price').value), 150000, 'Exact catalog name fills price');
    await name(0, ''); expectRows([''], 'Clearing catalog selection prunes every later row');
    equal(field(0, '.price').value, '', 'Clearing selection clears its default price');
    await name(0, 'Hàng chưa tạo'); await input(0, '.price', 50000); nodes.customer.value = 'Khách mua';
    await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(saved.length, 1, 'Unknown product cannot be submitted');
    assert(nodes.orderFormError.textContent.includes('danh mục'), 'Unknown product has useful validation');
    await name(0, 'Hàng chờ'); await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(saved.length, 1, 'Pending product cannot be sold even when resolver exposes it');
    assert(nodes.orderFormError.textContent.includes('hoàn thiện'), 'Pending product explains completion required');
    await name(0, 'SP000001'); await input(0, '.qty', 2);
    nodes.paid.value = '100'; await input(0, '.qty', '2.3');
    equal(nodes.paid.value, '', 'Changing decimal quantity clears customer payment');
    nodes.paid.value = '100'; await input(0, '.price', 90000);
    equal(nodes.paid.value, '', 'Changing sale price clears customer payment');
    await input(0, '.unit', 'không có'); await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(saved.length, 1, 'Unconfigured unit is rejected');
    await input(0, '.unit', 'bao'); await input(0, '.qty', '2.3');
    nodes.paid.value = '100'; await removeRow(1);
    equal(nodes.paid.value, '', 'Deleting item row clears customer payment');
    var attempts = [], attemptsFail = true, prints = [];
    app.API.save = async function (order) {
        attempts.push(JSON.parse(JSON.stringify(order)));
        if (attemptsFail) throw new Error('Không đủ tồn kho cho Xi măng. Còn 1.');
        return Object.assign({}, order, {id:'HD031120260099'});
    };
    app.Print.print = function (order) { prints.push(order); };
    await emit(form, 'submit', {submitter:nodes.saveOrder});
    equal(dialog.open, true, 'Stock rejection keeps form and values');
    assert(nodes.orderFormError.textContent.includes('Còn 1'), 'Server stock error visible');
    equal(field(0, '.qty').value, '2.3', 'Failed save keeps decimal quantity');
    equal(attempts[0].items[0].qty, '2.3', 'Typed fractional quantity is accepted in invoice payload');
    equal(attempts[0].items[0].productId, 'SP000001', 'Sale sends selected product ID');
    equal(attempts[0].items[0].name, 'Xi măng', 'Sale sends canonical name without UI code prefix');
    assert(attempts[0].requestId.length > 10, 'Sale sends retry request ID');
    attemptsFail = false;
    await emit(form, 'submit', {submitter:nodes.saveAndPrint});
    equal(attempts[0].requestId, attempts[1].requestId, 'Retry reuses request ID');
    equal(prints[0].id, 'HD031120260099', 'Print uses committed server invoice ID');
    equal(stockRefreshes, 1, 'Saved sale refreshes inventory');
    equal(dialog.open, false, 'Committed catalog sale closes');
    catalog = [];
    await fresh();
    equal(nodes.saveOrder.disabled, true, 'No catalog blocks new sale');
    assert(nodes.orderFormError.textContent.includes('Chưa có mặt hàng'), 'Explains first create products and receive stock');
    await emit(form, 'submit', {submitter:nodes.saveOrder}); equal(attempts.length, 2, 'No sale request before catalog ready');
    print('PASS: ' + checks + ' automatic invoice row checks (production listeners, fake DOM, no network)');
}
run().catch(function (error) { print('FAIL: ' + error.message + '\n' + error.stack); quit(1); });
