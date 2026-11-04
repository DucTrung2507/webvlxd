/* In công nợ theo ngày và từng mặt hàng; không gọi trình duyệt/máy in thật. */
var window = {}, nodes = {}, checks = 0, classes = new Set(), prints = 0;
var omittedPrintIds = new Set(['d_customerId', 'd_status', 'd_payments']), omittedLookups = [];
var document = {body:{classList:{add:function(name){classes.add(name);},remove:function(name){classes.delete(name);}}},
    getElementById:function(id){
        if(omittedPrintIds.has(id)){omittedLookups.push(id);return null;}
        return nodes[id] || (nodes[id]={textContent:'',innerHTML:''});
    }};
function assert(ok,message){if(!ok)throw new Error(message);checks++;}
function equal(actual,expected,message){assert(actual===expected,message+': '+actual+' !== '+expected);}
function clone(value){return JSON.parse(JSON.stringify(value));}
load('js/order-data.js');load('js/printorder.js');
var app=window.InvoiceApp,D=app.Data;
window.print=function(){prints++;assert(classes.has('printing-debt'),'Debt print area selected only during print');};
var statement={id:'CN041120260001',customerId:'KH000001',customer:{id:'KH000001',name:'Khách <img>',phone:'0900000001',address:'Địa chỉ <svg>'},
    date:'2026-11-04',throughDate:'2026-11-05',total:380000,paid:30000,debt:350000,status:'open',
    items:[
        {orderId:'HD041120260001',date:'2026-11-04',total:100000,paid:20000,debt:80000,
            goods:[{name:'Gạch xanh <script>',qty:1,unit:'Viên',price:100000,subtotal:100000}]},
        {orderId:'HD041120260002',date:'2026-11-04',total:150000,paid:50000,debt:100000,
            goods:[{name:'Gạch lát nền b',qty:1,unit:'Viên',price:50000,subtotal:50000},{name:'Gạch lát nền c',qty:2,unit:'Viên',price:50000,subtotal:100000}]},
        {orderId:'HD051120260001',date:'2026-11-05',total:200000,paid:0,debt:200000,
            goods:[{name:'Gạch lát nền d',qty:2,unit:'Viên <img>',price:100000,subtotal:200000}]}
    ],payments:[{id:'TT041120260001',date:'2026-11-04',amount:30000,note:'Chuyển khoản <svg>'}]};
var original=JSON.stringify(statement);
app.Print.printStatement(statement);
equal(prints,1,'Debt print invoked once');
assert(!classes.has('printing-debt'),'Print mode cleared after success');
equal(nodes.d_customer.textContent,'Khách <img>','Customer name assigned safely as text');
equal(omittedLookups.length,0,'Printing does not require omitted customer code, status or payment history nodes');
assert(!nodes.d_customerId&&!nodes.d_status&&!nodes.d_payments,'Omitted print sections are not recreated by the fixture');
equal(D.money(nodes.d_total.textContent),450000,'Total includes original value of every included invoice');
equal(D.money(nodes.d_paid.textContent),100000,'Paid includes initial invoice payments and later debt collections');
equal(D.money(nodes.d_debt.textContent),350000,'Remaining debt uses canonical ledger balance');
equal((nodes.d_table.innerHTML.match(/<tr>/g)||[]).length,4,'Every product printed once');
assert(nodes.d_table.innerHTML.includes('rowspan="3" class="debt-date">04/11/2026'),'Same-day invoices share one date cell spanning all their products');
assert(nodes.d_table.innerHTML.includes('rowspan="1" class="debt-date">05/11/2026'),'Next day has its own date group');
equal((nodes.d_table.innerHTML.match(/04\/11\/2026/g)||[]).length,1,'Date repeated only once across same-day invoices');
assert(nodes.d_table.innerHTML.includes('Gạch xanh &lt;script&gt;'),'Product name escaped');
assert(!nodes.d_table.innerHTML.includes('Gạch xanh <script>'),'Product HTML not injected');
assert(nodes.d_table.innerHTML.includes('Viên &lt;img&gt;'),'Unit escaped');
assert(!JSON.stringify(nodes).includes('Chuyển khoản'),'Collection history is absent from printed content');
equal(JSON.stringify(statement),original,'Printing does not mutate saved statement snapshot');

var reverse=clone(statement);reverse.items.reverse();app.Print.printStatement(reverse);
assert(nodes.d_table.innerHTML.indexOf('04/11/2026')<nodes.d_table.innerHTML.indexOf('05/11/2026'),'Printed date groups remain chronological');

var closed=clone(statement);closed.status='closed';closed.paid=380000;closed.debt=0;
app.List={getOrders:function(){return [{id:'HD041120260001',items:[{name:'Current edited name',qty:99,price:1,subtotal:99}]}];}};
app.Print.printStatement(closed);
equal(D.money(nodes.d_paid.textContent),450000,'Settled total includes all original and later payments');
equal(D.money(nodes.d_debt.textContent),0,'Settled statement prints zero debt');
assert(nodes.d_table.innerHTML.includes('Gạch xanh &lt;script&gt;'),'Closed print uses frozen product snapshot');
assert(!nodes.d_table.innerHTML.includes('Current edited name'),'Current invoice data cannot replace frozen goods');

app.Print.printStatement({id:'CN2',date:'2026-11-04',throughDate:'2026-11-04',customer:{name:'Khách cũ'},status:'open',total:1000.25,paid:1000,debt:0.25,payments:[],
    items:[{orderId:'old <img>',date:'',total:1000.75,paid:0.5,debt:1000.25}]});
assert(nodes.d_table.innerHTML.includes('Hóa đơn old &lt;img&gt; (chưa có chi tiết hàng)'),'Legacy statement without goods has safe financial fallback');
assert(nodes.d_table.innerHTML.includes('Chưa rõ ngày'),'Unknown historical invoice date is not replaced by today');
assert(nodes.d_table.innerHTML.includes('1.000,75 đ'),'Legacy fractional invoice total preserved');
equal(D.money(nodes.d_total.textContent),1000.75,'Legacy total still uses original invoice value');
equal(D.money(nodes.d_paid.textContent),1000.5,'Legacy initial fractional payment included');
equal(D.money(nodes.d_debt.textContent),0.25,'Legacy fractional remaining balance preserved');
equal(omittedLookups.length,0,'Printing legacy and closed statements does not access omitted sections');

var fraction=clone(statement);fraction.items=[{orderId:'HD041120260003',date:'2026-11-04',total:12500,paid:0,debt:12500,
    goods:[{name:'Cát',qty:0.125,unit:'m³',price:100000,subtotal:12500}]}];fraction.paid=0;fraction.debt=12500;
app.Print.printStatement(fraction);
assert(nodes.d_table.innerHTML.includes('<td>0,125</td>'),'Product quantity retains decimals and Vietnamese formatting');
assert(nodes.d_table.innerHTML.includes('12.500 đ'),'Product subtotal printed');

window.print=function(){throw new Error('No printer');};
var failed=false;try{app.Print.printStatement(statement);}catch(error){failed=true;}
assert(failed,'Print failure propagated');assert(!classes.has('printing-debt'),'Print mode cleared after failure');
equal(omittedLookups.length,0,'Print failure cleanup does not depend on removed sections');
print('PASS: '+checks+' debt product print checks (grouped dates, snapshot, totals, no printer)');
