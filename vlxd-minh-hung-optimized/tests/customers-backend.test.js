/* Customer registry and sale associations; no live Google writes. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs');
load('apps-script/inventory.gs');
load('apps-script/customers.gs');
load('apps-script/luuin.gs');
load('apps-script/soHD.gs');
var customerHd = ['Số HD','Ngày','Khách','Địa chỉ','Tổng','Trả','Nợ','Người giao'];
var customerCt = ['Số HD','Tên hàng','SL','ĐVT','Giá','Thành tiền','productId'];
function jsonResult(result) { return JSON.parse(result.getContent()); }
function customerPost(data) { return jsonResult(doPost({postData:{contents:JSON.stringify(data)}})); }
function customerGet() { return jsonResult(doGet({parameter:{action:'customers'}})); }
function customerSuccess(result, label) { equal(result.status,'success',label+(result.message?' '+result.message:'')); return result; }
function customerSnapshot() { return JSON.stringify(Object.keys(mock.sheets).sort().map(function (name) { return [name,mock.sheets[name].rows]; })); }
function customerReset(legacy) {
    mock.sheets={HOADON:new FakeSheet('HOADON',[customerHd].concat(legacy || [])),CHITIET_HD:new FakeSheet('CHITIET_HD',[customerCt])};
    mock.writes=0;mock.held=false;mock.acquires=0;mock.releases=0;mock.failWrite='';mock.reads=[];mock.alerts=[];mock.dialogs=[];mock.writeLog=[];
    mock.sheets.MATHANG=new FakeSheet('MATHANG',[inventoryTables_.products.headers,['SP000001','Xi măng','Vật liệu',1000,'','','[{"unit":"bao","price":1000,"factor":1}]','active','','bao']]);
    mock.sheets.NHAPKHO=new FakeSheet('NHAPKHO',[inventoryTables_.receipts.headers,['NK041120260001','2026-11-04','Nhà cung cấp','',1000000,0,1000000,'','']]);
    mock.sheets.CT_NHAPKHO=new FakeSheet('CT_NHAPKHO',[inventoryTables_.details.headers,['NK041120260001','SP000001','Xi măng',1000,'bao',1000,1000000]]);
}
function customerSale(requestId, extra) {
    return Object.assign({requestId:requestId,date:'04/11/2026',customer:'Anh Bình',address:'Công trình A',phone:'0901234567',paid:0,
        items:[{productId:'SP000001',qty:1,unit:'bao',price:1000}]},extra || {});
}
function customerReject(data, label) {
    var before=customerSnapshot(),writes=mock.writes;
    var result=customerPost(data);equal(result.status,'error',label);equal(customerSnapshot(),before,label+' preserves data');equal(mock.writes,writes,label+' no writes');equal(mock.held,false,label+' releases lock');
}
function runCustomers() {
    customerReset();
    var before=customerSnapshot(),writes=mock.writes,empty=customerGet();
    equal(empty.schemaVersion,1,'Customer API schema');equal(empty.customers.length,0,'Empty customers');equal(empty.orders.length,0,'Empty order list');
    equal(customerSnapshot(),before,'GET does not create customer/debt tabs');equal(mock.writes,writes,'GET does not write');
    customerReject(customerSale('stock-fail',{items:[{productId:'SP000001',qty:2000,unit:'bao',price:1000}]}),'Invalid stock creates no customer');
    customerReject(customerSale('bad-phone',{phone:'ABC'}),'Invalid phone rejected');
    customerReject(customerSale('bad-customer',{customerId:'KH999999'}),'Unknown customer code rejected');
    var first=customerSuccess(customerPost(customerSale('customer-first')),'First customer sale').order;
    equal(first.customerId,'KH000001','Auto assigned KH code');equal(first.phone,'0901234567','Phone returned');
    equal(mock.sheets.HOADON.rows[0][10],'customerId','Customer metadata header K');equal(mock.sheets.HOADON.rows[0][11],'debtStatementId','Statement metadata header L');
    equal(mock.sheets.HOADON.rows[1][10],first.customerId,'Sales store customer code');
    assert(mock.writeLog.every(function (entry) { return entry.held; }),'Customer and sale writes use script lock');
    var snapshot=customerSnapshot(),replayWrites=mock.writes;
    equal(customerSuccess(customerPost(customerSale('customer-first')),'Sale retry').order.id,first.id,'Retry same sale');equal(customerSnapshot(),snapshot,'Retry no duplicate data');equal(mock.writes,replayWrites,'Retry no writes');
    var second=customerSuccess(customerPost(customerSale('customer-second',{phone:'+84 901 234 567',address:'Công trình B'})),'Known phone').order;
    equal(second.customerId,first.customerId,'Normalized phone preserves customer across delivery addresses');
    var get=customerGet();equal(get.customers.length,1,'One customer many orders');equal(get.customers[0].orderCount,2,'Order count');equal(get.customers[0].debt,2000,'Debt sums linked orders');
    var other=customerSuccess(customerPost(customerSale('other-address',{phone:'',address:'Công trình khác'})),'Same name other address').order;
    assert(other.customerId!==first.customerId,'Same names different addresses are separate');
    var sameAddressOtherPhone=customerSuccess(customerPost(customerSale('other-phone',{phone:'0912345678'})),'Same name and address distinct phone').order;
    assert(sameAddressOtherPhone.customerId!==first.customerId,'Different phone creates distinct customer');
    customerReject(customerSale('ambiguous-no-phone',{phone:''}),'Ambiguous same name/address needs code');
    customerReject(customerSale('wrong-name',{customer:'Người khác'}),'Known phone cannot merge different name');
    customerReject(customerSale('wrong-code-name',{customerId:first.customerId,customer:'Người khác'}),'Selected customer wrong name rejected');
    customerReject(customerSale('wrong-code-phone',{customerId:first.customerId,phone:'0999999999'}),'Selected customer wrong phone rejected');
    customerReject(customerSale('customer-first',{customerId:other.customerId,phone:''}),'Retry cannot change customer identity');
    var selected=customerSuccess(customerPost(customerSale('explicit-code',{customerId:first.customerId,phone:'',address:'Một nơi mới'})),'Selected known customer').order;
    equal(selected.customerId,first.customerId,'Selected code authoritative across address changes');equal(selected.phone,'0901234567','Registry phone returned for selection');
    var selectedRead=jsonResult(doGet({parameter:{action:'list'}})).orders.find(function(order){return order.id===selected.id;});
    equal(selectedRead.customerId,first.customerId,'History exposes customerId');equal(selectedRead.phone,'0901234567','History exposes phone');

    var legacy=[['HD010120250001','2025-01-01','Khách Cũ','Địa chỉ Cũ',10000,3000,7000,''],['HD010120250002','2025-01-01','  khách   cũ ','  địa chỉ cũ ',20000,0,20000,'']];
    customerReset(legacy);
    var original=JSON.stringify(mock.sheets.HOADON.rows.slice(1));before=customerSnapshot();writes=mock.writes;
    get=customerGet();equal(get.customers.length,1,'Normalized legacy group is one virtual customer');assert(get.customers[0].legacy,'Legacy flag');assert(get.customers[0].id.indexOf('LEGACY:')===0,'Virtual legacy identifier');
    equal(get.customers[0].debt,27000,'Historical debts included');equal(customerSnapshot(),before,'Legacy GET is read only');equal(mock.writes,writes,'Legacy GET no metadata writes');
    var legacyId=get.customers[0].id;
    var linked=customerSuccess(customerPost(customerSale('legacy-new',{customer:'Khách Cũ',address:'Địa chỉ Cũ',phone:''})),'New sale joins legacy customer').order;
    equal(linked.customerId,'KH000001','Materialized real KH code');equal(JSON.stringify(mock.sheets.HOADON.rows.slice(1,3)),original,'Legacy invoice rows never rewritten');
    get=customerGet();equal(get.customers.length,1,'Real and legacy merged through legacyKey');assert(!get.customers[0].legacy,'Real customer flag');equal(get.customers[0].orderCount,3,'Historical and new orders together');equal(get.customers[0].debt,28000,'Combined historical/current debt');
    mock.held=true;var materialized=customersResolve_(spreadsheet(),{customerId:legacyId},true);mock.held=false;
    equal(materialized.id,linked.customerId,'Old virtual code resolves to real customer after materialization');
    customerReject(customerSale('forged-legacy',{customerId:'LEGACY:'+encodeURIComponent('["fake",""]'),customer:'fake',address:'',phone:''}),'Forged legacy id rejected');

    customerReset([legacy[0]]);get=customerGet();mock.held=true;
    var materialize=customersResolve_(spreadsheet(),{customerId:get.customers[0].id},true);mock.held=false;
    equal(materialize.id,'KH000001','Legacy statement mutation can materialize registry');
    equal(customerGet().orders[0].customerId,materialize.id,'Materialization maps old invoice without rewriting it');
    equal(JSON.stringify(mock.sheets.HOADON.rows[1]),JSON.stringify(legacy[0]),'Materialization preserves historical sale');

    customerReset();mock.failWrite='HOADON';
    equal(customerPost(customerSale('customer-header-failure')).status,'error','Interrupted sale reported');
    equal(mock.sheets.KHACHHANG,undefined,'Header validation failure precedes customer creation');
    equal(customerSuccess(customerPost(customerSale('customer-header-failure')),'Retry after interrupted metadata').order.customerId,'KH000001','Retry creates one customer');
    equal(customerGet().customers.length,1,'No duplicate after metadata retry');

    customerReset();
    // Metadata already exists; inject failure after the registry row has committed.
    mock.sheets.HOADON.rows[0]=customerHd.concat(['requestId','requestHash','customerId','debtStatementId']);
    mock.failWrite='CHITIET_HD';
    equal(customerPost(customerSale('customer-detail-failure')).status,'error','Interrupted detail save reported');
    equal(customersRegistry_(spreadsheet()).length,1,'Retryable customer placeholder persists after interrupted details');
    equal(customerSuccess(customerPost(customerSale('customer-detail-failure')),'Retry interrupted detail').order.customerId,'KH000001','Retry reuses committed customer identity');
    equal(customerGet().customers.length,1,'Detail retry never duplicates customer');
    print('PASS: '+checks+' customer registry and sale association checks');
}
try {runCustomers();} catch(error){print('FAIL: '+error.message+'\n'+error.stack);quit(1);}
