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
['customer','customerPhone','address','shipper','paid'].forEach(function (id) { add(id, 'input', form); });
add('customerIsNew','input',form,{type:'checkbox'});
['items','orderId','orderIdLabel','orderFormError','total','debt','orderTitle','orderDebtPaidInfo'].forEach(function (id) { add(id, 'div', form); });
['addItem','payFull','saveOrder','saveAndPrint','editOrder','reprintOrder','cancelOrderEdit'].forEach(function (id) { add(id, 'button', form); });
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
    var customerCatalog = [
        {id:'KH000001',name:'Khách đã có',phone:'0900000001',address:'Địa chỉ cũ'},
        {id:'KH000002',name:'Trùng tên',phone:'0900000002',address:'Địa chỉ A'},
        {id:'KH000003',name:'Trùng tên',phone:'0900000003',address:'Địa chỉ B'}
    ];
    var customerLoads = 0, customerRefreshes = 0, customerSales = [], customerLoadFailure = false;
    app.Customers = {
        ensureLoaded:async function () { customerLoads++; if (customerLoadFailure) throw new Error('Chưa tải được khách hàng.'); },
        getCustomers:function () { return customerCatalog.slice(); },
        resolveCustomer:function (value) {
            var text=String(value).trim().toLocaleLowerCase('vi');
            var exact=customerCatalog.find(function (customer) { return [customer.id,customer.id+' — '+customer.name].some(function(label){return label.toLocaleLowerCase('vi')===text;}); });
            var byName=customerCatalog.filter(function(customer){return customer.name.toLocaleLowerCase('vi')===text;});
            return exact || (byName.length===1 ? byName[0] : undefined);
        },
        load:function () { customerRefreshes++; }
    };
    app.API.save = async function (order) { customerSales.push(JSON.parse(JSON.stringify(order))); return Object.assign({},order,{id:'HD041120260001'}); };
    await fresh(); equal(customerLoads,1,'Opening invoice loads customer database');
    nodes.customer.value='KH000001 — Khách đã có'; nodes.paid.value='200'; await emit(nodes.customer,'input');
    equal(nodes.customer.value,'Khách đã có','Customer selection replaces code label with canonical name');
    equal(nodes.customerPhone.value,'0900000001','Customer selection prefills phone');
    equal(nodes.address.value,'Địa chỉ cũ','Customer selection prefills address');
    equal(nodes.paid.value,'200','Changing customer metadata does not clear customer payment');
    nodes.customerPhone.value='0900000099'; nodes.address.value='Địa chỉ giao khác';
    await emit(nodes.customer,'change');
    equal(nodes.address.value,'Địa chỉ giao khác','Repeated customer event preserves edited delivery address');
    await name(0,'SP000001'); await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(customerSales[0].customerId,'KH000001','Existing customer links invoice by stable code');
    equal(customerSales[0].customer,'Khách đã có','Selected customer sends canonical name');
    equal(customerSales[0].phone,'0900000099','Edited phone is included in invoice data');
    equal(customerSales[0].address,'Địa chỉ giao khác','Invoice keeps delivery address for selected customer');
    equal(customerRefreshes,1,'Successful invoice refreshes customer database');
    await fresh(); nodes.customer.value='KH000001'; await emit(nodes.customer,'input');
    nodes.customer.value='Khách mới'; await emit(nodes.customer,'input');
    equal(nodes.customerPhone.value,'','Changing to new customer removes inherited phone');
    equal(nodes.address.value,'','Changing to new customer removes inherited address');
    nodes.customerPhone.value='0912345678'; nodes.address.value='Địa chỉ mới';
    await name(0,'SP000001'); await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(customerSales[1].customerId,'','New customer leaves code creation to server');
    equal(customerSales[1].customer,'Khách mới','New customer name preserved');
    equal(customerSales[1].phone,'0912345678','New customer phone sent');
    await fresh(); nodes.customer.value='Trùng tên'; await emit(nodes.customer,'input'); await name(0,'SP000001');
    await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(customerSales.length,2,'Ambiguous customer name cannot silently create or pick account');
    assert(nodes.orderFormError.textContent.includes('trùng tên'),'Ambiguous customer validation asks for exact customer code');
    nodes.customer.value='KH000003 — Trùng tên'; await emit(nodes.customer,'input');
    await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(customerSales[2].customerId,'KH000003','Selecting precise duplicate-name customer uses correct account');
    equal(customerSales[2].phone,'0900000003','Duplicate-name customer phone not borrowed from another account');
    await fresh(); nodes.customer.value='KH000001'; await emit(nodes.customer,'input');
    nodes.customerPhone.value='0987654321'; nodes.address.value='Nhà khách mới trùng tên'; nodes.paid.value='123';
    nodes.customerIsNew.checked=true; await emit(nodes.customerIsNew,'change');
    equal(nodes.customerPhone.value,'0987654321','New-customer toggle preserves manually entered phone');
    equal(nodes.address.value,'Nhà khách mới trùng tên','New-customer toggle preserves manually entered address');
    equal(nodes.paid.value,'123','New-customer toggle does not change payment');
    nodes.customer.value='Trùng tên'; await emit(nodes.customer,'input');
    equal(nodes.customerPhone.value,'0987654321','New-customer mode does not auto-fill another person by name');
    await name(0,'SP000001'); await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(customerSales[3].customerId,'','Explicit same-name new customer sends no existing code');
    equal(customerSales[3].customer,'Trùng tên','Explicit same-name new customer retains entered name');
    equal(customerSales[3].phone,'0987654321','Explicit same-name new customer sends own phone');
    customerLoadFailure=true; await fresh();
    equal(nodes.customerIsNew.checked,false,'Reopening invoice clears new-customer mode');
    equal(nodes.saveOrder.disabled,true,'Customer database failure blocks unlinked invoice saves');
    assert(nodes.orderFormError.textContent.includes('khách hàng'),'Customer load error visible');
    await emit(form,'submit',{submitter:nodes.saveOrder}); equal(customerSales.length,4,'Customer load failure does not submit');
    customerLoadFailure=false;
    catalog = [];
    await fresh();
    equal(nodes.saveOrder.disabled, true, 'No catalog blocks new sale');
    assert(nodes.orderFormError.textContent.includes('Chưa có mặt hàng'), 'Explains first create products and receive stock');
    await emit(form, 'submit', {submitter:nodes.saveOrder}); equal(attempts.length, 2, 'No sale request before catalog ready');
    await emit(nodes.closeButton,'click');
    catalog=[{id:'SP000001',name:'Xi măng',price:2000,status:'active',baseUnit:'kg',units:[{unit:'kg',price:2000,factor:1}]}];
    app.Inventory.getAvailability=function(id,unit){return {known:id==='SP000001',qty:49.875,unit:unit||'kg'};};
    var existing={id:'HD041120260077',date:'2026-11-04',customer:'Khách đã có',customerId:'KH000001',phone:'0900000001',address:'Địa chỉ giao',shipper:'Người giao',
        total:4500,paid:1500,originalPaid:500,originalDebt:4000,debtPaid:1000,debt:3000,debtStatementId:'CN1',version:3,canEdit:true,
        items:[{productId:'SP000001',name:'Xi măng',qty:2,unit:'kg',price:2000,subtotal:4500}]};
    app.List.getOrders=function(){return [existing];};
    await app.Order.openExisting(existing.id);
    equal(dialog.open,true,'Invoice number opens existing invoice dialog');
    equal(nodes.orderTitle.textContent,'Chi tiết hóa đơn','Existing view has explicit title');
    equal(nodes.orderIdLabel.textContent,'Mã hóa đơn:','Existing invoice does not show preview label');
    equal(nodes.orderId.textContent,existing.id,'Existing invoice ID retained');
    equal(field(0,'.name').disabled,true,'Viewing existing invoice disables product edits');
    equal(field(0,'.qty').value,'2','Saved quantity populated');
    equal(app.Data.money(nodes.total.textContent),4500,'View preserves saved canonical total even with legacy custom subtotal');
    equal(app.Data.money(field(0,'.subtotal').textContent),4500,'View preserves saved line subtotal');
    equal(app.Data.money(nodes.paid.value),1500,'View shows effective paid including later collections');
    equal(app.Data.money(nodes.debt.textContent),3000,'View shows effective outstanding debt');
    assert(field(0,'.item-stock').textContent.includes('49,875 kg'),'Selected sales product shows warehouse quantity below its name');
    equal(nodes.saveOrder.hidden,true,'Viewing hides save controls');
    equal(nodes.reprintOrder.hidden,false,'Existing invoice has reprint control');
    equal(nodes.editOrder.disabled,false,'Editable invoice enables edit control after dependencies load');
    await emit(nodes.reprintOrder,'click'); equal(prints.at(-1).id,existing.id,'Reprint uses selected saved invoice');
    equal(prints.at(-1).total,4500,'Reprint preserves saved canonical values');
    await emit(form,'submit',{submitter:nodes.saveOrder}); equal(customerSales.length,4,'Read-only view cannot accidentally submit a new invoice');
    await emit(nodes.editOrder,'click');
    equal(nodes.orderTitle.textContent,'Chỉnh sửa hóa đơn','Edit switches same form to editing');
    equal(field(0,'.qty').disabled,false,'Edit enables line controls');
    equal(nodes.customer.disabled,true,'Grouped invoice keeps original customer identity');
    equal(nodes.customerPhone.disabled,true,'Grouped invoice phone cannot reassign identity');
    equal(app.Data.money(nodes.paid.value),500,'Edit uses original payment before ledger collections');
    assert(nodes.orderDebtPaidInfo.textContent.includes('1.000'),'Edit explains separately collected debt payments');
    await emit(nodes.payFull,'click');
    equal(app.Data.money(nodes.paid.value),3000,'Pay full subtracts immutable collections already made through ledger');
    equal(app.Data.money(nodes.debt.textContent),0,'Pay full while editing does not double-pay collected debt');
    expectRows(['Xi măng',''],'Editing preserves automatic trailing blank row');
    await input(0,'.qty',3); equal(nodes.paid.value,'','Editing quantity still clears original payment input');
    await emit(nodes.cancelOrderEdit,'click');
    equal(nodes.orderTitle.textContent,'Chi tiết hóa đơn','Cancel returns to saved view');
    equal(field(0,'.qty').value,'2','Cancel discards unsaved quantities');
    equal(app.Data.money(nodes.total.textContent),4500,'Cancel restores canonical saved total');
    await emit(nodes.editOrder,'click');await input(0,'.qty',4);
    var updates=[],failUpdate=true;
    app.API.updateOrder=async function(order){updates.push(JSON.parse(JSON.stringify(order)));if(failUpdate)throw new Error('Mất kết nối cập nhật');return Object.assign({},order,{version:4,total:8000,paid:1000,originalPaid:0,debtPaid:1000,debt:7000,debtStatementId:'CN1',canEdit:true});};
    await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(dialog.open,true,'Failed update preserves form');
    equal(field(0,'.qty').value,'4','Failed update preserves changed quantity');
    equal(nodes.orderTitle.textContent,'Chỉnh sửa hóa đơn','Failed update stays in editing mode');
    assert(nodes.orderFormError.textContent.includes('Mất kết nối'),'Update error displayed');
    equal(updates[0].id,existing.id,'Update keeps original invoice number');
    equal(updates[0].baseVersion,3,'Update sends optimistic base version');
    equal(updates[0].customerId,'KH000001','Update retains customer binding');
    failUpdate=false;await emit(form,'submit',{submitter:nodes.saveOrder});
    equal(updates[0].requestId,updates[1].requestId,'Update retry keeps idempotency request ID');
    equal(nodes.orderTitle.textContent,'Chi tiết hóa đơn','Confirmed update returns to saved view');
    equal(dialog.open,true,'Confirmed update stays open for review and reprint');
    equal(app.Data.money(nodes.total.textContent),8000,'Updated view uses canonical server total');
    equal(app.Data.money(nodes.debt.textContent),7000,'Updated view uses canonical effective debt');
    await emit(nodes.reprintOrder,'click');equal(prints.at(-1).version,4,'Reprint after edit uses new saved version');
    await emit(nodes.closeButton,'click');
    await app.Order.openExisting({...existing,canEdit:false,editBlockedReason:'Phiếu công nợ đã tất toán.'});
    equal(nodes.editOrder.disabled,true,'Closed statement disables invoice editing');
    assert(nodes.orderFormError.textContent.includes('tất toán'),'Locked invoice explains its reason');
    await emit(nodes.editOrder,'click');equal(field(0,'.qty').disabled,true,'Synthetic edit click cannot bypass locked state');
    await emit(nodes.closeButton,'click');
    customerLoadFailure=true;
    await app.Order.openExisting(existing);
    equal(dialog.open,true,'Saved invoice remains viewable when customer refresh fails');
    equal(nodes.reprintOrder.disabled,false,'Saved invoice remains printable when refresh fails');
    equal(nodes.editOrder.disabled,true,'Refresh failure disables editing safely');
    assert(nodes.orderFormError.textContent.includes('Vẫn có thể in lại'),'Refresh failure keeps clear reprint path');
    customerLoadFailure=false;
    print('PASS: ' + checks + ' automatic invoice row checks (production listeners, fake DOM, no network)');
}
run().catch(function (error) { print('FAIL: ' + error.message + '\n' + error.stack); quit(1); });
