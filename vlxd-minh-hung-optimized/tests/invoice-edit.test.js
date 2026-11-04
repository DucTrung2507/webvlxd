/* Chỉnh sửa nguyên tử qua revision, Apps Script/Sheets giả; không gọi Google. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs'); load('apps-script/inventory.gs');
load('apps-script/luuin.gs'); load('apps-script/soHD.gs');
load('apps-script/customers.gs'); load('apps-script/customer-debt.gs'); load('apps-script/invoice-edit.gs');
var hdHeader=['Số HD','Ngày','Khách','Địa chỉ','Tổng','Trả','Nợ','Người giao','requestId','requestHash','customerId','debtStatementId'];
var ctHeader=['Số HD','Tên hàng','SL','ĐVT','Giá','Thành tiền','productId'];
function reset() {mock.sheets={HOADON:new FakeSheet('HOADON',[hdHeader]),CHITIET_HD:new FakeSheet('CHITIET_HD',[ctHeader])};mock.writes=0;mock.held=false;mock.acquires=0;mock.releases=0;mock.failWrite='';mock.reads=[];mock.writeLog=[];}
function post(value){return JSON.parse(doPost({postData:{contents:JSON.stringify(value)}}).getContent());}
function read(action){var result=JSON.parse(doGet({parameter:{action:action}}).getContent());assert(result.status!=='error',action+': '+result.message);return result;}
function ok(value,message){var result=post(value);equal(result.status,'success',message+': '+result.message);return result;}
function snapshot(){return JSON.stringify(Object.keys(mock.sheets).sort().map(function(k){return [k,mock.sheets[k].rows];}));}
function reject(value,message){var before=snapshot(),writes=mock.writes;var result=post(value);equal(result.status,'error',message);equal(snapshot(),before,message+' keeps all source rows');equal(mock.writes,writes,message+' does not write');equal(mock.held,false,message+' unlocks');return result;}
function order(id){return read('list').orders.find(function(o){return o.id===id;});}
function stock(id){return read('inventory').stock.find(function(item){return item.productId===id;}).qty;}
function product(){var p=ok({action:'createProduct',name:'Gạch xanh',type:'Gạch',baseUnit:'viên',units:[{unit:'viên',price:100,factor:1},{unit:'kiện',price:900,factor:10}],requestId:'product'},'Create product').product;ok({action:'receiveStock',supplier:'NCC',paid:0,requestId:'stock',items:[{productId:p.id,qty:100,unit:'viên',price:80}]},'Receive initial stock');return p;}
function sale(p,key,extra){return Object.assign({date:'04/11/2026',customer:'Khách A',phone:'0901234567',address:'Công trình A',paid:100,requestId:key,items:[{productId:p.id,qty:10,unit:'viên',price:100}]},extra||{});}
function edit(o,key,extra){return Object.assign({action:'updateOrder',id:o.id,baseVersion:o.version||0,requestId:key,date:o.date,customer:o.customer,customerId:o.customerId,phone:o.phone,address:o.address,shipper:o.shipper,paid:o.originalPaid===undefined?o.paid:o.originalPaid,items:o.items.map(function(item){return Object.assign({},item);})},extra||{});}
function statement(id){return read('customers').statements.find(function(s){return s.id===id;});}
function run(){
 reset();var p=product(),first=ok(sale(p,'sale'),'Initial sale').order,originalHD=JSON.stringify(mock.sheets.HOADON.rows),originalCT=JSON.stringify(mock.sheets.CHITIET_HD.rows);
 first=order(first.id);equal(first.version,0,'New sale starts version zero');equal(first.canEdit,true,'Ungrouped sale can edit');equal(stock(p.id),90,'Initial stock deducted');
 var update=edit(first,'edit-1',{date:'2027-02-01',items:[{productId:p.id,qty:12,unit:'viên',price:100}]});
 var edited=ok(update,'Increase quantity').order;equal(edited.id,first.id,'Edit keeps invoice code');equal(edited.date,first.date,'Edit keeps original date');equal(edited.version,1,'Edit increments revision');equal(edited.total,1200,'Recalculate total');equal(edited.debt,1100,'Recalculate debt');equal(stock(p.id),88,'Stock deducts only quantity difference');
 equal(JSON.stringify(mock.sheets.HOADON.rows),originalHD,'Original header immutable');equal(JSON.stringify(mock.sheets.CHITIET_HD.rows),originalCT,'Original details immutable');equal(mock.sheets.SUAHOADON.rows.length,2,'Single committed revision row');
 var beforeRetry=snapshot(),writes=mock.writes;equal(ok(update,'Retry same revision').order.version,1,'Retry gets saved revision');equal(snapshot(),beforeRetry,'Retry does not append');equal(mock.writes,writes,'Retry does not write');equal(stock(p.id),88,'Retry does not double-deduct');
 reject(edit(first,'stale',{shipper:'Khác'}),'Stale version rejected');reject(Object.assign({},update,{paid:1}),'Same request changed content rejected');
 reject(edit(edited,'oversell',{items:[{productId:p.id,qty:101,unit:'viên',price:100}],customer:'Khách mới',customerId:'',phone:'0909999999'}),'Oversell rejected before new customer created');
 reject(edit(edited,'invalid-unit',{items:[{productId:p.id,qty:1,unit:'bao',price:100}]}),'Unknown unit rejected');
 reject(edit(edited,'zero',{items:[{productId:p.id,qty:0,unit:'viên',price:100}]}),'Zero quantity rejected');
 reject(edit(edited,'negative-paid',{paid:-1}),'Negative paid rejected');
 edited=ok(edit(edited,'edit-unit',{paid:200,items:[{productId:p.id,qty:2,unit:'kiện',price:900}]}),'Change unit').order;equal(edited.version,2,'Second revision');equal(edited.total,1800,'Unit price retained');equal(stock(p.id),80,'Conversion applies before stock delta');
 // Interrupted append leaves effective invoice and inventory unchanged; retry uses same request.
 var interrupted=edit(edited,'interrupt',{items:[{productId:p.id,qty:1.5,unit:'kiện',price:900}]});mock.failWrite='SUAHOADON';reject(interrupted,'Failed revision append');equal(stock(p.id),80,'Failure does not change stock');edited=ok(interrupted,'Retry interrupted append').order;equal(stock(p.id),85,'Retry commits once');equal(edited.version,3,'Failure did not consume version');
 var changedCustomer=ok(edit(edited,'change-customer',{customer:'Khách B',customerId:'',phone:'0908888888',address:'Công trình B'}),'Change ungrouped customer').order;assert(changedCustomer.customerId!==first.customerId,'New customer linked by code');equal(read('customers').orders.filter(function(o){return o.customerId===changedCustomer.customerId;}).length,1,'Customer grouping uses effective revision');
 // Replaying an older revision after a later edit returns current state without overwriting it.
 var afterLatest=snapshot();equal(ok(update,'Replay older revision').order.version,4,'Old request cannot revert newer revision');equal(snapshot(),afterLatest,'Old replay does not append');
 assert(mock.writeLog.every(function(entry){return entry.held;}),'All revision/customer writes under script lock');

 reset();p=product();first=ok(sale(p,'group-sale'),'Sale to group').order;var opened=ok({action:'createDebtStatement',customerId:first.customerId,requestId:'group'},'Open debt').statement;
 equal(opened.items[0].goods[0].name,'Gạch xanh','Statement snapshots goods');equal(opened.items[0].goods[0].qty,10,'Statement goods quantity');
 first=order(first.id);equal(first.canEdit,true,'Open grouped invoice editable');equal(first.debtStatementId,opened.id,'Initial JSON-claimed invoice exposes owning statement');equal(mock.sheets.HOADON.rows[1][11],'','Computed owning statement does not rewrite source L');var grouped=ok(edit(first,'group-edit',{items:[{productId:p.id,qty:12,unit:'viên',price:100}]}),'Edit initial grouped invoice').order;
 equal(statement(opened.id).total,1100,'Open statement total follows edited contribution');equal(statement(opened.id).debt,1100,'Open remaining adjusted');equal(statement(opened.id).items[0].goods[0].qty,12,'Open goods follow revision');equal(JSON.parse(mock.sheets.CONGNO_TONG.rows[1][5])[0].debt,900,'Initial stored statement snapshot untouched');
 ok({action:'payDebtStatement',statementId:opened.id,amount:300,date:'2026-11-04',requestId:'partial'},'Partial ledger collection');grouped=order(first.id);equal(grouped.originalPaid,100,'Original paid separate');equal(grouped.paid,400,'Effective paid includes ledger');equal(grouped.debt,800,'Effective remaining after collection');
 grouped=ok(edit(grouped,'after-payment',{items:[{productId:p.id,qty:15,unit:'viên',price:100}]}),'Edit after partial payment').order;equal(grouped.originalPaid,100,'Editing retains original paid');equal(grouped.debtPaid,300,'Existing ledger allocations retained');equal(grouped.debt,1100,'Ledger subtracted exactly once');equal(statement(opened.id).total,1400,'Statement contribution revised after collection');equal(statement(opened.id).paid,300,'Statement collected unchanged');equal(statement(opened.id).debt,1100,'Statement debt consistent');
 reject(edit(grouped,'below-allocated',{paid:1400}),'Cannot reduce debt below prior allocations');
 reject(edit(grouped,'implicit-close',{paid:1200}),'Cannot implicitly close statement by editing');
 reject(edit(grouped,'change-group-customer',{customer:'Khách B',customerId:'',phone:'0909999999'}),'Grouped customer cannot change');
 reject(edit(grouped,'zero-group-debt',{paid:1500}),'Grouped invoice needs positive contribution');
 var later=ok(sale(p,'later',{qty:1,paid:0,items:[{productId:p.id,qty:1,unit:'viên',price:50}]}),'New sale joins open').order;equal(later.debtStatementId,opened.id,'New linked invoice joins same statement');
 later=ok(edit(order(later.id),'edit-linked',{items:[{productId:p.id,qty:2,unit:'viên',price:50}]}),'Edit L-linked invoice').order;equal(statement(opened.id).total,1500,'Edited linked contribution included');equal(statement(opened.id).debt,1200,'Grouped debt includes both revised invoices');
 var closed=ok({action:'payDebtStatement',statementId:opened.id,amount:1200,date:'2026-11-04',requestId:'final'},'Close revised statement').statement;equal(closed.status,'closed','Revised statement closes');equal(closed.total,1500,'Closed total frozen at edited amount');equal(closed.items[0].goods[0].qty,15,'Closed goods frozen');equal(statement(opened.id).total,1500,'Closed reads work with original row total');equal(order(first.id).debt,0,'Effective invoice fully collected');equal(order(first.id).canEdit,false,'Closed invoice not editable');assert(order(first.id).editBlockedReason.includes('tất toán'),'Blocked explanation');reject(edit(order(first.id),'closed-edit',{shipper:'Khác'}),'Closed invoice rejects update');
 var frozenGoods=JSON.stringify(statement(opened.id).items);mock.sheets.CHITIET_HD.rows[1][1]='Tên sửa tay';equal(JSON.stringify(statement(opened.id).items),frozenGoods,'Closed goods not derived from later original changes');

 // Old five/six-column detail history remains readable; revised legacy invoices count stock once.
 reset();p=product();mock.sheets.HOADON.rows.push(['HD011120260001','2026-11-01','Khách lịch sử','',200,200,0,'']);mock.sheets.CHITIET_HD.rows.push(['HD011120260001','Gạch cũ',2,100,200]);var legacy=order('HD011120260001');equal(stock(p.id),100,'Untracked old invoice not silently deducted');var oldHD=JSON.stringify(mock.sheets.HOADON.rows),oldCT=JSON.stringify(mock.sheets.CHITIET_HD.rows);
 var repaired=ok(edit(legacy,'legacy-edit',{customerId:legacy.customerId,paid:200,items:[{productId:p.id,qty:2,unit:'viên',price:100}]}),'Edit legacy invoice to valid catalog').order;equal(repaired.date,'2026-11-01','Legacy date preserved');equal(stock(p.id),98,'Legacy revised invoice enters stock once');equal(JSON.stringify(mock.sheets.HOADON.rows),oldHD,'Legacy header preserved');equal(JSON.stringify(mock.sheets.CHITIET_HD.rows),oldCT,'Legacy mixed details preserved');
 mock.sheets.SUAHOADON.rows[0][0]='bad';var corrupted=post(edit(repaired,'bad-schema'));equal(corrupted.status,'error','Revision schema mismatch fails safely');
 print('PASS: '+checks+' invoice revision checks (stock delta, open debt, snapshots, retry and legacy)');
}
try{run();}catch(error){print('FAIL: '+error.message+'\n'+error.stack);quit(1);}
