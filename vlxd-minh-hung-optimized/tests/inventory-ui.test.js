/* Run from project root: JavaScriptCore jsc tests/inventory-ui.test.js. */
load('tests/ui-dom-fixture.js');
['sales','products','warehouse'].forEach(function (name) {
    add(name + 'Nav', 'button', body, {'data-view':name});
    add(name + 'View', 'section', body, {'data-page':name});
});
['productStatus','inventoryStatus','productCount','receiptCount','stockCount','productList','receiptList','stockList','productOptions'].forEach(function (id) { add(id, 'div'); });
['warehouseRefresh','productRefresh'].forEach(function (id) { add(id, 'button'); });
['product','receipt'].forEach(function (kind) {
    add(kind + 'Open', 'button', body, {['data-open-' + kind]:''});
    var panel = add(kind + 'Panel', 'dialog'), form = add(kind + 'Form', 'form', panel);
    add(kind + 'Close', 'button', form, {['data-close-' + kind]:''});
    add(kind + 'FormError', 'p', form); add(kind + 'Save', 'button', form, {value:'save'});
});
['productName','productType','productPrice'].forEach(function (id) { add(id, 'input', nodes.productForm); });
['receiptSupplier','receiptAddress','receiptPaid'].forEach(function (id) { add(id, 'input', nodes.receiptForm); });
['receiptId','receiptItems','receiptTotal','receiptDebt'].forEach(function (id) { add(id, 'div', nodes.receiptForm); });
['receiptPayFull','receiptAddItem'].forEach(function (id) { add(id, 'button', nodes.receiptForm); });
add('receiptSaveAndPrint', 'button', nodes.receiptForm, {value:'print'});
function setTimeout() { return 1; } function clearTimeout() {}
load('js/order-data.js');
var app = window.InvoiceApp;
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() { var resolve, reject; var promise = new Promise(function (yes,no) { resolve=yes; reject=no; }); return {promise:promise,resolve:resolve,reject:reject}; }
var fixture = {products:[{id:'MH0001',name:'Xi măng <img>',type:'Xi măng',price:1000},{id:'MH0002',name:'Cát',type:'Vật liệu',price:2000}],receipts:[],stock:[{productId:'MH0001',name:'Xi măng <img>',qty:0},{productId:'MH0002',name:'Cát',qty:0}],lastReceiptId:''};
var inventoryResponses = [], productResponses = [], receiptResponses = [], inventoryCalls = 0, productsSent = [], receiptsSent = [], printCalls = [], notifications = [];
function nextResponse(queue, fallback) { var response = queue.length ? queue.shift() : clone(fallback); return response instanceof Error ? Promise.reject(response) : Promise.resolve(response); }
app.API = {
    inventory:function () { inventoryCalls++; return nextResponse(inventoryResponses, fixture); },
    createProduct:function (product) { productsSent.push(clone(product)); return nextResponse(productResponses, {}); },
    receiveStock:function (receipt) { receiptsSent.push(clone(receipt)); return nextResponse(receiptResponses, {}); }
};
app.notify = function (message, type) { notifications.push({message:message,type:type}); };
app.Print = {print:function (raw, kind) { printCalls.push({raw:clone(raw),kind:kind}); }};
load('js/inventory.js');
async function emit(el, type, extra) { var event = Object.assign({target:el,preventDefault:function () {}}, extra || {}); for (var fn of el.listeners[type] || []) await fn(event); }
async function settle() { for (var i=0;i<12;i++) await Promise.resolve(); }
function rows() { return nodes.receiptItems.querySelectorAll('.receipt-item'); }
function field(index, selector) { var el = rows()[index] && rows()[index].querySelector(selector); if (!el) throw new Error('Missing row field ' + index + selector); return el; }
async function select(index, id) { var target=field(index,'.receipt-product'); target.value=id; await emit(nodes.receiptItems,'change',{target:target}); }
async function input(index, selector, value) { var target=field(index,selector); target.value=String(value); await emit(nodes.receiptItems,'input',{target:target}); }
function expectRows(ids, message) {
    equal(JSON.stringify(rows().map(function (r) { return r.querySelector('.receipt-product').value; })), JSON.stringify(ids), message);
    rows().forEach(function (r,i) { equal(String(r.querySelector('.stt').textContent),String(i+1),message+' STT'); });
}
async function run() {
    await emit(document,'DOMContentLoaded');
    inventoryResponses.push(new Error('Chức năng kho chưa được triển khai.'));
    await emit(nodes.productsNav,'click'); await settle();
    assert(!nodes.productStatus.hidden,'Initial old-deployment error shown');
    assert(nodes.productList.innerHTML.includes('Chưa tải được dữ liệu'),'Initial failure not rendered as empty catalog');
    equal(nodes.productCount.textContent,'Chưa tải được dữ liệu','Initial failure count not zero');
    var loading=deferred(); inventoryResponses.push(loading.promise);
    app.Inventory.load(true);
    equal(nodes.productsView.hidden,false,'Catalog visible after navigation'); equal(nodes.salesView.hidden,true,'Sales hidden');
    equal(nodes.productsNav.getAttribute('aria-current'),'page','Active navigation announced');
    assert(nodes.productsNav.className.includes('active'),'Active navigation styled');
    assert(nodes.productStatus.textContent.includes('Đang tải'),'Async loading status');
    equal(inventoryCalls,2,'Retry starts one request');
    var same=app.Inventory.load(); equal(inventoryCalls,2,'Concurrent load reuses pending request');
    loading.resolve(clone(fixture)); await same;
    assert(nodes.productStatus.hidden,'Loading status cleared'); equal(app.Inventory.getProducts().length,2,'Catalog data loaded');
    assert(nodes.productList.innerHTML.includes('&lt;img&gt;'),'Catalog names escaped');
    equal(app.Inventory.resolveProduct('MH0001').name,fixture.products[0].name,'Resolve code');
    equal(app.Inventory.resolveProduct('mh0002 — cát').id,'MH0002','Resolve catalog label case-insensitively');
    inventoryResponses.push(new Error('Chức năng kho chưa được triển khai.'));
    await emit(nodes.warehouseRefresh,'click');
    assert(!nodes.inventoryStatus.hidden,'Old deployment failure displayed');
    assert(nodes.inventoryStatus.textContent.includes('Chức năng kho chưa được triển khai'),'Old deployment error retained');
    assert(nodes.productList.innerHTML.includes('MH0001'),'Failed refresh retains existing catalog');
    await emit(nodes.warehouseNav,'click'); await settle();
    equal(nodes.warehouseView.hidden,false,'Warehouse navigation'); equal(nodes.productsView.hidden,true,'Catalog hidden');
    equal(nodes.productsNav.getAttribute('aria-current'),null,'Inactive aria-current removed');
    await emit(nodes.salesNav,'click'); equal(nodes.salesView.hidden,false,'Sales navigation returns');

    await emit(nodes.productOpen,'click'); equal(nodes.productPanel.open,true,'Open product form');
    await emit(nodes.productForm,'submit'); equal(productsSent.length,0,'Blank name not sent');
    equal(document.activeElement,nodes.productName,'Blank name focused');
    nodes.productName.value='Gạch mới'; await emit(nodes.productForm,'submit'); equal(document.activeElement,nodes.productType,'Missing type focused');
    nodes.productType.value='Gạch'; nodes.productPrice.value='0'; await emit(nodes.productForm,'submit'); equal(document.activeElement,nodes.productPrice,'Zero price rejected');
    nodes.productPrice.value='3000'; await emit(nodes.productPrice,'input'); equal(app.Data.money(nodes.productPrice.value),3000,'Product price formatted');
    var savingProduct=deferred(); productResponses.push(savingProduct.promise);
    var firstProduct=emit(nodes.productForm,'submit'); await settle();
    equal(productsSent.length,1,'Valid product sent once'); assert(nodes.productSave.disabled,'Product save disabled in flight');
    await emit(nodes.productForm,'submit'); equal(productsSent.length,1,'Duplicate product submit blocked');
    var newProduct={id:'MH0003',name:'Gạch mới',type:'Gạch',price:3000}; fixture.products.push(newProduct); fixture.stock.push({productId:'MH0003',name:newProduct.name,qty:0});
    savingProduct.resolve(newProduct); await firstProduct; await settle();
    equal(nodes.productPanel.open,false,'Saved product closes form'); assert(nodes.productList.innerHTML.includes('MH0003'),'Server product code rendered');
    equal(productsSent[0].type,'Gạch','Product type in payload'); assert(!!productsSent[0].requestId,'Product stable request key supplied');

    await emit(nodes.receiptOpen,'click'); equal(nodes.receiptPanel.open,true,'Open import form');
    assert(/^NK\d{8}\d{4}$/.test(nodes.receiptId.textContent),'Import ID preview uses NK date and sequence');
    expectRows([''],'Import initially only first row');
    await emit(nodes.receiptAddItem,'click'); expectRows([''],'Manual add cannot bypass empty selection');
    await select(0,'MH0001'); expectRows(['MH0001',''],'Selection opens next row');
    equal(app.Data.money(field(0,'.receipt-price').value),1000,'Selection defaults catalog price');
    await input(0,'.receipt-qty',2.5); await select(1,'MH0002'); await input(1,'.receipt-qty',3);
    expectRows(['MH0001','MH0002',''],'Second selection opens third');
    await select(2,'MH0001'); await input(2,'.receipt-qty',4); await input(2,'.receipt-price',500);
    nodes.receiptPaid.value='1000'; await emit(nodes.receiptPaid,'input');
    equal(app.Data.money(nodes.receiptTotal.textContent),10500,'Import totals quantity and editable prices');
    equal(app.Data.money(nodes.receiptDebt.textContent),9500,'Import debt calculated');
    await select(1,''); expectRows(['MH0001',''],'Clear middle cascades every later row');
    equal(app.Data.money(nodes.receiptTotal.textContent),2500,'Cascade removes later amounts');
    equal(app.Data.money(nodes.receiptDebt.textContent),1500,'Cascade updates debt');
    await select(0,''); expectRows([''],'Clear first leaves only first'); equal(app.Data.money(nodes.receiptTotal.textContent),0,'Cleared amounts excluded');
    await emit(nodes.receiptForm,'submit',{submitter:nodes.receiptSave}); equal(document.activeElement,nodes.receiptSupplier,'Missing supplier rejected');
    nodes.receiptSupplier.value='Nhà cung cấp thử'; await emit(nodes.receiptForm,'submit'); equal(document.activeElement,field(0,'.receipt-product'),'Missing product rejected');
    await select(0,'MH0001'); await input(0,'.receipt-qty',0); await emit(nodes.receiptForm,'submit'); equal(receiptsSent.length,0,'Zero qty rejected before API');
    await input(0,'.receipt-qty',2); await input(0,'.receipt-price',0); await emit(nodes.receiptForm,'submit'); equal(receiptsSent.length,0,'Zero price rejected before API');
    await input(0,'.receipt-price',1000); await input(0,'.receipt-unit','bao'); nodes.receiptPaid.value='500';
    receiptResponses.push(new Error('Mất kết nối')); await emit(nodes.receiptForm,'submit',{submitter:nodes.receiptSaveAndPrint});
    equal(nodes.receiptPanel.open,true,'Unconfirmed receipt stays open'); equal(nodes.receiptFormError.textContent,'Mất kết nối','Save failure displayed');
    var savingReceipt=deferred(); receiptResponses.push(savingReceipt.promise);
    var receiptRetry=emit(nodes.receiptForm,'submit',{submitter:nodes.receiptSaveAndPrint}); await settle();
    equal(receiptsSent.length,2,'Retry sends one new request'); equal(receiptsSent[0].requestId,receiptsSent[1].requestId,'Retry preserves requestId');
    assert(!!receiptsSent[0].requestId,'Receipt request key nonempty'); assert(nodes.receiptSave.disabled,'Import save disabled in flight');
    await emit(nodes.receiptForm,'submit'); equal(receiptsSent.length,2,'Duplicate in-flight receipt submit blocked');
    await emit(nodes.receiptClose,'click'); equal(nodes.receiptPanel.open,true,'Closing blocked during save');
    equal(receiptsSent[1].items.length,1,'Receipt payload excludes cleared trailing rows'); equal(receiptsSent[1].items[0].productId,'MH0001','Receipt sends product code');
    var canonical={id:'NK031120260099',date:'2026-11-03',supplier:'Nhà cung cấp thử',address:'Địa chỉ',total:2000,paid:500,debt:1500,items:[{productId:'MH0001',name:'Xi măng <img>',qty:2,unit:'bao',price:1000,subtotal:2000}]};
    fixture.receipts=[canonical]; fixture.stock[0].qty=2; fixture.lastReceiptId=canonical.id;
    var callsBefore=inventoryCalls; savingReceipt.resolve({receipt:clone(canonical),stock:clone(fixture.stock)}); await receiptRetry; await settle();
    equal(nodes.receiptPanel.open,false,'Confirmed import closes'); equal(printCalls.length,1,'Confirmed import prints once');
    equal(printCalls[0].raw.id,canonical.id,'Print uses canonical server ID'); equal(printCalls[0].kind,'receipt','Print selects receipt labels');
    assert(nodes.receiptList.innerHTML.includes(canonical.id),'History renders canonical ID'); assert(nodes.stockList.innerHTML.includes('>2</td>'),'Returned stock rendered');
    assert(inventoryCalls>callsBefore,'Confirmed receipt refreshes stock');
    var printButton=new Element('button',{'data-print-receipt':canonical.id}); await emit(nodes.receiptList,'click',{target:printButton});
    equal(printCalls.length,2,'Click canonical ID reprints receipt');
    print('PASS: '+checks+' inventory UI checks (production listeners, fake DOM, no network)');
}
run().catch(function (error) { print('FAIL: '+error.message+'\n'+error.stack); quit(1); });
