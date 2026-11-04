/* Run from project root: JavaScriptCore jsc tests/inventory-ui.test.js. */
load('tests/ui-dom-fixture.js');
['sales','products','warehouse'].forEach(function (name) {
    add(name + 'Nav', 'button', body, {'data-view':name});
    add(name + 'View', 'section', body, {'data-page':name});
});
['productStatus','inventoryStatus','productCount','receiptCount','stockCount','pendingCount','pendingProducts','productList','receiptList','stockList','productOptions','receiptProductOptions'].forEach(function (id) { add(id, 'div'); });
['warehouseRefresh','productRefresh'].forEach(function (id) { add(id, 'button'); });
['productSearch','warehouseSearch'].forEach(function (id) { add(id, 'input'); });
add('stockSearch','input'); add('stockSort','select').value='name-asc'; add('stockGroupType','input').checked=false;
add('warehouseReceiptsTab','button',body,{'data-warehouse-tab':'receipts'});
add('warehouseStockTab','button',body,{'data-warehouse-tab':'stock'});
add('warehouseReceiptsPanel','section'); add('warehouseStockPanel','section');
['product','receipt'].forEach(function (kind) {
    add(kind + 'Open', 'button', body, {['data-open-' + kind]:''});
    var panel = add(kind + 'Panel', 'dialog'), form = add(kind + 'Form', 'form', panel);
    add(kind + 'Close', 'button', form, {['data-close-' + kind]:''});
    add(kind + 'FormError', 'p', form); add(kind + 'Save', 'button', form, {value:'save'});
});
['productName','productType','productBaseUnit'].forEach(function (id) { add(id, 'input', nodes.productForm); });
['productTitle','productCode','productUnits','legacyUnitGroup'].forEach(function (id) { add(id, 'div', nodes.productForm); });
add('productLegacyUnit','select',nodes.legacyUnitGroup);
add('productAddUnit','button',nodes.productForm);
['receiptSupplier','receiptAddress','receiptPaid'].forEach(function (id) { add(id, 'input', nodes.receiptForm); });
['receiptId','receiptItems','receiptTotal','receiptDebt'].forEach(function (id) { add(id, 'div', nodes.receiptForm); });
['receiptPayFull','receiptAddItem'].forEach(function (id) { add(id, 'button', nodes.receiptForm); });
add('receiptSaveAndPrint', 'button', nodes.receiptForm, {value:'print'});
function setTimeout() { return 1; } function clearTimeout() {}
load('js/order-data.js');
var app = window.InvoiceApp;
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() { var resolve, reject; var promise = new Promise(function (yes,no) { resolve=yes; reject=no; }); return {promise:promise,resolve:resolve,reject:reject}; }
var fixture = {products:[{id:'MH0001',name:'Xi măng <img>',type:'Xi măng',price:1000,status:'active',baseUnit:'bao',units:[{unit:'bao',price:1000,factor:1},{unit:'kg',price:25,factor:0.02}]},
    {id:'MH0002',name:'Cát',type:'Vật liệu',price:2000,status:'active',baseUnit:'m³',units:[{unit:'m³',price:2000,factor:1}]}],
    receipts:[],stock:[{productId:'MH0001',name:'Xi măng <img>',unit:'bao',qty:0},{productId:'MH0002',name:'Cát',unit:'m³',qty:0}],lastReceiptId:''};
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
function unitRows() { return nodes.productUnits.querySelectorAll('.product-unit-row'); }
function unitField(index, selector) { var target=unitRows()[index] && unitRows()[index].querySelector(selector); if (!target) throw new Error('Missing product unit '+index+selector); return target; }
async function unitInput(index, selector, value) { var target=unitField(index,selector); target.value=String(value); await emit(nodes.productUnits,'input',{target:target}); }
async function editProduct(id, container) { var button=new Element('button',{'data-edit-product':id}); await emit(container || nodes.pendingProducts,'click',{target:button}); await settle(); }
function expectRows(ids, message) {
    equal(JSON.stringify(rows().map(function (r) { return r.querySelector('.receipt-product').value; })), JSON.stringify(ids), message);
    rows().forEach(function (r,i) { equal(String(r.querySelector('.stt').textContent),String(i+1),message+' STT'); });
}
async function run() {
    await emit(document,'DOMContentLoaded');
    equal(nodes.warehouseReceiptsPanel.hidden,false,'Warehouse defaults to receipt section');
    equal(nodes.warehouseStockPanel.hidden,true,'Stock section starts hidden');
    equal(nodes.warehouseReceiptsTab.getAttribute('aria-selected'),'true','Active warehouse tab announced');
    equal(nodes.warehouseStockTab.getAttribute('tabindex'),'-1','Inactive warehouse tab removed from tab sequence');
    await emit(nodes.warehouseStockTab,'click');
    equal(nodes.warehouseReceiptsPanel.hidden,true,'Selecting stock hides receipt section');
    equal(nodes.warehouseStockPanel.hidden,false,'Selecting stock shows its own section');
    nodes.warehouseReceiptsTab.focus();
    await emit(nodes.warehouseReceiptsTab,'keydown',{key:'ArrowRight'});
    equal(nodes.warehouseStockTab.getAttribute('aria-selected'),'true','Arrow navigation starts from focused tab even when another section is selected');
    equal(document.activeElement,nodes.warehouseStockTab,'Arrow from inactive focused tab moves focus to target');
    await emit(nodes.warehouseStockTab,'keydown',{key:'ArrowLeft'});
    equal(nodes.warehouseReceiptsPanel.hidden,false,'Arrow key switches warehouse section');
    equal(document.activeElement,nodes.warehouseReceiptsTab,'Arrow key moves focus with selection');
    await emit(nodes.warehouseReceiptsTab,'keydown',{key:'End'});
    equal(nodes.warehouseStockPanel.hidden,false,'End chooses last warehouse section');
    await emit(nodes.warehouseStockTab,'keydown',{key:'Home'});
    equal(nodes.warehouseReceiptsPanel.hidden,false,'Home chooses first warehouse section');
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
    nodes.productType.value='Gạch'; await emit(nodes.productForm,'submit'); equal(document.activeElement,nodes.productBaseUnit,'Missing base unit focused');
    nodes.productBaseUnit.value='cái'; await emit(nodes.productBaseUnit,'input');
    equal(unitField(0,'.product-unit').value,'cái','Base unit fills first blank unit');
    equal(unitField(0,'.product-unit-factor').value,'1','Base factor is exactly one');
    assert(unitField(0,'.product-unit-factor').readOnly,'Base factor locked');
    await unitInput(0,'.product-unit-price',0); await emit(nodes.productForm,'submit'); equal(document.activeElement,unitField(0,'.product-unit-price'),'Zero unit price rejected');
    await unitInput(0,'.product-unit-price',3000); equal(app.Data.money(unitField(0,'.product-unit-price').value),3000,'Unit price formatted');
    await emit(nodes.productAddUnit,'click');
    await emit(nodes.productForm,'submit'); equal(document.activeElement,unitField(1,'.product-unit'),'Blank additional unit rejected');
    await unitInput(1,'.product-unit',' CÁI '); await unitInput(1,'.product-unit-price',5000); await unitInput(1,'.product-unit-factor',1);
    await emit(nodes.productForm,'submit'); equal(productsSent.length,0,'Duplicate units case/whitespace normalized and rejected');
    await unitInput(1,'.product-unit','thùng'); await unitInput(1,'.product-unit-price',30000); await unitInput(1,'.product-unit-factor',0);
    await emit(nodes.productForm,'submit'); equal(document.activeElement,unitField(1,'.product-unit-factor'),'Zero conversion factor rejected');
    await unitInput(1,'.product-unit-factor',12);
    await emit(nodes.productAddUnit,'click'); await unitInput(2,'.product-unit','nửa cái'); await unitInput(2,'.product-unit-price',1500);
    unitField(2,'.product-unit-method').value='divide'; await unitInput(2,'.product-unit-factor',0);
    await emit(nodes.productForm,'submit'); equal(productsSent.length,0,'Division by zero rejected');
    await unitInput(2,'.product-unit-factor',2);
    var savingProduct=deferred(); productResponses.push(savingProduct.promise);
    var firstProduct=emit(nodes.productForm,'submit'); await settle();
    equal(productsSent.length,1,'Valid product sent once'); assert(nodes.productSave.disabled,'Product save disabled in flight');
    await emit(nodes.productForm,'submit'); equal(productsSent.length,1,'Duplicate product submit blocked');
    var newProduct={id:'MH0003',name:'Gạch mới',type:'Gạch',price:3000,status:'active',baseUnit:'cái',units:[{unit:'cái',price:3000,factor:1},{unit:'thùng',price:30000,factor:12},{unit:'nửa cái',price:1500,factor:0.5}]}; fixture.products.push(newProduct); fixture.stock.push({productId:'MH0003',name:newProduct.name,unit:'cái',qty:0});
    savingProduct.resolve(newProduct); await firstProduct; await settle();
    equal(nodes.productPanel.open,false,'Saved product closes form'); assert(nodes.productList.innerHTML.includes('MH0003'),'Server product code rendered');
    equal(productsSent[0].type,'Gạch','Product type in payload'); assert(!!productsSent[0].requestId,'Product stable request key supplied');
    equal(productsSent[0].baseUnit,'cái','Base unit sent to server');
    equal(productsSent[0].units.length,3,'All selling unit prices sent');
    equal(productsSent[0].units[1].factor,12,'Multiply conversion sent as base quantity');
    equal(productsSent[0].units[2].factor,0.5,'Divide conversion normalized to factor');
    equal(productsSent[0].price,3000,'Product price corresponds to base unit');

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

    await emit(nodes.receiptOpen,'click'); nodes.receiptSupplier.value='NCC hàng mới';
    await select(0,'Sỏi mới <svg>'); expectRows(['Sỏi mới <svg>',''],'Unknown receipt name creates trailing row');
    equal(field(0,'.receipt-price').value,'','Unknown item has no guessed selling price');
    await input(0,'.receipt-qty',2.3);
    await emit(nodes.receiptItems,'keydown',{target:field(0,'.receipt-qty'),key:'ArrowUp'});
    equal(field(0,'.receipt-qty').value,'3','Receipt quantity arrow rounds upward to integer');
    await input(0,'.receipt-qty',2.3);
    await emit(nodes.receiptItems,'keydown',{target:field(0,'.receipt-qty'),key:'ArrowDown'});
    equal(field(0,'.receipt-qty').value,'2','Receipt quantity arrow rounds downward to integer');
    await input(0,'.receipt-qty',2.5); await input(0,'.receipt-price',50000);
    await emit(nodes.receiptForm,'submit',{submitter:nodes.receiptSave});
    equal(receiptsSent.length,2,'Unknown receipt requires unit before save');
    equal(document.activeElement,field(0,'.receipt-unit'),'Missing receipt unit focused');
    await input(0,'.receipt-unit','bao');
    var waiting={id:'MH0004',name:'Sỏi mới <svg>',type:'',price:0,status:'pending',baseUnit:'',units:[],receivedUnits:['bao']};
    var pendingReceipt={id:'NK031120260100',date:'2026-11-03',supplier:'NCC hàng mới',address:'',total:125000,paid:0,debt:125000,items:[{productId:waiting.id,name:waiting.name,qty:2.5,unit:'bao',price:50000,subtotal:125000}]};
    fixture.products.push(waiting); fixture.receipts.push(pendingReceipt); fixture.stock.push({productId:waiting.id,name:waiting.name,unit:'bao',qty:2.5});
    receiptResponses.push({receipt:clone(pendingReceipt),products:clone(fixture.products),stock:clone(fixture.stock)});
    await emit(nodes.receiptForm,'submit',{submitter:nodes.receiptSave}); await settle();
    equal(receiptsSent.length,3,'Unknown named product can be received');
    equal(receiptsSent[2].items[0].productId,'','Unknown receipt name leaves product allocation to server');
    equal(receiptsSent[2].items[0].name,'Sỏi mới <svg>','Unknown receipt keeps entered name');
    equal(receiptsSent[2].items[0].qty,2.5,'Receipt payload keeps fractional quantity');
    assert(nodes.pendingProducts.innerHTML.includes('Sỏi mới &lt;svg&gt;'),'New item appears escaped in completion queue');
    assert(nodes.pendingProducts.innerHTML.includes('MH0004'),'Queue preserves allocated product code');
    assert(!nodes.productList.innerHTML.includes('MH0004'),'Pending item excluded from completed catalog');
    assert(!nodes.productOptions.innerHTML.includes('MH0004'),'Pending item absent from sales suggestions');
    assert(nodes.receiptProductOptions.innerHTML.includes('MH0004'),'Pending item can be selected for further receipts');
    nodes.warehouseSearch.value='receipt-not-found'; await emit(nodes.warehouseSearch,'input');
    assert(nodes.pendingProducts.innerHTML.includes('MH0004'),'Receipt search never hides completion queue');
    nodes.stockSearch.value='stock-not-found'; await emit(nodes.stockSearch,'input');
    assert(nodes.pendingProducts.innerHTML.includes('MH0004'),'Stock search never hides completion queue');
    nodes.warehouseSearch.value=''; await emit(nodes.warehouseSearch,'input');
    nodes.stockSearch.value=''; await emit(nodes.stockSearch,'input');
    equal(app.Inventory.resolveProduct('MH0004'),undefined,'Pending item cannot resolve for sale');
    equal(app.Inventory.getProducts().length,3,'Sales catalog includes only completed products');
    await editProduct(waiting.id);
    equal(nodes.productPanel.open,true,'Queue button opens completion form');
    equal(nodes.productName.value,waiting.name,'Completion form keeps received product name');
    equal(unitField(0,'.product-unit').value,'bao','Completion preloads received unit');
    equal(nodes.legacyUnitGroup.hidden,true,'Known receipt unit does not need legacy mapping');
    nodes.productType.value='Đá, sỏi'; nodes.productBaseUnit.value='bao'; await emit(nodes.productBaseUnit,'input');
    await unitInput(0,'.product-unit-price',55000);
    var completed={id:waiting.id,name:waiting.name,type:'Đá, sỏi',price:55000,status:'active',baseUnit:'bao',units:[{unit:'bao',price:55000,factor:1}]};
    fixture.products[3]=completed; productResponses.push(clone(completed));
    await emit(nodes.productForm,'submit'); await settle();
    equal(productsSent[1].productId,waiting.id,'Completing pending product preserves existing productId');
    equal(app.Inventory.resolveProduct(waiting.id).id,waiting.id,'Completed received product becomes saleable');
    assert(!nodes.pendingProducts.innerHTML.includes('MH0004'),'Completed item leaves pending queue');

    var legacy={id:'MH0005',name:'Hàng tồn cũ',type:'Vật liệu',price:1000,status:'pending',units:[],baseUnit:'',receivedUnits:['']};
    fixture.products.push(legacy); fixture.stock.push({productId:legacy.id,name:legacy.name,unit:'',qty:2});
    await app.Inventory.load(true); await editProduct(legacy.id);
    equal(nodes.legacyUnitGroup.hidden,false,'Unitless historical stock requires explicit mapping');
    nodes.productBaseUnit.value='kg'; await emit(nodes.productBaseUnit,'input'); await unitInput(0,'.product-unit-price',2000);
    await emit(nodes.productAddUnit,'click'); await unitInput(1,'.product-unit','bao'); await unitInput(1,'.product-unit-price',100000); await unitInput(1,'.product-unit-factor',50);
    nodes.productLegacyUnit.value=''; await emit(nodes.productForm,'submit');
    equal(productsSent.length,2,'Missing historical stock mapping blocks completion');
    equal(document.activeElement,nodes.productLegacyUnit,'Historical unit mapping receives focus');
    nodes.productLegacyUnit.value='bao';
    var mapped={id:legacy.id,name:legacy.name,type:'Vật liệu',price:2000,status:'active',baseUnit:'kg',legacyUnit:'bao',units:[{unit:'kg',price:2000,factor:1},{unit:'bao',price:100000,factor:50}]};
    fixture.products[4]=mapped; productResponses.push(clone(mapped));
    await emit(nodes.productForm,'submit'); await settle();
    equal(productsSent[2].productId,legacy.id,'Legacy completion keeps product ID');
    equal(productsSent[2].legacyUnit,'bao','Legacy stock mapping explicitly sent');
    equal(productsSent[2].units[1].factor,50,'Legacy completion keeps conversion factors');
    await editProduct(mapped.id,nodes.productList);
    equal(nodes.productName.value,mapped.name,'Catalog update opens correct product');
    equal(nodes.productBaseUnit.value,'kg','Editing preserves base unit');
    equal(unitRows().length,2,'Editing preserves every selling unit');
    equal(unitField(1,'.product-unit-factor').value,50,'Editing preserves existing conversion');
    equal(nodes.productLegacyUnit.value,'bao','Editing preserves previous legacy mapping');
    await emit(nodes.productClose,'click');

    await emit(nodes.productOpen,'click'); nodes.productName.value='Thiếu ĐVT gốc'; nodes.productType.value='Thử';
    nodes.productBaseUnit.value='kg'; await emit(nodes.productBaseUnit,'input');
    await unitInput(0,'.product-unit','bao'); await unitInput(0,'.product-unit-price',100000); await unitInput(0,'.product-unit-factor',50);
    await emit(nodes.productForm,'submit'); equal(productsSent.length,3,'Configured units must include base unit');
    equal(document.activeElement,nodes.productBaseUnit,'Missing base unit row focuses base field');
    await emit(nodes.productClose,'click');
    nodes.productSearch.value='gach moi'; await emit(nodes.productSearch,'input');
    assert(nodes.productList.innerHTML.includes('MH0003'),'Product search ignores Vietnamese accents');
    assert(!nodes.productList.innerHTML.includes('MH0001'),'Product search hides unrelated rows');
    assert(nodes.productOptions.innerHTML.includes('MH0001'),'Catalog search does not remove sales suggestions');
    nodes.productSearch.value='nothing-exists'; await emit(nodes.productSearch,'input');
    assert(nodes.productList.innerHTML.includes('Không có mặt hàng phù hợp'),'Product search empty result explained');
    nodes.productSearch.value=''; await emit(nodes.productSearch,'input');
    nodes.warehouseSearch.value=canonical.id; await emit(nodes.warehouseSearch,'input');
    assert(nodes.receiptList.innerHTML.includes(canonical.id),'Warehouse search finds receipt code');
    assert(nodes.stockList.innerHTML.includes('MH0001'),'Receipt search leaves stock independently visible');
    nodes.stockSearch.value='xi mang'; await emit(nodes.stockSearch,'input');
    assert(nodes.stockList.innerHTML.includes('MH0001'),'Stock search ignores accents');
    assert(!nodes.stockList.innerHTML.includes('MH0002'),'Stock search hides unrelated stock');
    assert(nodes.receiptList.innerHTML.includes(canonical.id),'Stock search preserves receipt search results');
    nodes.stockSearch.value=''; await emit(nodes.stockSearch,'input');
    nodes.warehouseSearch.value=''; await emit(nodes.warehouseSearch,'input');
    equal(app.Inventory.getAvailability('MH0001','bao').qty,2,'Availability reports current base stock');
    equal(app.Inventory.getAvailability('MH0001','kg').qty,100,'Availability converts into chosen unit');
    equal(app.Inventory.getAvailability('MH0001','wrong').qty,null,'Unknown conversion does not falsely report zero');
    await emit(nodes.receiptOpen,'click'); await select(0,'MH0001');
    assert(field(0,'.receipt-stock').textContent.includes('2 bao'),'Receipt shows stock beneath selected product');
    await input(0,'.receipt-unit','kg');
    assert(field(0,'.receipt-stock').textContent.includes('100 kg'),'Receipt stock hint follows selected unit');
    await input(0,'.receipt-product','Sản phẩm hoàn toàn mới');
    assert(field(0,'.receipt-stock').textContent.includes('0 (hàng mới)'),'Unknown product has explicit zero-stock hint');
    await select(0,''); equal(field(0,'.receipt-stock').hidden,true,'Cleared name hides stock hint');
    await emit(nodes.receiptClose,'click');

    fixture.products.push(
        {id:'TYPE-A',name:'Gạch 10',type:'Gạch',status:'active',baseUnit:'viên',units:[{unit:'viên',factor:1,price:100}]},
        {id:'TYPE-B',name:'Gạch 2',type:'gạch',status:'active',baseUnit:'viên',units:[{unit:'viên',factor:1,price:100}]},
        {id:'TYPE-C',name:'Tên <svg>',type:'<img onerror=x>',status:'active',baseUnit:'cái',units:[{unit:'cái',factor:1,price:100}]},
        {id:'TYPE-D',name:'Chờ phân loại',type:'',status:'pending',units:[]}
    );
    fixture.stock.push(
        {productId:'TYPE-A',name:'Gạch 10',unit:'viên',qty:10},
        {productId:'TYPE-B',name:'Gạch 2',unit:'viên',qty:0.125},
        {productId:'TYPE-C',name:'Tên <svg>',unit:'cái',qty:0},
        {productId:'TYPE-D',name:'Chờ phân loại',unit:'kg',qty:0.5},
        {productId:'TYPE-D',name:'Chờ phân loại',unit:'bao',qty:2}
    );
    await emit(nodes.warehouseStockTab,'click'); await app.Inventory.load(true);
    equal(nodes.warehouseStockPanel.hidden,false,'Refresh preserves selected warehouse section');
    nodes.stockSearch.value='gach'; await emit(nodes.stockSearch,'input');
    assert(nodes.stockList.innerHTML.indexOf('Gạch 2')<nodes.stockList.innerHTML.indexOf('Gạch 10'),'Name sort uses natural Vietnamese numeric order');
    nodes.stockSort.value='name-desc'; await emit(nodes.stockSort,'change');
    assert(nodes.stockList.innerHTML.indexOf('Gạch 10')<nodes.stockList.innerHTML.indexOf('Gạch 2'),'Descending name sort reverses natural order');
    nodes.stockSort.value='qty-asc'; await emit(nodes.stockSort,'change');
    assert(nodes.stockList.innerHTML.indexOf('MH0003')<nodes.stockList.innerHTML.indexOf('TYPE-B'),'Quantity ascending includes zero before fractions');
    assert(nodes.stockList.innerHTML.indexOf('TYPE-B')<nodes.stockList.innerHTML.indexOf('TYPE-A'),'Quantity ascending compares numeric fractions');
    nodes.stockSort.value='qty-desc'; await emit(nodes.stockSort,'change');
    assert(nodes.stockList.innerHTML.indexOf('TYPE-A')<nodes.stockList.innerHTML.indexOf('TYPE-B'),'Quantity descending supported');
    nodes.stockSort.value='id-asc'; await emit(nodes.stockSort,'change');
    assert(nodes.stockList.innerHTML.indexOf('TYPE-A')<nodes.stockList.innerHTML.indexOf('TYPE-B'),'Product code sorting supported');
    nodes.stockSort.value='name-asc'; nodes.stockSearch.value=''; nodes.stockGroupType.checked=true; await emit(nodes.stockGroupType,'change');
    assert(nodes.stockList.innerHTML.includes('class="stock-group"'),'Grouping creates category headings');
    assert(/scope="colgroup">[Gg]ạch <span>\(3 mặt hàng\)<\/span>/.test(nodes.stockList.innerHTML),'Category join uses product database and normalizes letter case');
    assert(nodes.stockList.innerHTML.includes('Chưa phân loại'),'Missing category has explicit group');
    assert(nodes.stockList.innerHTML.includes('&lt;img onerror=x&gt;'),'Category headings escaped');
    assert(!nodes.stockList.innerHTML.includes('<img onerror=x>'),'Category cannot inject HTML');
    assert(nodes.stockList.innerHTML.includes('Tên &lt;svg&gt;'),'Grouped product names escaped');
    equal((nodes.stockList.innerHTML.match(/class="grouped-stock-row"/g)||[]).length,fixture.stock.length,'Grouping retains every stock row without merging units');
    assert(nodes.stockList.innerHTML.includes('Chưa phân loại <span>(1 mặt hàng)</span>'),'Two units of one pending product count as one product');
    assert(nodes.stockList.innerHTML.includes('>0,125</td>'),'Fractional stock remains exact when grouped');
    nodes.stockSearch.value='img onerror'; await emit(nodes.stockSearch,'input');
    assert(nodes.stockList.innerHTML.includes('TYPE-C'),'Stock search includes category even though type is not a row column');
    assert(nodes.stockCount.textContent.startsWith('1 / '),'Stock count reports filtered and full unique products');
    assert(nodes.pendingProducts.innerHTML.includes('TYPE-D'),'Stock filtering leaves pending queue intact');
    nodes.stockSearch.value='gach'; nodes.stockSort.value='qty-desc'; await emit(nodes.stockSort,'change');
    await emit(nodes.productsNav,'click'); await settle(); await emit(nodes.warehouseNav,'click'); await settle();
    equal(nodes.warehouseStockPanel.hidden,false,'Navigation preserves warehouse section');
    equal(nodes.stockSearch.value,'gach','Navigation preserves stock search');
    equal(nodes.stockSort.value,'qty-desc','Navigation preserves sorting');
    equal(nodes.stockGroupType.checked,true,'Navigation preserves grouping checkbox');
    nodes.stockGroupType.checked=false; await emit(nodes.stockGroupType,'change');
    assert(!nodes.stockList.innerHTML.includes('class="stock-group"'),'Unticking grouping restores flat rows');
    nodes.stockSearch.value=''; await emit(nodes.stockSearch,'input');
    await emit(nodes.receiptOpen,'click'); await select(0,'MH0001'); await input(0,'.receipt-qty',7.5);
    await emit(nodes.warehouseReceiptsTab,'click'); await emit(nodes.warehouseStockTab,'click');
    equal(field(0,'.receipt-qty').value,'7.5','Section changes preserve receipt draft');
    await emit(nodes.receiptClose,'click');
    print('PASS: '+checks+' inventory UI checks (production listeners, fake DOM, no network)');
}
run().catch(function (error) { print('FAIL: '+error.message+'\n'+error.stack); quit(1); });
