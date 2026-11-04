/* Chạy từ thư mục dự án bằng JavaScriptCore (macOS). */
var window = {};
var elements = {};
var domReady;
var document = {
    getElementById: function (id) {
        if (!elements[id]) elements[id] = {
            value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
            listeners: {}, attributes: {},
            addEventListener: function (type, fn) { this.listeners[type] = fn; },
            setAttribute: function (name, value) { this.attributes[name] = value; },
            removeAttribute: function (name) { delete this.attributes[name]; },
            reset: function () { elements.fromDate.value = ''; elements.toDate.value = ''; },
            focus: function () {}
        };
        return elements[id];
    },
    addEventListener: function (type, fn) { if (type === 'DOMContentLoaded') domReady = fn; }
};
var bodyClasses = new Set();
document.body = {classList: {add:function (name) { bodyClasses.add(name); }, remove:function (name) { bodyClasses.delete(name); }, contains:function (name) { return bodyClasses.has(name); }}};
var setTimeout = function () { return 1; };
var clearTimeout = function () {};
var AbortController = function () { this.signal = {}; this.abort = function () {}; };
var requests = [];
var fetchCalls = [];
var fetch = function (url, options) {
    fetchCalls.push({url:url, options:options});
    var next = requests.shift();
    if (!next) return Promise.reject(new Error('Missing mock response'));
    if (next instanceof Error) return Promise.reject(next);
    if (next.then) return next;
    return Promise.resolve({ok: true, text: function () { return Promise.resolve(typeof next === 'string' ? next : JSON.stringify(next)); }});
};
var count = 0;
function assert(condition, message) { if (!condition) throw new Error(message); count++; }
function equal(actual, expected, message) { assert(actual === expected, message + ': ' + actual + ' !== ' + expected); }
function expectThrow(fn, message) { var threw = false; try { fn(); } catch (_) { threw = true; } assert(threw, message); }
async function rejects(fn, message) { var threw = false; try { await fn(); } catch (_) { threw = true; } assert(threw, message); }

['fromDate', 'toDate'].forEach(function(id){document.getElementById(id);});
// `load` là hàm sẵn có của JavaScriptCore.
load('js/order-data.js');
load('js/order-api.js');
load('js/order-list.js');
load('js/order.js');
load('js/printorder.js');

async function run() {
    var app = window.InvoiceApp;
    var D = app.Data;
    equal(D.parseDate('3/11/2026'), '2026-11-03', 'Ngày Việt Nam không bị đảo tháng');
    equal(D.parseDate('2026-11-03'), '2026-11-03', 'Ngày ISO');
    equal(D.parseDate('2026-11-02T18:00:00Z'), '2026-11-03', 'Timestamp theo ngày Việt Nam');
    equal(D.parseDate('', 'HD031120260002'), '2026-11-03', 'Ngày thiếu suy từ mã đơn cũ');
    equal(D.parseDate('31/02/2026'), '', 'Không chấp nhận ngày không tồn tại');
    equal(D.parseDate('2026-02-30T00:00:00Z'), '', 'Không tự đổi ngày ISO lỗi sang tháng sau');
    equal(D.parseDate('29/02/2024'), '2024-02-29', 'Năm nhuận');
    equal(D.money('-250.000 đ'), -250000, 'Giữ dấu âm tiền trả dư');
    equal(D.money('1.200.000'), 1200000, 'Tiền Việt Nam');
    equal(D.money('250,25 đ'), 250.25, 'Không nhân sai phần thập phân');
    equal(D.money('90000.00'), 90000, 'Tiền thập phân từ máy chủ');
    var fractional = D.normalizeOrder({id:'HD031120260001',items:[{name:'Cát',qty:0.25,price:1001}]});
    equal(fractional.total, 250, 'Làm tròn đồng khi số lượng lẻ');
    equal(D.money(D.formatMoney(fractional.total)), fractional.total, 'Tiền lưu/hiển thị cùng giá trị');
    var orders = [
        {id:'HD011120260001', date:'1/11/2026', total:'100.000 đ', paid:'20.000', debt:'80.000 đ'},
        {id:'HD021120260001', date:'2/11/2026', total:200000, paid:200000, debt:0},
        {id:'HD031120260001', date:'', total:300000, paid:400000, debt:-100000},
        {id:'legacy', date:'', customer:'Khách cũ', total:400000, paid:0}
    ].map(D.normalizeOrder);
    equal(D.filterOrders(orders).length, 4, 'Mặc định có cả hóa đơn chưa rõ ngày');
    equal(D.filterOrders(orders, '2026-11-01', '2026-11-03').length, 3, 'Bao gồm cả đầu/cuối, loại ngày chưa rõ');
    equal(D.filterOrders(orders, '2026-11-02', '2026-11-02').length, 1, 'Lọc cùng một ngày');
    equal(D.filterOrders(orders, '', '2026-11-02').length, 2, 'Chỉ ngày kết thúc');
    equal(D.filterOrders(orders, '2026-11-02', '').length, 2, 'Chỉ ngày bắt đầu');
    equal(D.filterOrders(orders, '2027-01-01', '').length, 0, 'Khoảng không có hóa đơn');
    expectThrow(function () { D.filterOrders(orders, '2026-11-04', '2026-11-01'); }, 'Chặn khoảng ngược');
    equal(D.sortOrders(orders)[0].id, 'HD031120260001', 'Mới nhất trước');
    equal(D.sortOrders(orders).at(-1).id, 'legacy', 'Ngày không rõ xếp cuối');
    equal(D.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;', 'Dữ liệu được escape');
    equal(D.normalizeOrder({items:'[{"name":"Xi măng","qty":2,"price":90000}]'}).total, 180000, 'Items JSON từ Sheet');
    equal(D.normalizeOrder({items:[{name:'Xi măng',qty:2,unit:'bao',price:90000}]}).items[0].unit, 'bao', 'Giữ đơn vị tính từ CHITIET_HD');
    equal(D.normalizeOrder({items:[{name:'Xi măng',qty:2,price:90000}]}).items[0].unit, '', 'Đơn cũ không có ĐVT vẫn đọc được');
    var customerOrder = D.normalizeOrder({id:'HD041120260001',customer:'Khách A',customerId:'KH000001',phone:'0900000001',total:100000,paid:40000,debt:60000});
    equal(customerOrder.customerId,'KH000001','Chuẩn hóa hóa đơn giữ mã khách hàng');
    equal(customerOrder.phone,'0900000001','Chuẩn hóa hóa đơn giữ số điện thoại');
    equal(customerOrder.debt,60000,'Chuẩn hóa giữ công nợ hiệu lực sau thu tiền');

    requests.push({lastId:'HD031120260002'});
    await rejects(function () { return app.API.list(); }, 'Không biến lastId thành danh sách rỗng');
    requests.push({orders:[]});
    equal((await app.API.list()).length, 0, 'Danh sách thật rỗng');
    requests.push({orders:[
        {id:'Số HD',date:'Ngày',customer:'Khách',total:'Tổng',items:[{name:'Tên hàng',qty:'SL',unit:'Giá',price:'Thành tiền'}]},
        {id:'HD031120260001',date:'3/11/2026',customer:'Khách thật',total:120000,items:[]},
        {id:'legacy',date:'',customer:'Đơn cũ chưa rõ ngày',total:100000,items:[]}
    ]});
    var withoutHeaders = await app.API.list();
    equal(withoutHeaders.length, 2, 'Loại tiêu đề Số HD khỏi hóa đơn và thống kê');
    equal(withoutHeaders[0].id, 'HD031120260001', 'Giữ hóa đơn thật sau tiêu đề');
    equal(withoutHeaders[1].id, 'legacy', 'Giữ đơn chưa rõ ngày khi loại tiêu đề');
    assert(!D.isOrderHeader({id:'Số HD',date:'2026-11-03'}), 'Không loại mã trùng nhãn khi ngày là ngày thật');
    requests.push({success:false,error:'write failed'});
    await rejects(function () { return app.API.save({id:'draft'}); }, 'Lỗi ứng dụng dù HTTP 200');
    for (var ambiguous of [{}, [], {lastId:'HD031120260002'}]) {
        requests.push(ambiguous);
        await rejects(function () { return app.API.save({id:'draft'}); }, 'Không báo đã lưu khi chưa được xác nhận');
    }
    requests.push({status:'success'});
    equal((await app.API.save({id:'draft'})).id, 'draft', 'Tương thích xác nhận thành công');
    requests.push('Success');
    equal((await app.API.save({id:'draft'})).id, 'draft', 'Tương thích phản hồi text');
    requests.push({order:{id:'official'}});
    equal((await app.API.save({id:'draft'})).id, 'official', 'Mã chính thức do máy chủ cấp');
    requests.push({status:'success',id:'HD031120260099'});
    var savedOfficial = await app.API.save({id:'HD031120260001',customer:'Khách hàng',items:[{name:'Cát',qty:1,unit:'m³',price:100000}]});
    equal(savedOfficial.id, 'HD031120260099', 'Dùng chính xác mã do doPost hiện tại trả về');
    equal(savedOfficial.items[0].unit, 'm³', 'Phản hồi chỉ có id giữ đủ mặt hàng vừa nhập');
    requests.push('API OK');
    await rejects(function () { return app.API.list(); }, 'doGet cũ trả API OK chưa phải danh sách');

    app.notify = function () {};
    requests.push({orders:orders});
    app.List.init();
    // Một yêu cầu riêng giúp chờ lần tải cuối mà không phụ thuộc timer.
    requests.push({orders:orders});
    await app.List.load();
    equal(app.List.getOrders().length, 4, 'Đọc toàn bộ lịch sử');
    assert(elements.orderList.innerHTML.includes('Khách cũ'), 'Đơn cũ có trong bảng');
    elements.fromDate.value = '2026-11-02'; elements.toDate.value = '2026-11-03';
    elements.filterForm.listeners.submit({preventDefault:function(){}});
    equal(elements.statsCount.textContent, '2', 'Thống kê theo bộ lọc');
    equal(D.money(elements.statsTotal.textContent), 500000, 'Tổng theo bộ lọc');
    equal(D.money(elements.statsDebt.textContent), -100000, 'Công nợ có trả dư');
    elements.fromDate.value = '2026-11-04'; elements.toDate.value = '2026-11-01';
    elements.filterForm.listeners.submit({preventDefault:function(){}});
    assert(!elements.filterError.hidden, 'Hiện lỗi ngày ngược');
    equal(elements.statsCount.textContent, '2', 'Ngày sai không làm mất kết quả');
    elements.resetFilters.listeners.click();
    equal(elements.statsCount.textContent, '4', 'Xem tất cả phục hồi cả hóa đơn không rõ ngày');
    var unsafe = {id:'HD041120260001',date:'4/11/2026',customer:'<img src=x onerror=x>',phone:'0901234567',shipper:'Người giao',items:[{name:'<script>x</script>',qty:1,unit:'bao<svg>',price:10}], total:10};
    app.List.remember(unsafe);
    equal(app.List.getOrders().length, 5, 'Đơn vừa lưu hiện ngay');
    assert(!elements.orderList.innerHTML.includes('<img src=x'), 'Escape khách hàng trong bảng');
    assert(elements.orderList.innerHTML.includes('&lt;script&gt;'), 'Escape tên hàng trong bảng');
    assert(elements.orderList.innerHTML.includes('bao&lt;svg&gt;'), 'Hiển thị và escape đơn vị tính trong bảng');
    assert(elements.orderList.innerHTML.includes('data-open-sale="HD041120260001"'), 'Mã hóa đơn là nút mở lại hóa đơn');
    elements.orderSearch.value='khach cu'; elements.orderSearch.listeners.input();
    equal(elements.statsCount.textContent,'1','Tìm khách hàng không phân biệt dấu');
    equal(D.money(elements.statsTotal.textContent),400000,'Thống kê chỉ gồm hóa đơn tìm được');
    elements.orderSearch.value='script'; elements.orderSearch.listeners.input();
    equal(elements.statsCount.textContent,'1','Tìm theo tên hàng trong hóa đơn');
    elements.orderSearch.value='0901234567'; elements.orderSearch.listeners.input();
    equal(elements.statsCount.textContent,'1','Tìm theo số điện thoại khách');
    elements.fromDate.value='2026-11-01';elements.toDate.value='2026-11-03';elements.filterForm.listeners.submit({preventDefault:function(){}});
    equal(elements.statsCount.textContent,'0','Tìm kiếm kết hợp bộ lọc ngày');
    assert(elements.orderList.innerHTML.includes('Không có hóa đơn phù hợp'),'Kết quả trống có hướng dẫn đúng');
    elements.resetFilters.listeners.click();
    equal(elements.orderSearch.value,'','Xem tất cả xóa cả từ tìm kiếm');
    equal(elements.statsCount.textContent,'5','Xem tất cả phục hồi danh sách sau tìm kiếm');
    var clicked='', originalOrderModule=app.Order;
    app.Order={openExisting:function(id){clicked=id;}};
    elements.orderList.listeners.click({target:{closest:function(){return {getAttribute:function(){return unsafe.id;}};}}});
    equal(clicked,unsafe.id,'Bấm mã hóa đơn gọi đúng cửa sổ hóa đơn');
    app.Order=originalOrderModule;
    var revision=D.normalizeOrder({...unsafe,version:3,canEdit:false,editBlockedReason:'Đã tất toán',debtStatementId:'CN1',originalPaid:2,debtPaid:3,paid:5,debt:5});
    equal(revision.version,3,'Giữ phiên bản hóa đơn khi chuẩn hóa');
    equal(revision.canEdit,false,'Giữ trạng thái khóa chỉnh sửa');
    equal(revision.editBlockedReason,'Đã tất toán','Giữ lý do khóa');
    equal(revision.debtStatementId,'CN1','Giữ mã phiếu tổng');
    equal(revision.originalPaid,2,'Giữ tiền trả lúc lập đơn');
    equal(revision.debtPaid,3,'Giữ phần thu qua phiếu tổng');
    requests.push(new Error('Mất mạng'));
    await app.List.load();
    equal(app.List.getOrders().length, 5, 'Tải lỗi giữ danh sách');
    assert(!elements.listStatus.hidden, 'Tải lỗi có thông báo');
    requests.push({orders:[...orders, {...unsafe, customer:'Tên từ máy chủ'}]});
    await app.List.load();
    equal(app.List.getOrders().length, 5, 'Không trùng đơn khi tải lại');
    equal(app.List.getOrders()[0].customer, 'Tên từ máy chủ', 'Dữ liệu chính thức thay bản tạm');
    // Phản hồi cũ đến muộn không được ghi đè lần làm mới sau.
    var resolveOlder;
    requests.push(new Promise(function(resolve){resolveOlder=resolve;}));
    var earlier = app.List.load();
    requests.push({orders:[unsafe]});
    await app.List.load();
    resolveOlder({ok:true,text:function(){return Promise.resolve(JSON.stringify({orders:orders}));}});
    await earlier;
    equal(app.List.getOrders().length, 1, 'Chặn race khi làm mới');
    var printed = false;
    window.print = function(){ printed = true; };
    app.Print.print(unsafe);
    assert(printed, 'Mở in');
    equal(elements.p_date.textContent, 'Ngày 04/11/2026', 'In ngày hóa đơn, không lấy ngày hôm nay');
    assert(elements.p_table.innerHTML.includes('&lt;script&gt;'), 'Escape mặt hàng khi in');
    assert(elements.p_table.innerHTML.includes('<td>bao&lt;svg&gt;</td>'), 'Cột ĐVT được in và escape');
    app.Print.print(savedOfficial);
    equal(elements.p_id.textContent, 'HD031120260099', 'Bản in dùng mã chính thức trả về');
    // New warehouse endpoints reject old deployments and incomplete confirmations.
    requests.push({lastId:'HD031120260002'});
    await rejects(function () { return app.API.inventory(); }, 'Bản triển khai cũ không bị hiểu là kho rỗng');
    requests.push({products:[],receipts:[]});
    await rejects(function () { return app.API.inventory(); }, 'Kho thiếu stock không hợp lệ');
    requests.push({products:[],receipts:[],stock:[]});
    await rejects(function () { return app.API.inventory(); }, 'Không dùng bản API cũ chưa hỗ trợ quy đổi đơn vị');
    var warehouse = {schemaVersion:2,products:[{id:'MH0001',name:'Cát',type:'Vật liệu',price:100000}], receipts:[], stock:[{productId:'MH0001',name:'Cát',qty:0}],lastReceiptId:''};
    requests.push(warehouse);
    var inventory = await app.API.inventory();
    equal(inventory.products[0].id,'MH0001','Đọc mã mặt hàng từ kho');
    assert(fetchCalls.at(-1).url.endsWith('?action=inventory'),'Gọi đúng action inventory');
    var productInput = {name:'Xi măng',type:'Xi măng',price:90000,baseUnit:'bao',units:[{unit:'bao',price:90000,factor:1}],requestId:'product-retry-key'};
    requests.push({status:'success'});
    await rejects(function () { return app.API.createProduct(productInput); }, 'Không xác nhận tạo mặt hàng khi thiếu mã');
    requests.push({product:{id:'MH0002',name:'Xi măng',price:90000}});
    await rejects(function () { return app.API.createProduct(productInput); }, 'Không xác nhận lưu ĐVT khi máy chủ cũ bỏ qua dữ liệu');
    requests.push({product:{id:'MH0002',...productInput}});
    equal((await app.API.createProduct(productInput)).id,'MH0002','Dùng mã mặt hàng máy chủ cấp');
    var sentProduct = JSON.parse(fetchCalls.at(-1).options.body);
    equal(sentProduct.action,'createProduct','POST gửi đúng action tạo mặt hàng');
    equal(sentProduct.requestId,productInput.requestId,'Giữ requestId tạo mặt hàng');
    equal(fetchCalls.at(-1).options.headers['Content-Type'],'text/plain;charset=utf-8','Giữ kiểu gửi tương thích Apps Script');
    var receiptInput = {supplier:'NCC',date:'2026-11-03',paid:50000,requestId:'receipt-retry-key',items:[{productId:'MH0001',qty:2,unit:'m³',price:100000}]};
    requests.push({receipt:{id:'NK031120260099'}});
    await rejects(function () { return app.API.receiveStock(receiptInput); }, 'Không xác nhận nhập kho khi thiếu tồn kho mới');
    var canonicalReceipt = {...receiptInput,id:'NK031120260099',total:200000,debt:150000,items:[{...receiptInput.items[0],name:'Cát',subtotal:200000}]};
    requests.push({receipt:canonicalReceipt,stock:[{productId:'MH0001',name:'Cát',qty:2}]});
    var received = await app.API.receiveStock(receiptInput);
    equal(received.receipt.id,'NK031120260099','Giữ mã phiếu nhập chính thức');
    equal(received.stock[0].qty,2,'Trả tồn kho chính thức');
    var sentReceipt = JSON.parse(fetchCalls.at(-1).options.body);
    equal(sentReceipt.action,'receiveStock','POST gửi đúng action nhập kho');
    equal(sentReceipt.requestId,receiptInput.requestId,'Giữ requestId nhập kho để thử lại an toàn');
    equal(sentReceipt.items[0].productId,'MH0001','Nhập kho gửi mã sản phẩm');
    equal(D.parseDate('', 'NK031120260099'),'2026-11-03','Suy ngày từ mã phiếu NK');
    equal(D.normalizeOrder({items:[{productId:'MH0001',name:'Cát',qty:1,price:100000}]}).items[0].productId,'MH0001','Chuẩn hóa không mất mã sản phẩm để trừ kho');
    var requestOne = D.requestId(), requestTwo = D.requestId();
    assert(!!requestOne && requestOne !== requestTwo,'Tạo khóa yêu cầu không trùng');
    app.Print.print(canonicalReceipt,'receipt');
    equal(elements.p_title.textContent,'PHIẾU NHẬP KHO','In tiêu đề nhập kho');
    equal(elements.p_partyLabel.textContent,'NHÀ CUNG CẤP:','In nhãn nhà cung cấp');
    equal(elements.p_name.textContent,'NCC','In nhà cung cấp');
    equal(elements.p_shipper.textContent,'NCC','Chữ ký phiếu nhập là nhà cung cấp');
    equal(elements.p_paidLabel.textContent,'ĐÃ THANH TOÁN','Nhãn thanh toán nhập kho');
    equal(elements.p_footerLabel.textContent,'NHÀ CUNG CẤP','Nhãn chữ ký nhập kho');
    app.Print.print(savedOfficial);
    equal(elements.p_title.textContent,'HÓA ĐƠN BÁN HÀNG','In bán hàng sau nhập kho đặt lại tiêu đề');
    equal(elements.p_partyLabel.textContent,'TÊN KHÁCH HÀNG:','Đặt lại nhãn khách');
    equal(elements.p_paidLabel.textContent,'KHÁCH TRẢ','Đặt lại nhãn khách trả');
    equal(elements.p_footerLabel.textContent,'NGƯỜI GIAO HÀNG','Đặt lại nhãn người giao');
    var statement = {id:'CN041120260001',date:'2026-11-04',throughDate:'2026-11-05',customerId:'KH000001',
        customer:{id:'KH000001',name:'Khách <img src=x>',phone:'0900000001',address:'Địa chỉ <script>'},
        items:[{orderId:'HD<img>',date:'2026-11-04',total:150000,paid:50000,debt:100000},{orderId:'HD2',date:'2026-11-05',total:200000,paid:0,debt:200000}],
        total:300000,paid:70000,debt:230000,status:'open',payments:[{id:'TT041120260001',date:'2026-11-04',amount:70000,note:'Thu <svg onload=x>'}]};
    var debtPrinted=false;
    window.print=function () { debtPrinted=true; assert(bodyClasses.has('printing-debt'),'Chỉ khung công nợ được chọn khi mở in'); };
    app.Print.printStatement(statement);
    assert(debtPrinted,'Mở cửa sổ in công nợ tổng');
    assert(!bodyClasses.has('printing-debt'),'Kết thúc in trả lại chế độ giao diện thường');
    equal(elements.d_customer.textContent,'Khách <img src=x>','Tên khách trên phiếu nợ được gán bằng textContent');
    equal(elements.d_customerId.textContent,'KH000001','Phiếu nợ in đúng mã khách');
    equal(elements.d_phone.textContent,'0900000001','Phiếu nợ in số điện thoại');
    equal(elements.d_through.textContent,'Cập nhật đến: 05/11/2026','Phiếu nợ hiển thị ngày cập nhật của tổng đang mở');
    assert(elements.d_table.innerHTML.includes('HD&lt;img&gt;'),'Mã hóa đơn trên phiếu nợ được escape');
    assert(!elements.d_table.innerHTML.includes('HD<img>'),'Không chèn mã hóa đơn như HTML');
    assert(elements.d_payments.innerHTML.includes('Thu &lt;svg onload=x&gt;'),'Ghi chú thu nợ khi in được escape');
    equal(D.money(elements.d_total.textContent),350000,'Bản in tổng cộng giá trị các đơn được gộp');
    equal(D.money(elements.d_paid.textContent),120000,'Bản in đã trả gồm tiền ban đầu và các khoản thu công nợ');
    equal(D.money(elements.d_debt.textContent),230000,'Phiếu tổng hiển thị dư nợ hiệu lực');
    equal(elements.d_status.textContent,'CHƯA TẤT TOÁN','Phiếu còn nợ giữ trạng thái mở');
    window.print=function () {};
    app.Print.printStatement({...statement,paid:300000,debt:0,status:'closed',payments:[]});
    equal(elements.d_status.textContent,'ĐÃ TẤT TOÁN','Phiếu trả đủ in trạng thái kết thúc');
    equal(D.money(elements.d_debt.textContent),0,'Phiếu tất toán không còn nợ');
    assert(elements.d_payments.innerHTML.includes('Chưa ghi nhận'),'Phiếu không có lịch sử thu không giữ dữ liệu lần in trước');
    app.Print.printStatement({...statement,total:1000.75,paid:1000.5,debt:0.25,
        items:[{orderId:'HD1',date:'2026-11-04',total:1000.75,paid:0.5,debt:1000.25}],
        payments:[{id:'TT1',date:'2026-11-04',amount:1000.5,note:''}]});
    equal(D.money(elements.d_debt.textContent),0.25,'In công nợ giữ số dư lẻ từ dữ liệu cũ');
    assert(elements.d_table.innerHTML.includes('1.000,75 đ'),'Các dòng phiếu công nợ không làm tròn tiền lẻ');
    assert(elements.d_payments.innerHTML.includes('1.000,5 đ'),'Lịch sử thu trên bản in giữ tiền lẻ');
    window.print=function () { throw new Error('Máy in không sẵn sàng'); };
    expectThrow(function () { app.Print.printStatement(statement); },'Lỗi in vẫn được báo về giao diện');
    assert(!bodyClasses.has('printing-debt'),'Lỗi in không để lại chế độ phiếu nợ');
    expectThrow(function () { app.Print.printStatement({id:'CN1'}); },'Không in phiếu công nợ thiếu dữ liệu');
    print('PASS: ' + count + ' invoice behavior checks');
}
run().catch(function(error){ print('FAIL: ' + error.message + '\n' + error.stack); quit(1); });
