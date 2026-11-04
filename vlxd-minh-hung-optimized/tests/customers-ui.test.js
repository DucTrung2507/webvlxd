/* Actual customer UI listeners with fake DOM/API; no live customers or payments. */
load('tests/ui-dom-fixture.js');
['customersStatus','customersCount','customersOwing','customersDebt','customersOpenStatements','customerList','customerOptions',
    'customerDetailTitle','customerDetailCode','customerDetailContact','customerOrderCount','customerStatementCount','customerOrders','customerStatements'].forEach(function (id) { add(id,'div'); });
add('customerSearch','input');
var customerPanel=add('customerDetailPanel','dialog');
add('customerDetail','section',customerPanel);nodes.customerDetail.hidden=true;
add('customerDetailStatus','p',customerPanel);
add('customerClose','button',customerPanel,{'data-close-customer-detail':''});
['customersRefresh','customerExportDebt'].forEach(function (id) { add(id,'button'); });
var statementPanel=add('debtStatementPanel','dialog');
['debtStatementTitle','debtStatementMeta','debtStatementCustomer','debtStatementStatus','debtStatementItems','debtStatementTotal','debtStatementPaid','debtStatementDebt','debtStatementPayments'].forEach(function (id) { add(id,'div',statementPanel); });
['debtStatementPrint','debtStatementCollect'].forEach(function (id) { add(id,'button',statementPanel); });
add('statementClose','button',statementPanel,{'data-close-debt-statement':''});
var paymentPanel=add('customerPaymentPanel','dialog'),paymentForm=add('customerPaymentForm','form',paymentPanel);
['customerPaymentAmount','customerPaymentDate','customerPaymentNote'].forEach(function (id) { add(id,'input',paymentForm); });
['customerPaymentInfo','customerPaymentError'].forEach(function (id) { add(id,'p',paymentForm); });
['customerPaymentFull','customerPaymentSave'].forEach(function (id) { add(id,'button',paymentForm); });
add('paymentClose','button',paymentForm,{'data-close-customer-payment':''});
load('js/order-data.js');
var app=window.InvoiceApp,inventoryCalls=0,listRefreshes=0,created=[],paid=[],printed=[],notifications=[];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() { var resolve,reject; var promise=new Promise(function(yes,no){resolve=yes;reject=no;}); return {promise:promise,resolve:resolve,reject:reject}; }
var customer={id:'KH000001',name:'Khách <img>',phone:'0900000001',address:'Địa chỉ <script>'};
var original={id:'CN041120260001',customerId:customer.id,date:'2026-11-04',throughDate:'2026-11-04',customer:customer,
    items:[{orderId:'HD041120260001',date:'2026-11-04',total:150000,paid:50000,debt:100000}],total:100000,paid:0,debt:100000,status:'open',payments:[]};
var fixture={schemaVersion:1,customers:[customer,{id:'KH000002',name:'Trùng tên',phone:'0900000002',address:'Địa chỉ A'},{id:'KH000003',name:'Trùng tên',phone:'0900000003',address:'Địa chỉ B'},
    {id:'legacy-v1',name:'Khách cũ',phone:'',address:'Địa chỉ cũ',legacy:true}],
    orders:[{id:'HD041120260001',date:'2026-11-04',customerId:customer.id,customer:customer.name,total:150000,paid:50000,debt:100000},
        {id:'HD041120260002',date:'2026-11-04',customerId:'KH000002',total:20000,paid:30000,debt:-10000},
        {id:'HD041120260003',date:'2026-11-04',customerId:'KH000003',total:20000,paid:0,debt:20000}],statements:[original],payments:[]};
var responses=[],createResponses=[],paymentResponses=[];
function next(queue,fallback) { var item=queue.length ? queue.shift() : clone(fallback); return item instanceof Error ? Promise.reject(item) : Promise.resolve(item); }
app.API={customers:function(){inventoryCalls++;return next(responses,fixture);},
    createDebtStatement:function(payload){created.push(clone(payload));return next(createResponses,{statement:clone(original)});},
    payDebtStatement:function(payload){paid.push(clone(payload));return next(paymentResponses,{});}};
app.Print={printStatement:function(statement){printed.push(clone(statement));}};
app.notify=function(message,type){notifications.push({message:message,type:type});};
app.List={load:function(){listRefreshes++;}};
load('js/customers.js');
async function emit(el,type,extra) { var event=Object.assign({target:el,preventDefault:function(){}},extra||{});for(var fn of el.listeners[type]||[])await fn(event); }
async function settle(){for(var i=0;i<15;i++)await Promise.resolve();}
async function choose(id){await emit(nodes.customerList,'click',{target:new Element('button',{'data-open-customer':id})});}
async function viewStatement(id){await emit(nodes.customerStatements,'click',{target:new Element('button',{'data-open-debt-statement':id})});}
async function collect(id){await emit(nodes.customerStatements,'click',{target:new Element('button',{'data-collect-debt':id})});}
async function rejectEnsure(){var rejected=false;try{await app.Customers.ensureLoaded();}catch(_){rejected=true;}assert(rejected,'Initial customer API error blocks dependent forms');}
async function run(){
    await emit(document,'DOMContentLoaded');
    responses.push(new Error('Khách hàng chưa được triển khai.'));await rejectEnsure();
    assert(nodes.customerList.innerHTML.includes('Chưa tải được'),'Initial customer load failure not shown as empty database');
    assert(!nodes.customersStatus.hidden,'Initial customer error visible');
    var initial=deferred();responses.push(initial.promise);var loading=app.Customers.load(true);var concurrent=app.Customers.load();
    equal(inventoryCalls,2,'Concurrent customer load reuses pending API call');
    assert(nodes.customersStatus.textContent.includes('Đang tải'),'Customer loading state shown');
    initial.resolve(clone(fixture));await loading;await concurrent;
    equal(nodes.customersStatus.hidden,true,'Customer loading status clears');
    equal(nodes.customersCount.textContent,4,'Customer count includes legacy customer');
    equal(nodes.customersOwing.textContent,2,'Only customers with positive order balances owe');
    equal(app.Data.money(nodes.customersDebt.textContent),120000,'Customer balance totals use orders once, not orders plus statement totals');
    equal(nodes.customersOpenStatements.textContent,1,'Open statement count independent from customer balances');
    assert(nodes.customerList.innerHTML.includes('Khách &lt;img&gt;'),'Customer names escaped in list');
    assert(nodes.customerList.innerHTML.includes('Địa chỉ &lt;script&gt;'),'Customer addresses escaped in list');
    assert(!nodes.customerList.innerHTML.includes('Khách <img>'),'Customer HTML not injected');
    assert(nodes.customerOptions.innerHTML.includes('KH000001 — Khách &lt;img&gt;'),'Invoice customer choices escaped');
    equal(app.Customers.resolveCustomer('kh000001').name,customer.name,'Customer code case-insensitive resolution');
    equal(app.Customers.resolveCustomer('Khách <img>').id,customer.id,'Unique customer name resolves');
    equal(app.Customers.resolveCustomer('Trùng tên'),undefined,'Duplicate names require exact customer identity');
    equal(app.Customers.resolveCustomer('KH000003 — Trùng tên · 0900000003').id,'KH000003','Distinct label resolves duplicate-name customer');
    equal(app.Customers.resolveCustomer('Khách cũ — Khách cũ · Địa chỉ cũ').legacy,true,'Legacy choice retains its virtual identity');
    var snapshot=app.Customers.getCustomers();snapshot[0].name='Mutated';equal(app.Customers.getCustomers()[0].name,customer.name,'Customer resolver state cannot be mutated by returned objects');
    nodes.customerSearch.value='0900000003';await emit(nodes.customerSearch,'input');
    assert(nodes.customerList.innerHTML.includes('KH000003'),'Search matches phone');
    assert(!nodes.customerList.innerHTML.includes('KH000001'),'Search hides unrelated customers');
    nodes.customerSearch.value='không có';await emit(nodes.customerSearch,'input');assert(nodes.customerList.innerHTML.includes('Không tìm thấy'),'Search has distinct no-result message');
    nodes.customerSearch.value='';await emit(nodes.customerSearch,'input');
    var inlineScrolls=0;nodes.customerDetail.scrollIntoView=function(){inlineScrolls++;};
    equal(customerPanel.open,false,'Customer detail dialog initially closed');
    nodes.customerSearch.focus();
    await choose('KH000001');equal(nodes.customerDetail.hidden,false,'Selecting customer opens details');equal(nodes.customerDetailTitle.textContent,customer.name,'Customer detail title uses textContent');
    equal(customerPanel.open,true,'Selecting customer opens separate modal');
    equal(nodes.customerDetail.parentElement,customerPanel,'Customer details are contained in their own dialog');
    equal(inlineScrolls,0,'Choosing customer does not scroll open inline details');
    await emit(nodes.customerClose,'click');equal(customerPanel.open,false,'Customer close button closes only customer modal');
    equal(nodes.customerDetail.hidden,true,'Closing customer hides its previous detail content');
    equal(document.activeElement,nodes.customerSearch,'Customer modal close restores prior focus');
    await choose('KH000001');
    var customerCancelled=false;await emit(customerPanel,'cancel',{preventDefault:function(){customerCancelled=true;}});
    assert(customerCancelled,'Customer Escape uses controlled close lifecycle');equal(customerPanel.open,false,'Customer Escape closes dialog');
    await choose('KH000001');
    assert(nodes.customerOrders.innerHTML.includes('CN041120260001'),'Order detail shows its statement membership');
    assert(!nodes.customerExportDebt.disabled,'Customer with debt can create or print total');
    await choose('KH000002');assert(nodes.customerExportDebt.disabled,'Customer paid or overpaid cannot create debt total');
    await choose('KH000001');

    responses.push(new Error('Mất mạng khách hàng'));await emit(nodes.customersRefresh,'click');
    assert(nodes.customerList.innerHTML.includes('KH000001'),'Failed refresh retains prior customer list');
    assert(nodes.customersStatus.textContent.includes('lần tải trước'),'Failed refresh clearly marks stale data');
    var earlier=deferred();responses.push(earlier.promise);var first=app.Customers.load(true);
    var fresh=clone(fixture);fresh.customers.push({id:'KH000004',name:'Mới nhất',phone:'',address:''});responses.push(fresh);await app.Customers.load(true);
    earlier.resolve(clone(fixture));await first;equal(app.Customers.getCustomers().length,5,'Old customer response cannot overwrite newer refresh');
    responses.push(clone(fixture));await app.Customers.load(true);

    createResponses.push(new Error('Chưa xác nhận tạo phiếu'));await emit(nodes.customerExportDebt,'click');
    equal(created.length,1,'Create debt total submits one request');assert(nodes.customersStatus.textContent.includes('Chưa xác nhận'),'Create failure shown');
    assert(nodes.customerDetailStatus.textContent.includes('Chưa xác nhận')&&!nodes.customerDetailStatus.hidden,'Create failure remains visible inside customer modal');
    var creating=deferred();createResponses.push(creating.promise);var retry=emit(nodes.customerExportDebt,'click');await settle();
    equal(created.length,2,'Retry resubmits once');equal(created[0].requestId,created[1].requestId,'Unconfirmed statement retry keeps stable request ID');
    assert(nodes.customerExportDebt.disabled,'Statement creation disables action');await emit(nodes.customerExportDebt,'click');equal(created.length,2,'In-flight statement creation cannot submit twice');
    await emit(nodes.customerClose,'click');equal(customerPanel.open,true,'Customer modal stays open while statement creation pending');
    creating.resolve({statement:clone(original)});await retry;
    equal(statementPanel.open,true,'Canonical statement shown after creation');equal(nodes.debtStatementTitle.textContent,original.id,'Server statement code displayed');
    equal(printed.length,1,'Created statement prints once');equal(printed[0].id,original.id,'Print uses confirmed statement code');
    equal(app.Data.money(nodes.debtStatementDebt.textContent),100000,'Statement shows debt');
    await emit(nodes.debtStatementPrint,'click');equal(printed.length,2,'Saved statement can be printed again');
    await emit(nodes.statementClose,'click');equal(statementPanel.open,false,'Statement dialog closes');
    equal(customerPanel.open,true,'Closing child statement retains customer dialog');
    await viewStatement(original.id);equal(statementPanel.open,true,'Existing statement can reopen');
    await emit(nodes.debtStatementCollect,'click');equal(paymentPanel.open,true,'Statement collect opens payment form');equal(document.activeElement,nodes.customerPaymentAmount,'Payment amount receives focus');
    equal(nodes.customerPaymentDate.value,app.Data.todayKey(),'Payment date defaults to Vietnam today');
    await emit(paymentForm,'submit');equal(paid.length,0,'Blank payment not sent');
    for(var bad of ['-1','0','100001','abc']){nodes.customerPaymentAmount.value=bad;await emit(paymentForm,'submit');equal(paid.length,0,'Invalid payment blocked: '+bad);}
    nodes.customerPaymentAmount.value='20.000';nodes.customerPaymentDate.value='2026-02-30';await emit(paymentForm,'submit');equal(paid.length,0,'Invalid payment date blocked');
    equal(document.activeElement,nodes.customerPaymentDate,'Invalid date receives focus');
    nodes.customerPaymentDate.value='2026-11-04';nodes.customerPaymentNote.value='Thu <svg>';paymentResponses.push(new Error('Chưa xác nhận thanh toán'));await emit(paymentForm,'submit');
    equal(paid.length,1,'Valid partial payment sent');equal(paid[0].amount,20000,'Formatted VND amount parsed correctly');equal(paymentPanel.open,true,'Unconfirmed payment stays open');
    assert(nodes.customerPaymentError.textContent.includes('Chưa xác nhận'),'Payment error shown in form');
    var sending=deferred();paymentResponses.push(sending.promise);var sendRetry=emit(paymentForm,'submit');await settle();
    equal(paid.length,2,'Payment retry submits once');equal(paid[0].requestId,paid[1].requestId,'Unconfirmed payment retry reuses request ID');
    assert(nodes.customerPaymentSave.disabled,'Payment controls disabled in flight');
    await emit(paymentForm,'submit');equal(paid.length,2,'In-flight payment cannot be submitted twice');
    await emit(nodes.paymentClose,'click');equal(paymentPanel.open,true,'Payment cannot close while submission pending');
    var prevented=false;await emit(paymentPanel,'cancel',{preventDefault:function(){prevented=true;}});assert(prevented,'Escape prevented while payment pending');
    var partiallyPaid=clone(original);partiallyPaid.paid=20000;partiallyPaid.debt=80000;partiallyPaid.payments=[{id:'TT041120260001',date:'2026-11-04',amount:20000,note:'Thu <svg>',allocations:[{orderId:'HD041120260001',amount:20000}]}];
    fixture.statements=[partiallyPaid];fixture.orders[0].paid=70000;fixture.orders[0].debt=80000;
    responses.push(new Error('Tải lại sau thu tiền bị lỗi'));
    sending.resolve({statement:clone(partiallyPaid)});await sendRetry;
    equal(paymentPanel.open,false,'Confirmed partial payment closes form');assert(!nodes.customerPaymentSave.disabled,'Confirmed payment releases disabled controls');
    equal(app.Data.money(nodes.debtStatementPaid.textContent),20000,'Statement shows server confirmed collection');
    equal(app.Data.money(nodes.debtStatementDebt.textContent),80000,'Statement debt refreshes after partial collection');
    equal(app.Data.money(nodes.customersDebt.textContent),100000,'Customer overview recomputes updated order balances once');
    assert(nodes.customersStatus.textContent.includes('Tải lại sau thu tiền'),'Confirmed collection keeps refresh-failure warning');
    assert(nodes.customerOrderCount.textContent.includes('80.000'),'Confirmed payment updates order balances even if refresh fails');
    assert(nodes.debtStatementPayments.innerHTML.includes('Thu &lt;svg&gt;'),'Payment note escaped in history');equal(listRefreshes,1,'Payment refreshes invoice list balances');
    createResponses.push({statement:clone(partiallyPaid)});responses.push(new Error('Vẫn chưa tải lại được'));
    await emit(nodes.customerExportDebt,'click');
    equal(app.Data.money(nodes.customersDebt.textContent),100000,'Remembering same canonical payment twice cannot deduct a second time');
    assert(nodes.customerOrderCount.textContent.includes('80.000'),'Repeated canonical statement preserves per-order balances');
    await emit(nodes.customersRefresh,'click');
    equal(app.Data.money(nodes.customersDebt.textContent),100000,'Later successful refresh agrees with confirmed local collection');
    await emit(nodes.debtStatementPrint,'click');equal(printed.at(-1).debt,80000,'Reprint uses latest canonical balance');
    await collect(original.id);await emit(nodes.customerPaymentFull,'click');equal(app.Data.money(nodes.customerPaymentAmount.value),80000,'Full-payment shortcut uses remaining amount');
    assert(paid[0].requestId!==undefined && paid[0].requestId!=='','Payment has nonempty request ID');
    var closed=clone(partiallyPaid);closed.paid=100000;closed.debt=0;closed.status='closed';closed.payments.push({id:'TT041120260002',date:'2026-11-04',amount:80000,note:'Thu đủ',allocations:[{orderId:'HD041120260001',amount:80000}]});
    fixture.statements=[closed];fixture.orders[0].paid=150000;fixture.orders[0].debt=0;paymentResponses.push({statement:clone(closed)});responses.push(new Error('Tải lại sau tất toán lỗi'));await emit(paymentForm,'submit');
    equal(paid.length,3,'Second payment recorded');assert(paid[2].requestId!==paid[1].requestId,'New collection session gets new request ID');
    equal(nodes.debtStatementCollect.disabled,true,'Closed statement disables collection button');assert(nodes.debtStatementStatus.textContent.includes('kết thúc'),'Closed statement explains end of debt cycle');
    equal(nodes.customersOpenStatements.textContent,0,'Fully paid statement removed from open count');
    equal(app.Data.money(nodes.customersDebt.textContent),20000,'Customer overview excludes paid customer');
    assert(nodes.customerExportDebt.disabled,'No outstanding orders disables customer export after closure');
    await emit(nodes.debtStatementCollect,'click');equal(paymentPanel.open,false,'Closed statement cannot reopen collection via listener');
    await emit(nodes.debtStatementPrint,'click');equal(printed.at(-1).status,'closed','Closed total remains printable');
    fixture.orders.push({id:'legacy-order',date:'2026-11-01',customerId:'legacy-v1',customer:'Khách cũ',address:'Địa chỉ cũ',total:1000.75,paid:0.5,debt:1000.25});
    await emit(nodes.customersRefresh,'click');await choose('legacy-v1');
    var materialized={id:'KH000005',name:'Khách cũ',address:'Địa chỉ cũ',phone:''};
    var legacyStatement={id:'CN041120260002',customerId:materialized.id,date:'2026-11-04',throughDate:'2026-11-04',customer:materialized,
        items:[{orderId:'legacy-order',date:'2026-11-01',total:1000.75,paid:0.5,debt:1000.25}],total:1000.25,paid:0,debt:1000.25,status:'open',payments:[]};
    createResponses.push({statement:legacyStatement});responses.push(new Error('Tải lại khách vừa cấp mã lỗi'));await emit(nodes.customerExportDebt,'click');
    equal(nodes.customerDetailCode.textContent,'KH000005','Confirmed legacy materialization changes detail to stable customer code even when refresh fails');
    equal(customerPanel.open,true,'Customer modal survives confirmed legacy identity remap');
    equal(app.Customers.resolveCustomer('KH000005').name,'Khách cũ','New stable customer identity available immediately after confirmation');
    equal(app.Customers.resolveCustomer('legacy-v1'),undefined,'Confirmed materialization removes superseded virtual identity');
    assert(nodes.customerOrders.innerHTML.includes('legacy-order'),'Materialized customer keeps historical order detail after refresh error');
    equal(app.Data.money(nodes.debtStatementDebt.textContent),1000.25,'Customer statement preserves historical fractional currency');
    equal(app.Data.money(nodes.customersDebt.textContent),21000.25,'Legacy remap keeps fractional balances without duplicating orders');
    print('PASS: '+checks+' customer UI checks (real listeners, fake DOM, no network)');
}
run().catch(function(error){print('FAIL: '+error.message+'\n'+error.stack);quit(1);});
