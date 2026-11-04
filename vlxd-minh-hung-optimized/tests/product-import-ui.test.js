/* Run from project root with the same JS VM runner as other UI tests; no browser/network. */
load('tests/ui-dom-fixture.js');
add('productExcelImport','button');
add('productImportPanel','dialog');
add('importBody','div',nodes.productImportPanel);
['productTemplateDownload','productImportChoose'].forEach(function (id) { add(id,'button',nodes.importBody); });
add('productExcelFile','input',nodes.importBody).hidden=true;
['productImportConfirm','productImportPause'].forEach(function (id) { add(id,'button',nodes.productImportPanel); });
['productImportSummary','productImportErrors','productImportProgress','productImportError'].forEach(function (id) { add(id,'div',nodes.importBody); });
add('importPreview','div',nodes.importBody,{'class':'order-table-wrapper'});
add('productImportList','div',nodes.importPreview);
add('importCloseTop','button',nodes.productImportPanel,{'data-close-product-import':''});
add('importCloseBottom','button',nodes.productImportPanel,{'data-close-product-import':''});
var filePickerCalls=0;
Element.prototype.click=function () { if (this===nodes.productExcelFile) filePickerCalls++; };
load('js/order-data.js');
load('js/vendor/xlsx.full.min.js');
window.XLSX=XLSX;
load('js/product-excel-data.js');
var app=window.InvoiceApp;
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() { var resolve,reject; var promise=new Promise(function (yes,no) { resolve=yes; reject=no; }); return {promise:promise,resolve:resolve,reject:reject}; }
var products=[{id:'MH0001',name:'Có sẵn',status:'active',baseUnit:'Viên',type:'Gạch',price:100,units:[{unit:'Viên',factor:1,price:100}]},
    {id:'MH0002',name:'Hàng chờ',status:'pending',baseUnit:'',type:'',price:0,units:[],receivedUnits:['Bao']}];
var loads=[],responses=[],sent=[],loadCalls=0,remembered=[];
app.Inventory={
    load:function () { loadCalls++; var value=loads.length?loads.shift():{products:clone(products)}; return value instanceof Error?Promise.reject(value):Promise.resolve(value); },
    getAllProducts:function () { return clone(products); },
    rememberProduct:function (product) { remembered.push(clone(product)); var index=products.findIndex(function (p) { return p.id===product.id; }); if(index<0)products.push(clone(product)); else products[index]=clone(product); }
};
app.API={createProduct:function (payload) { sent.push(clone(payload));var response=responses.length?responses.shift():Object.assign({id:'MH'+String(products.length+1).padStart(4,'0'),status:'active'},clone(payload));return response instanceof Error?Promise.reject(response):Promise.resolve(response); }};
var downloads=[];
XLSX.writeFile=function (workbook,name,options) { downloads.push({workbook:workbook,name:name,options:options}); };
load('js/product-import.js');
async function emit(el,type,extra) { var event=Object.assign({target:el,preventDefault:function () { this.defaultPrevented=true; }},extra||{});for(var fn of el.listeners[type]||[]) await fn(event);return event; }
async function settle() { for(var i=0;i<16;i++) await Promise.resolve(); }
function workbook(rows) { var book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([app.ProductExcelData.headers].concat(rows)),'Mat_hang');return book; }
function buffer(rows) { return XLSX.write(workbook(rows),{type:'array',bookType:'xlsx'}); }
function file(name,rows,override) { var content=buffer(rows);return Object.assign({name:name,size:content.byteLength,arrayBuffer:function () { return Promise.resolve(content); }},override||{}); }
async function choose(source) { nodes.productExcelFile.files=source?[source]:[];nodes.productExcelFile.value='selected';return emit(nodes.productExcelFile,'change'); }
function one(name) { return [[name,'Gạch','Viên','Viên',1,10000]]; }
function complete(name,id) { return {id:id,name:name,type:'Gạch',baseUnit:'Viên',status:'active',price:10000,units:[{unit:'Viên',price:10000,factor:1}]}; }
async function run() {
    await emit(document,'DOMContentLoaded');
    assert(nodes.productImportConfirm.disabled,'No batch cannot be imported');
    await emit(nodes.productExcelImport,'click');equal(nodes.productImportPanel.open,true,'Toolbar import always opens dialog');equal(filePickerCalls,0,'Opening import dialog never automatically opens file picker');equal(document.activeElement,nodes.productImportChoose,'Import dialog focuses explicit file chooser');
    equal(nodes.productImportChoose.textContent,'Chọn file Excel','Initial modal offers first Excel file selection');assert(!nodes.productImportPanel.className.includes('has-preview'),'Initial modal uses compact size');equal(nodes.importPreview.hidden,true,'Empty modal hides preview table');
    equal(nodes.productTemplateDownload.closest('dialog'),nodes.productImportPanel,'Template link belongs inside import dialog');equal(nodes.productImportChoose.closest('dialog'),nodes.productImportPanel,'File chooser belongs inside import dialog');equal(nodes.productExcelFile.closest('dialog'),nodes.productImportPanel,'Hidden file input belongs inside import dialog');
    await emit(nodes.productTemplateDownload,'click');equal(downloads.length,1,'Template link creates one workbook');equal(filePickerCalls,0,'Downloading template never opens native file picker');
    equal(downloads[0].name,'Mau_mat_hang_Minh_Hung.xlsx','Template has recognizable Excel filename');
    equal(JSON.stringify(downloads[0].workbook.SheetNames),JSON.stringify(['Mat_hang','Vi_du','Huong_dan']),'Download includes empty entry sheet, examples and instructions');
    equal(XLSX.utils.sheet_to_json(downloads[0].workbook.Sheets.Mat_hang,{header:1}).length,1,'Main template never imports example products accidentally');
    await emit(nodes.productImportChoose,'click');equal(filePickerCalls,1,'Explicit file chooser inside dialog opens native picker');
    await choose(null);equal(nodes.productImportPanel.open,true,'Cancelling picker keeps compact import dialog open');equal(nodes.productImportChoose.textContent,'Chọn file Excel','Cancellation preserves initial file chooser label');equal(sent.length,0,'Cancellation never writes');
    await choose(file('data.csv',one('Sai đuôi')));assert(nodes.productImportError.textContent.includes('.xlsx'),'Wrong extension has useful error');assert(nodes.productImportConfirm.disabled,'Wrong extension blocks import');
    equal(nodes.productExcelFile.value,'','File input clears so same filename may be selected again');
    await choose(file('empty.xlsx',[],{size:0}));assert(nodes.productImportError.textContent.includes('5 MB'),'Empty file rejected');
    await choose(file('large.xlsx',one('Quá lớn'),{size:5*1024*1024+1}));assert(nodes.productImportError.textContent.includes('5 MB'),'Oversized file rejected before reading');
    await choose(file('bad.xlsx',[],{size:5,arrayBuffer:function () { return Promise.reject(new Error('Không đọc được bộ nhớ <img>')); }}));
    equal(nodes.productImportError.textContent,'Không đọc được bộ nhớ <img>','File read errors render plain text');assert(nodes.productImportConfirm.disabled,'Read failure cannot import previous batch');
    var savedTools=window.XLSX;window.XLSX=null;await emit(nodes.productTemplateDownload,'click');assert(nodes.productImportError.textContent.includes('công cụ đọc Excel'),'Missing vendor download failure is visible');window.XLSX=savedTools;
    equal(sent.length,0,'Invalid files and missing tools never write');

    await choose(file('mixed.xlsx',[['Hợp lệ','Gạch','Viên','Viên',1,10000],['Sai giá','Gạch','Viên','Viên',1,0]]));
    assert(!nodes.productImportErrors.hidden,'Workbook validation lists invalid rows');assert(nodes.productImportErrors.innerHTML.includes('Dòng 3'),'Error points to original Excel row');assert(nodes.productImportConfirm.disabled,'Any invalid row blocks entire workbook');
    await emit(nodes.productImportConfirm,'click');equal(sent.length,0,'Direct confirm event cannot bypass validation');
    await choose(file('pending.xlsx',one(' HÀNG CHỜ ')));assert(!nodes.productImportErrors.hidden,'Pending products also prevent duplicate new names');assert(nodes.productImportConfirm.disabled,'Pending name collision blocks import');
    await choose(file('active.xlsx',one('CÓ SẴN')));assert(!nodes.productImportErrors.hidden,'Active name collision ignores case');equal(sent.length,0,'Existing names never overwrite through import');
    loads.push(null);await choose(file('offline.xlsx',one('Chưa tải được')));assert(nodes.productImportError.textContent.includes('kiểm tra tên trùng'),'Cannot import when catalog validation fails');assert(nodes.productImportConfirm.disabled,'Failed catalog fetch blocks writes');

    await choose(file('decimal.xlsx',[['Giá lẻ','Gạch','Viên','Viên',1,12.34567]]));assert(nodes.productImportList.innerHTML.includes('12,34567 đ'),'Preview preserves fractional unit prices without rounding');

    var rows=[['Gạch <img>','Gạch <svg>','Viên','Viên',1,10000],['Gạch <img>','Gạch <svg>','Viên','Thùng',12,115000],['Xi măng Excel','Xi măng','kg','kg',1,2000],['Xi măng Excel','Xi măng','kg','Bao',50,95000],['Cát Excel','Vật liệu','m³','m³',1,200000]];
    await choose(file('valid.xlsx',rows));equal(nodes.productImportPanel.open,true,'Valid workbook opens preview');assert(!nodes.productImportConfirm.disabled,'Valid workbook enables confirmation');assert(nodes.productImportPanel.className.includes('has-preview'),'Validated product preview expands dialog');equal(nodes.importPreview.hidden,false,'Validated preview table becomes visible');equal(nodes.productImportChoose.textContent,'Chọn file khác','Selected workbook offers replacement file chooser');
    assert(nodes.productImportSummary.textContent.includes('5 dòng · 3 mặt hàng · 0 lỗi'),'Multiple units group into three product previews');equal(sent.length,0,'Preview requires explicit confirmation before writes');
    assert(nodes.productImportList.innerHTML.includes('Gạch &lt;img&gt;'),'Preview escapes product names');assert(nodes.productImportList.innerHTML.includes('Gạch &lt;svg&gt;'),'Preview escapes type names');assert(!nodes.productImportList.innerHTML.includes('<img>'),'Name never injects preview element');
    await choose(null);assert(nodes.productImportSummary.textContent.includes('valid.xlsx'),'Cancelling replacement picker preserves ready batch');
    var first=deferred();responses.push(first.promise);var importing=emit(nodes.productImportConfirm,'click');await settle();
    equal(sent.length,1,'First product starts before any later product');equal(sent[0].units.length,2,'Grouped product sends all unit prices in one request');equal(sent[0].units[1].factor,12,'Unit conversion factor retained');equal(sent[0].units[1].price,115000,'Unit selling price retained');equal(sent[0].baseUnit,'Viên','Base unit retained');equal(sent[0].price,10000,'Base price sent separately');
    assert(!!sent[0].requestId,'Import supplies request key');assert(!Object.prototype.hasOwnProperty.call(sent[0],'rows'),'Excel-only source rows never reach backend');
    ['productImportConfirm','productImportChoose','productExcelImport','productTemplateDownload','productExcelFile','importCloseTop','importCloseBottom'].forEach(function (id) { assert(nodes[id].disabled,'In-flight control disabled: '+id); });
    assert(!nodes.productImportPause.hidden,'Pause is offered while saving');
    await emit(nodes.productImportConfirm,'click');equal(sent.length,1,'Duplicate confirmation blocked while save in flight');
    await emit(nodes.importCloseTop,'click');equal(nodes.productImportPanel.open,true,'Close button guarded while saving');var cancellation=await emit(nodes.productImportPanel,'cancel');assert(cancellation.defaultPrevented,'Native Esc default close prevented');equal(nodes.productImportPanel.open,true,'Esc cannot discard an active save');
    await choose(file('ignored.xlsx',one('Không được thay')));assert(nodes.productImportSummary.textContent.includes('valid.xlsx'),'New file event cannot replace active batch');
    await emit(nodes.productImportPause,'click');assert(nodes.productImportPause.disabled,'Pause cannot queue duplicates');first.resolve(Object.assign(complete('Gạch <img>','MH0100'),{type:'Gạch <svg>',units:clone(sent[0].units)}));await importing;
    equal(sent.length,1,'Pause waits for current then sends no next product');assert(nodes.productImportProgress.textContent.includes('1 / 3'),'Confirmed current product remains counted after pause');assert(!nodes.productImportConfirm.disabled,'Paused batch can resume');equal(remembered.length,1,'Confirmed server product updates local catalog immediately');
    await emit(nodes.importCloseBottom,'click');equal(nodes.productImportPanel.open,false,'Paused batch can close');var picks=filePickerCalls;await emit(nodes.productExcelImport,'click');equal(nodes.productImportPanel.open,true,'Toolbar reopens unfinished batch');equal(filePickerCalls,picks,'Reopening unfinished batch does not replace it');

    responses.push(new Error('Mất kết nối <script>'));await emit(nodes.productImportConfirm,'click');equal(sent.length,2,'Resume skips confirmed product and sends only next');assert(nodes.productImportError.textContent.includes('Mất kết nối <script>'),'Uncertain save error is visible');assert(nodes.productImportList.innerHTML.includes('Mất kết nối &lt;script&gt;'),'Per-product server error escaped in table');assert(!nodes.productImportConfirm.disabled,'Failed batch can retry');
    assert(nodes.productImportProgress.textContent.includes('1 / 3'),'Failed save never counted confirmed');var secondAttempt=clone(sent[1]);
    responses.push(Object.assign(complete('Xi măng Excel','MH0101'),{type:'Xi măng',baseUnit:'kg',price:2000,units:clone(secondAttempt.units)}));responses.push(Object.assign(complete('Cát Excel','MH0102'),{type:'Vật liệu',baseUnit:'m³',price:200000,units:[{unit:'m³',price:200000,factor:1}]}));
    await emit(nodes.productImportConfirm,'click');equal(sent.length,4,'Retry sends failed and remaining entries once');equal(JSON.stringify(sent[2]),JSON.stringify(secondAttempt),'Retry keeps identical payload and request key for uncertain save');assert(sent[3].requestId!==sent[2].requestId,'Different products have independent request keys');equal(remembered.length,3,'Only confirmed products remembered');assert(nodes.productImportProgress.textContent.includes('3 / 3'),'All confirmed products counted');assert(nodes.productImportProgress.textContent.includes('Hoàn tất.'),'Completion announced');assert(nodes.productImportConfirm.disabled,'Completed batch cannot be submitted again');
    await emit(nodes.productImportConfirm,'click');equal(sent.length,4,'Programmatic second confirm cannot duplicate completed batch');equal(nodes.productImportError.hidden,true,'Successful retry clears stale errors');
    await emit(nodes.importCloseTop,'click');await emit(nodes.productExcelImport,'click');equal(nodes.productImportPanel.open,true,'Completed batch toolbar opens fresh dialog');equal(filePickerCalls,picks,'Completed batch toolbar never opens native picker');equal(nodes.productImportChoose.textContent,'Chọn file Excel','Completed batch reopens first file selection control');assert(!nodes.productImportPanel.className.includes('has-preview'),'Completed batch reopens compact modal');equal(nodes.importPreview.hidden,true,'New import hides completed preview');equal(nodes.productImportProgress.textContent,'','New import clears completed progress');assert(nodes.productImportConfirm.disabled,'Fresh dialog cannot repeat completed batch');await emit(nodes.productImportChoose,'click');equal(filePickerCalls,picks+1,'Fresh dialog waits for explicit chooser click');

    await choose(file('overlapping-refresh.xlsx',one('Lượt tạm dừng').concat(one('Lượt tiếp tục'))));
    var pausedSave=deferred(),oldRefresh=deferred();responses.push(pausedSave.promise);loads.push(oldRefresh.promise);var pausedRun=emit(nodes.productImportConfirm,'click');await settle();await emit(nodes.productImportPause,'click');pausedSave.resolve(complete('Lượt tạm dừng','MH0200'));await settle();
    assert(!nodes.productImportConfirm.disabled,'Paused run can resume while its catalog refresh remains pending');
    await emit(nodes.productImportConfirm,'click');assert(nodes.productImportProgress.textContent.includes('Hoàn tất.'),'Resumed run can finish before previous refresh');oldRefresh.resolve(null);await pausedRun;equal(nodes.productImportError.hidden,true,'Older failed refresh never warns over a newer successful run');

    await choose(file('refresh-failure.xlsx',one('Đã xác nhận')));loads.push(null);await emit(nodes.productImportConfirm,'click');assert(nodes.productImportProgress.textContent.includes('Hoàn tất.'),'Refresh failure never rolls confirmed success back');assert(nodes.productImportError.textContent.includes('chưa làm mới được danh mục'),'Post-save refresh failure informs user');assert(nodes.productImportConfirm.disabled,'Post-save refresh failure cannot duplicate confirmed item');
    var count=sent.length;
    var slowRead=deferred(),slowFile=file('old-read.xlsx',one('Cũ'),{arrayBuffer:function () { return slowRead.promise; }});var oldRead=choose(slowFile);await settle();
    await choose(file('new-read.xlsx',one('Mới sau đọc')));slowRead.resolve(buffer(one('Cũ')));await oldRead;assert(nodes.productImportSummary.textContent.includes('new-read.xlsx'),'Older file read cannot replace newer preview');assert(nodes.productImportList.innerHTML.includes('Mới sau đọc'),'Latest file products retained');
    var slowCatalog=deferred();loads.push(slowCatalog.promise);var oldCatalog=choose(file('old-catalog.xlsx',one('Cũ danh mục')));await settle();
    await choose(file('new-catalog.xlsx',one('Mới danh mục')));slowCatalog.resolve({products:clone(products)});await oldCatalog;assert(nodes.productImportSummary.textContent.includes('new-catalog.xlsx'),'Older catalog await cannot replace newer preview');assert(nodes.productImportList.innerHTML.includes('Mới danh mục'),'Latest preview survives stale catalog completion');
    var closedRead=deferred(),closing=choose(file('closed.xlsx',one('Không được hiện lại'),{arrayBuffer:function () { return closedRead.promise; }}));await settle();await emit(nodes.importCloseTop,'click');equal(nodes.productImportPanel.open,false,'Close permitted during local file parsing');closedRead.resolve(buffer(one('Không được hiện lại')));await closing;equal(nodes.productImportPanel.open,false,'Stale parse cannot reopen closed dialog');
    equal(sent.length,count,'Replacements, stale parses and close never save implicitly');assert(loadCalls>0,'Catalog refreshed for import validation and after confirmed saves');
    print('PASS product Excel import UI: '+checks+' checks');
}
run().catch(function (error) { print(error.stack||error);quit(1); });
