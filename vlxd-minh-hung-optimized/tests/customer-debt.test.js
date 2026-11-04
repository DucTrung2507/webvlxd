/* Công nợ tổng bằng Sheets giả lập; không gọi Google hoặc lập chứng từ thật. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs');
load('apps-script/inventory.gs');
load('apps-script/luuin.gs');
load('apps-script/soHD.gs');
load('apps-script/customers.gs');
load('apps-script/customer-debt.gs');
var hdHeader = ['Số HD','Ngày','Khách','Địa chỉ','Tổng','Trả','Nợ','Người giao','requestId','requestHash','customerId','debtStatementId'];
var ctHeader = ['Số HD','Tên hàng','SL','ĐVT','Giá','Thành tiền','productId'];
function resetDebt() {
    mock.sheets={HOADON:new FakeSheet('HOADON',[hdHeader]),CHITIET_HD:new FakeSheet('CHITIET_HD',[ctHeader])};
    mock.writes=0;mock.held=false;mock.acquires=0;mock.releases=0;mock.failWrite='';mock.reads=[];mock.writeLog=[];
}
function result(output) { equal(output.mime,ContentService.MimeType.JSON,'JSON response');return JSON.parse(output.getContent()); }
function post(input) { return result(doPost({postData:{contents:JSON.stringify(input)}})); }
function data() { return result(doGet({parameter:{action:'customers'}})); }
function history() { return result(doGet({parameter:{action:'list'}})).orders; }
function ok(input,label) { var output=post(input);equal(output.status,'success',label+(output.message?' '+output.message:''));return output; }
function snapshot() { return JSON.stringify(Object.keys(mock.sheets).sort().map(function(name){return [name,mock.sheets[name].rows];})); }
function rejects(input,label) { var before=snapshot(),writes=mock.writes;var output=post(input);equal(output.status,'error',label);equal(snapshot(),before,label+' preserves data');equal(mock.writes,writes,label+' no writes');equal(mock.held,false,label+' unlock');return output; }
function seedStock() {
    var product=ok({action:'createProduct',name:'Xi măng',type:'Vật liệu',baseUnit:'kg',units:[{unit:'kg',price:100,factor:1}],requestId:'product'},'create stock product').product;
    ok({action:'receiveStock',supplier:'NCC',paid:0,requestId:'stock',items:[{productId:product.id,qty:1000,unit:'kg',price:80}]},'seed stock');return product;
}
function sale(product,requestId,price,extra) {
    return Object.assign({date:'04/11/2026',customer:'Khách A',address:'Công trình A',phone:'0901234567',paid:0,requestId:requestId,items:[{productId:product.id,qty:1,unit:'kg',price:price}]},extra||{});
}
function create(id,requestId) { return {action:'createDebtStatement',customerId:id,requestId:requestId}; }
function pay(id,amount,requestId,extra) { return Object.assign({action:'payDebtStatement',statementId:id,amount:amount,date:'2026-11-04',note:'Thu tiền',requestId:requestId},extra||{}); }
function customer(id) { return data().customers.find(function(item){return item.id===id;}); }
function statement(id) { return data().statements.find(function(item){return item.id===id;}); }
function run() {
    resetDebt();
    var before=snapshot(),empty=data();equal(empty.schemaVersion,1,'Customer API version');equal(empty.statements.length,0,'No initial statements');equal(empty.payments.length,0,'No initial payments');equal(snapshot(),before,'GET creates no tabs');equal(mock.writes,0,'GET is read only');
    var product=seedStock();
    var first=ok(sale(product,'sale-a1',100),'First debt sale').order;
    var second=ok(sale(product,'sale-a2',200),'Second same customer sale').order;
    equal(first.customerId,second.customerId,'Many orders share KH id');assert(/^KH\d+$/.test(first.customerId),'Customer stable generated id');
    ok(sale(product,'sale-paid',50,{paid:50}),'Fully paid order');
    ok(sale(product,'sale-credit',50,{paid:60}),'Credit order');
    var other=ok(sale(product,'sale-other',90,{phone:'0909999999',address:'Công trình khác'}),'Other same-name customer').order;
    assert(other.customerId!==first.customerId,'Same name other identity distinct');
    var originalInvoices=JSON.stringify(mock.sheets.HOADON.rows),stockBefore=JSON.stringify(mock.sheets.CT_NHAPKHO.rows);
    var opened=ok(create(first.customerId,'statement-a'),'Open statement').statement;
    assert(/^CN\d+$/.test(opened.id),'Statement generated id');equal(opened.items.length,2,'Only two positive-debt invoices grouped');equal(opened.total,300,'Sum outstanding invoice debts');equal(opened.debt,300,'Initial remaining debt');equal(opened.status,'open','Statement starts open');equal(opened.customer.id,first.customerId,'Customer snapshot in statement');
    var afterCreate=snapshot(),writes=mock.writes;
    equal(ok(create(first.customerId,'statement-a'),'Replay creation').statement.id,opened.id,'Creation replay same statement');equal(snapshot(),afterCreate,'Creation replay no duplicate');equal(mock.writes,writes,'Creation replay no write');
    equal(ok(create(first.customerId,'statement-export'),'Export open again').statement.id,opened.id,'Export while open reuses statement');
    rejects(create(other.customerId,'statement-a'),'Creation request cannot cross customers');
    var partial=ok(pay(opened.id,120,'payment-a1'),'Partial payment');equal(partial.statement.paid,120,'Partial paid total');equal(partial.statement.debt,180,'Partial remaining');equal(partial.statement.status,'open','Partial remains open');equal(partial.payment.allocations[0].orderId,first.id,'FIFO first invoice');equal(partial.payment.allocations[0].amount,100,'First invoice cleared');equal(partial.payment.allocations[1].amount,20,'Remainder applied to second');
    var listed=history();equal(listed.find(function(o){return o.id===first.id;}).debt,0,'List invoice reflects payment');equal(listed.find(function(o){return o.id===second.id;}).debt,180,'List remaining invoice debt');equal(customer(first.customerId).debt,180,'Customer outstanding not doubled by statement');equal(customer(first.customerId).credit,10,'Overpaid historical credit kept separate');
    equal(JSON.stringify(mock.sheets.HOADON.rows),originalInvoices,'Payments do not rewrite source invoices');equal(JSON.stringify(mock.sheets.CT_NHAPKHO.rows),stockBefore,'Debt operations do not change inventory');
    var third=ok(sale(product,'sale-a3',50,{date:'05/11/2026'}),'New sale joins open').order;equal(third.debtStatementId,opened.id,'New sale atomic L statement link');equal(statement(opened.id).total,350,'Rolling total includes new invoice');equal(statement(opened.id).debt,230,'Rolling remaining includes new invoice');equal(statement(opened.id).throughDate,'2026-11-05','Through date includes newly joined invoice');
    rejects(pay(opened.id,231,'overpay'),'Cannot overpay statement');rejects(pay(opened.id,0,'zero'),'Cannot pay zero');rejects(pay(opened.id,-1,'negative'),'Cannot pay negative');rejects(pay(opened.id,1.001,'precision'),'Cannot silently round payment');rejects(pay(opened.id,'not-money','bad-money'),'Invalid money rejected');
    var beforeRetry=snapshot(),retryWrites=mock.writes;
    equal(ok(pay(opened.id,120,'payment-a1'),'Replay partial after new sale').payment.id,partial.payment.id,'Same payment id replay');equal(snapshot(),beforeRetry,'Payment replay no extra allocation');equal(mock.writes,retryWrites,'Payment replay no writes');rejects(pay(opened.id,121,'payment-a1'),'Payment changed payload same request rejected');
    var finished=ok(pay(opened.id,230,'payment-a2'),'Settle current total').statement;equal(finished.total,350,'Closed total retained');equal(finished.paid,350,'Closed paid retained');equal(finished.debt,0,'All invoices settled');equal(finished.status,'closed','Automatically closed at zero');equal(finished.items.length,3,'Closed snapshot has all rolling orders');equal(customer(first.customerId).debt,0,'Customer debt settled');
    var closedRows=JSON.stringify(mock.sheets.CONGNO_TONG.rows);
    var fourth=ok(sale(product,'sale-a4',40),'Future sale after close').order;equal(fourth.debtStatementId,'','Future debt not attached closed statement');equal(statement(opened.id).total,350,'Closed total never grows');equal(statement(opened.id).status,'closed','Closed statement stays closed');
    var next=ok(create(first.customerId,'statement-a-next'),'Next statement').statement;assert(next.id!==opened.id,'Another customer total id after close');equal(next.total,40,'Next total only new debt');equal(next.items.length,1,'Next statement excludes every prior invoice');equal(next.items[0].orderId,fourth.id,'Correct new invoice');equal(data().statements.filter(function(s){return s.customerId===first.customerId&&s.status==='open';}).length,1,'Only one open total per customer');
    equal(ok(create(first.customerId,'statement-export'),'Replay old export after closure').statement.id,opened.id,'Old export request remains old statement after closure');
    rejects(pay(opened.id,1,'closed-new-pay'),'Cannot pay already closed total');
    mock.failWrite='THU_CONGNO';rejects(pay(next.id,10,'failed-payment'),'Interrupted single-row payment has no partial allocation');equal(statement(next.id).paid,0,'Failure leaves balances unchanged');
    ok(pay(next.id,10,'failed-payment'),'Retry interrupted payment');equal(statement(next.id).debt,30,'Retry applies once');ok(pay(next.id,30,'next-final'),'Settle next total');rejects(create(first.customerId,'nothing-new'),'No empty total or duplicate debt');
    var otherTotal=ok(create(other.customerId,'other-total'),'Other customer total').statement;equal(otherTotal.total,90,'Same-name customer debt stays separate');equal(otherTotal.customerId,other.customerId,'Customer ownership stable');
    assert(mock.writeLog.every(function(entry){return entry.held;}),'Every debt/registry write under script lock');
    equal(mock.acquires,mock.releases,'All script locks released');

    resetDebt();
    mock.sheets.HOADON.rows.push(['HD011120260001','2026-11-01','Khách lịch sử','Địa chỉ cũ',200,50,150,'']);
    mock.sheets.HOADON.rows.push(['HD021120260001','2026-11-02','Khách lịch sử','Địa chỉ cũ',100,0,100,'']);
    var legacy=data().customers[0];assert(legacy.id.indexOf('LEGACY:')===0,'Legacy customer virtual without writes');equal(mock.writes,0,'Legacy reads do not migrate');var legacyRows=JSON.stringify(mock.sheets.HOADON.rows);
    var converted=ok(create(legacy.id,'legacy-create'),'Materialize legacy for debt').statement;assert(/^KH\d+$/.test(converted.customerId),'Legacy group receives true KH id');equal(converted.total,250,'Historical balances included');equal(data().customers.length,1,'Legacy not duplicated after materialization');equal(JSON.stringify(mock.sheets.HOADON.rows),legacyRows,'Legacy rows untouched');equal(ok(create(legacy.id,'legacy-create'),'Legacy creation retry').statement.id,converted.id,'Retry virtual id returns same KH statement');
    ok(pay(converted.id,250,'legacy-final'),'Settle legacy');equal(customer(converted.customerId).debt,0,'Legacy debt paid');equal(mock.sheets.HOADON.rows[1][6],150,'Historical raw debt preserved');

    resetDebt();
    mock.sheets.HOADON.rows.push(['OLD-UNKNOWN','','Khách chưa rõ ngày','',10,0,10,'']);
    mock.sheets.HOADON.rows.push(['HD011120260001','','Khách chưa rõ ngày','',20,0,20,'']);
    var unknown=ok(create(data().customers[0].id,'unknown-date'),'Group unknown legacy date').statement;
    equal(unknown.items.find(function(item){return item.orderId==='OLD-UNKNOWN';}).date,'','Unknown old date not replaced by today');
    equal(unknown.items.find(function(item){return item.orderId==='HD011120260001';}).date,'2026-11-01','Infer old date from valid invoice id');
    ok(pay(unknown.id,30,'unknown-final'),'Unknown dated invoice still payable');

    resetDebt();
    mock.sheets.HOADON.rows.push(['HD011120260001','2026-11-01','Khách lẻ','',100,0.25,99.75,'']);
    var centsCustomer=data().customers[0],cents=ok(create(centsCustomer.id,'cents-create'),'Fractional legacy debt').statement;equal(cents.total,99.75,'Legacy fractional debt exact');ok(pay(cents.id,0.25,'cents-partial'),'Fractional payment');equal(statement(cents.id).debt,99.5,'Fractional remaining exact');ok(pay(cents.id,99.5,'cents-final'),'Fractional final payment');equal(statement(cents.id).status,'closed','Fractional debt can close');
    mock.sheets.CONGNO_TONG.rows[0][0]='wrong';rejects(pay(cents.id,1,'corrupt-header'),'Wrong headers fail without writes');

    resetDebt();
    mock.sheets.HOADON.rows.push(['HD011120260001','2026-11-01','Khách lỗi','',10,0,10,'']);
    var corrupt=ok(create(data().customers[0].id,'corrupt-create'),'Prepare close corruption test').statement;ok(pay(corrupt.id,10,'corrupt-close'),'Prepare closed statement');
    mock.sheets.HOADON.rows.push(['HD021120260001','2026-11-02','Khách lỗi','',20,0,20,'','','',corrupt.customerId,corrupt.id]);
    equal(data().status,'error','Manual added order cannot reopen closed snapshot');
    print('PASS: '+checks+' customer debt checks (rolling, allocation, closure, retry, legacy; no network)');
}
try {run();} catch(error) {print('FAIL: '+error.message+'\n'+error.stack);quit(1);}
