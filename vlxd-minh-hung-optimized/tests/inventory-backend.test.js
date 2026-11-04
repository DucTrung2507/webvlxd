/* Kiểm thử nghiệp vụ kho bằng Google Sheets giả lập; không ghi dữ liệu thật. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs');
load('apps-script/inventory.gs');
load('apps-script/luuin.gs');
load('apps-script/soHD.gs');
var hdHeader = ['Số HD', 'Ngày', 'Khách', 'Địa chỉ', 'Tổng', 'Trả', 'Nợ', 'Người giao'];
var ctHeader = ['Số HD', 'Tên hàng', 'SL', 'ĐVT', 'Giá', 'Thành tiền', 'productId'];
function output(value) { equal(value.mime, ContentService.MimeType.JSON, 'Phản hồi JSON'); return JSON.parse(value.getContent()); }
function getInventory() { return output(doGet({parameter:{action:'inventory'}})); }
function post(payload) { return output(doPost({postData:{contents:JSON.stringify(payload)}})); }
function getOrders() { return output(doGet({parameter:{action:'list'}})).orders; }
function snapshot() { return JSON.stringify(Object.keys(mock.sheets).sort().map(function(name){return [name,mock.sheets[name].rows];})); }
function qty(data, productId) {
    var item = data.stock.find(function(row){return row.productId === productId;});
    return item ? item.qty : 0;
}
function success(response, message) { equal(response.status, 'success', message + (response.message ? ' (' + response.message + ')' : '')); return response; }
function error(response, message) { equal(response.status, 'error', message); equal(mock.held, false, 'Lỗi không giữ khóa'); return response; }
function failWithoutWrites(payload, message) {
    var before = snapshot(), writes = mock.writes;
    error(post(payload), message);
    equal(snapshot(), before, message + ' không thay đổi Sheet');
    equal(mock.writes, writes, message + ' không gọi ghi');
}
function resetInventory() {
    mock.sheets = {
        HOADON:new FakeSheet('HOADON', [hdHeader, ['HD010120230001','1/1/2023','Khách cũ','',9000000,0,9000000,'']]),
        CHITIET_HD:new FakeSheet('CHITIET_HD', [ctHeader, ['HD010120230001','Xi măng Hà Tiên',100,'bao',90000,9000000]])
    };
    mock.writes=0; mock.held=false; mock.acquires=0; mock.releases=0; mock.failWrite=''; mock.reads=[]; mock.alerts=[]; mock.dialogs=[]; mock.writeLog=[];
}
function product(name, requestId) { var unit=name==='Cát xây'?'m³':'bao'; return {action:'createProduct',name:name,type:'Vật liệu',price:100000,baseUnit:unit,units:[{unit:unit,price:100000,factor:1}],requestId:requestId}; }
function receipt(productA, productB, requestId) {
    return {action:'receiveStock', requestId:requestId, date:'2026-11-03', supplier:'Nhà cung cấp A', address:'Kho A',
        total:1, paid:100000, debt:1, items:[
            {productId:productA,qty:10,unit:'bao',price:90000,subtotal:1},
            {productId:productB,qty:2.5,unit:'m³',price:200000,subtotal:1}
        ]};
}
function sale(productId, requestId, count) {
    return {requestId:requestId,date:'03/11/2026',customer:'Khách bán mới',address:'Công trình A',shipper:'Anh Giao',
        total:1,paid:100000,debt:1,items:[{productId:productId,name:'Tên từ trình duyệt',qty:count,unit:'bao',price:100000,subtotal:1}]};
}
function seedIn(values) {
    var sh=mock.sheets.IN=new FakeSheet('IN',[]);
    var empty=Array.from({length:15},function(){return [''];});
    var base=Object.assign({'B5':'HD031120260200','L1':new Date('2026-11-03T00:00:00+07:00'),'C8':'Khách IN','C9':'Địa chỉ IN',
        'E28':100000,'E29':0,'E30':100000,'E32':'Anh IN',
        'B12:B27':[['Xi măng Hà Tiên']].concat(empty),'E12:E27':[[1]].concat(empty),
        'F12:F27':[[100000]].concat(empty),'G12:G27':[[100000]].concat(empty)},values||{});
    Object.keys(base).forEach(function(range){if(Array.isArray(base[range]))sh.getRange(range).setValues(base[range]);else sh.getRange(range).setValue(base[range]);});
    mock.writeLog=[]; return sh;
}
function runInventory() {
    resetInventory();
    var initial=snapshot();
    var empty=getInventory();
    equal(empty.products.length,0,'Kho mới chưa có sản phẩm');
    equal(empty.receipts.length,0,'Kho mới chưa có phiếu nhập');
    equal(empty.stock.length,0,'Kho mới chưa có tồn kho');
    equal(mock.writes,0,'GET kho không tự tạo hoặc sửa các sheet');
    equal(snapshot(),initial,'GET kho giữ nguyên hóa đơn lịch sử');
    failWithoutWrites(product('', 'bad-product-empty'),'Tên sản phẩm trống bị chặn');
    failWithoutWrites({...product('Sản phẩm sai','bad-product-price'),units:[{unit:'bao',price:-1,factor:1}]},'Giá sản phẩm âm bị chặn');

    var createA=product('Xi măng Hà Tiên','product-a');
    var a=success(post(createA),'Tạo sản phẩm thứ nhất').product;
    assert(/^SP\d+$/.test(a.id),'Mã sản phẩm SP được cấp bởi máy chủ');
    equal(a.name,'Xi măng Hà Tiên','Lưu đúng tên sản phẩm');
    var afterProduct=snapshot(), productWrites=mock.writes;
    equal(success(post(createA),'Thử lại tạo sản phẩm cùng request').product.id,a.id,'Thử lại trả đúng mã sản phẩm');
    equal(snapshot(),afterProduct,'Thử lại sản phẩm không tạo dòng trùng');
    equal(mock.writes,productWrites,'Thử lại sản phẩm không ghi');
    failWithoutWrites(product('  xi  măng hà tiên  ','product-duplicate'),'Tên chuẩn hóa bị trùng phải bị chặn');
    failWithoutWrites({...createA,name:'Tên bị đổi'},'Cùng requestId nhưng nội dung khác bị chặn');
    var b=success(post(product('Cát xây','product-b')),'Tạo sản phẩm thứ hai').product;
    assert(b.id!==a.id,'Hai sản phẩm có mã khác nhau');
    var catalog=getInventory();
    equal(catalog.products.length,2,'GET trả danh mục đầy đủ');
    equal(qty(catalog,a.id),0,'Hóa đơn lịch sử không có productId không trừ kho mới');
    equal(qty(catalog,b.id),0,'Sản phẩm mới bắt đầu tồn 0');

    failWithoutWrites({...receipt(a.id,b.id,'invalid-qty'),items:[{productId:a.id,qty:0,unit:'bao',price:90000}]},'Không nhập số lượng 0');
    failWithoutWrites({...receipt(a.id,b.id,'invalid-product'),items:[{productId:'SP-no-such',qty:1,price:10}]},'Không nhập sản phẩm không tồn tại');
    var input=receipt(a.id,b.id,'receipt-1');
    var committed=success(post(input),'Lưu phiếu nhập').receipt;
    assert(/^NK\d+$/.test(committed.id),'Phiếu nhập được cấp mã NK');
    equal(committed.total,1400000,'Máy chủ tính tổng nhập từ số lượng nhân giá');
    equal(committed.paid,100000,'Tiền thanh toán phiếu nhập');
    equal(committed.debt,1300000,'Máy chủ tính nợ nhà cung cấp');
    equal(committed.supplier,'Nhà cung cấp A','Lưu nhà cung cấp');
    equal(committed.address,'Kho A','Lưu địa chỉ nhà cung cấp');
    equal(committed.items[0].name,a.name,'Tên hàng lấy từ danh mục');
    equal(committed.items[0].subtotal,900000,'Không tin thành tiền tùy ý từ trình duyệt');
    var stock=getInventory();
    equal(qty(stock,a.id),10,'Nhập hàng tăng tồn sản phẩm A');
    equal(qty(stock,b.id),2.5,'Kho giữ số lượng lẻ');
    equal(stock.receipts.length,1,'Phiếu nhập đã cam kết xuất hiện trong danh sách');
    var receiptSnapshot=snapshot(), receiptWrites=mock.writes;
    equal(success(post(input),'Thử lại phiếu nhập').receipt.id,committed.id,'Thử lại trả phiếu nhập cũ');
    equal(snapshot(),receiptSnapshot,'Thử lại phiếu nhập không nhân đôi hàng tồn');
    equal(mock.writes,receiptWrites,'Thử lại phiếu nhập không ghi');
    failWithoutWrites({...input,supplier:'Nhà cung cấp bị đổi'},'Không cho tái dùng requestId nhập với nội dung khác');

    var oversell=sale(a.id,'sale-oversell-aggregate',6);
    oversell.items.push({...oversell.items[0],qty:5});
    failWithoutWrites(oversell,'Chặn tổng hai dòng cùng sản phẩm vượt tồn');
    failWithoutWrites(sale('SP-no-such','sale-unknown',1),'Không bán sản phẩm không tồn tại');
    var sold=success(post(sale(a.id,'sale-1',3)),'Bán hàng trừ kho');
    equal(qty(getInventory(),a.id),7,'Phiếu bán đã cam kết trừ đúng số lượng');
    var order=getOrders().find(function(row){return row.id===sold.id;});
    equal(order.total,300000,'Máy chủ tính tổng hóa đơn bán');
    equal(order.debt,200000,'Máy chủ tính công nợ hóa đơn bán');
    equal(order.items[0].productId,a.id,'Chi tiết bán lưu productId');
    equal(order.items[0].name,a.name,'Chi tiết bán dùng tên trong danh mục');
    var saleSnapshot=snapshot(), saleWrites=mock.writes;
    equal(success(post(sale(a.id,'sale-1',3)),'Thử lại đơn bán').id,sold.id,'Thử lại trả đúng mã đơn cũ');
    equal(snapshot(),saleSnapshot,'Thử lại đơn bán không trừ kho lần hai');
    equal(mock.writes,saleWrites,'Thử lại đơn bán không ghi');
    failWithoutWrites(sale(a.id,'sale-1',2),'RequestId bán không được đổi số lượng');
    success(post(sale(a.id,'sale-followup',5)),'Bán tiếp làm tồn thấp hơn lượng trong đơn đã lưu');
    equal(qty(getInventory(),a.id),2,'Tồn giảm sau đơn bán thứ hai');
    var lowStockReplay=snapshot();
    equal(success(post(sale(a.id,'sale-1',3)),'Retry đơn cũ khi tồn hiện tại thấp').id,sold.id,'Retry vẫn nhận đơn cũ dù tồn không đủ bán mới');
    equal(snapshot(),lowStockReplay,'Retry sau khi kho thay đổi không ghi hoặc trừ lại');

    // Nội dung danh mục có thể được sửa sau khi lưu; retry vẫn nhận chứng từ gốc.
    var productRow=mock.sheets.MATHANG.rows.find(function(row){return row[0]===a.id;});
    var previousName=productRow[1], previousPrice=productRow[3];
    productRow[1]='Xi măng đã đổi tên'; productRow[3]=777777;
    var afterCatalogEdit=snapshot(), catalogEditWrites=mock.writes;
    equal(success(post(sale(a.id,'sale-1',3)),'Retry bán sau khi sửa danh mục').id,sold.id,'Mã bán cũ không phụ thuộc tên/giá danh mục mới');
    equal(success(post(input),'Retry nhập sau khi sửa danh mục').receipt.id,committed.id,'Mã nhập cũ không phụ thuộc tên/giá danh mục mới');
    equal(snapshot(),afterCatalogEdit,'Retry sau đổi danh mục không ghi lại chứng từ');
    equal(mock.writes,catalogEditWrites,'Retry sau đổi danh mục không ghi Sheet');
    equal(qty(getInventory(),a.id),2,'Retry sau đổi danh mục không trừ lại hàng đã bán');
    productRow[1]=previousName; productRow[3]=previousPrice;

    // Dòng chi tiết ghi dang dở không tác động tồn trước khi header cam kết thành công.
    var beforeFailures=qty(getInventory(),a.id), countBeforeFailures=getInventory().receipts.length;
    mock.failWrite='CT_NHAPKHO';
    error(post({...receipt(a.id,b.id,'receipt-detail-fail')}),'Lỗi ghi chi tiết phiếu nhập');
    equal(qty(getInventory(),a.id),beforeFailures,'Chi tiết nhập ghi lỗi không tăng tồn');
    equal(getInventory().receipts.length,countBeforeFailures,'Chi tiết nhập ghi lỗi không có phiếu cam kết');
    mock.failWrite='NHAPKHO';
    error(post(receipt(a.id,b.id,'receipt-header-fail')),'Lỗi ghi header phiếu nhập');
    var orphanReceipt=mock.sheets.CT_NHAPKHO.rows.at(-1)[0];
    equal(qty(getInventory(),a.id),beforeFailures,'Chi tiết nhập mồ côi không tăng tồn');
    equal(getInventory().receipts.length,countBeforeFailures,'Header nhập lỗi không hiện phiếu');
    var recoveredReceipt=success(post(receipt(a.id,b.id,'receipt-recovery')),'Lưu nhập sau lỗi').receipt;
    assert(recoveredReceipt.id!==orphanReceipt,'Không dùng lại mã phiếu nhập có chi tiết mồ côi');
    equal(qty(getInventory(),a.id),beforeFailures+10,'Chỉ cộng lượng của phiếu nhập đã cam kết');

    var beforeSaleFailures=qty(getInventory(),a.id);
    mock.failWrite='CHITIET_HD';
    error(post(sale(a.id,'sale-detail-fail',1)),'Lỗi ghi chi tiết bán');
    equal(qty(getInventory(),a.id),beforeSaleFailures,'Chi tiết bán lỗi không trừ kho');
    mock.failWrite='HOADON';
    error(post(sale(a.id,'sale-header-fail',1)),'Lỗi ghi header bán');
    var orphanSale=mock.sheets.CHITIET_HD.rows.at(-1)[0];
    equal(qty(getInventory(),a.id),beforeSaleFailures,'Chi tiết bán mồ côi không trừ kho');
    var recoveredSale=success(post(sale(a.id,'sale-recovery',1)),'Lưu bán sau lỗi');
    assert(recoveredSale.id!==orphanSale,'Không dùng lại mã bán có chi tiết mồ côi');
    equal(qty(getInventory(),a.id),beforeSaleFailures-1,'Chỉ trừ lượng của hóa đơn đã cam kết');

    // Nút lưu từ IN dùng cùng mã sản phẩm và cùng khóa với website.
    seedIn();
    var beforeIn=qty(getInventory(),a.id);
    equal(luuHoaDon(),true,'Lưu hóa đơn IN với danh mục hàng');
    equal(qty(getInventory(),a.id),beforeIn-1,'Hóa đơn IN cũng trừ tồn kho');
    var fromIn=getOrders().find(function(row){return row.id==='HD031120260200';});
    equal(fromIn.items[0].productId,a.id,'Tên hàng IN được nối vào productId danh mục');
    var inWrites=mock.writes;
    equal(luuHoaDon(),false,'IN chặn lưu trùng mã');
    equal(mock.writes,inWrites,'IN trùng mã không trừ kho lại');
    var tail=Array.from({length:14},function(){return [''];});
    var currentInStock=qty(getInventory(),a.id);
    seedIn({'B5':'HD031120260201','B12:B27':[['Xi măng Hà Tiên'],['Xi măng Hà Tiên']].concat(tail),
        'E12:E27':[[currentInStock],[1]].concat(tail),
        'F12:F27':[[100000],[100000]].concat(tail),
        'G12:G27':[[currentInStock*100000],[100000]].concat(tail)});
    var beforeInOversell=snapshot(), inOversellWrites=mock.writes;
    equal(luuHoaDon(),false,'IN gộp số lượng hai dòng cùng hàng trước khi kiểm tra tồn');
    equal(snapshot(),beforeInOversell,'IN vượt tồn không lưu một phần');
    equal(mock.writes,inOversellWrites,'IN vượt tồn không ghi Sheet');
    assert(mock.writeLog.filter(function(entry){return entry.sheet!=='IN';}).every(function(entry){return entry.held;}),'Tất cả ghi nghiệp vụ kho/bán nằm trong khóa dùng chung');
    equal(mock.held,false,'Không còn giữ khóa sau nghiệp vụ');
    equal(mock.acquires,mock.releases,'Mọi khóa đã cấp đều được giải phóng');
    var overpaid=success(post({action:'receiveStock',requestId:'receipt-overpaid',date:'2026-11-03',supplier:'Nhà cung cấp trả dư',paid:25,
        items:[{productId:a.id,qty:1,unit:'bao',price:10}]}),'Phiếu nhập hỗ trợ trả dư').receipt;
    equal(overpaid.total,10,'Tổng phiếu trả dư vẫn tính từ mặt hàng');
    equal(overpaid.paid,25,'Giữ đúng số tiền trả dư');
    equal(overpaid.debt,-15,'Công nợ âm phản ánh trả dư, thống nhất với hóa đơn bán');
    print('PASS: '+checks+' inventory backend checks (mock Sheets only)');
}
function runInventoryRegressions() {
    resetInventory();
    failWithoutWrites(sale('SP000001','sale-no-catalog-id',1),'Có mã mặt hàng thì không được bỏ qua kho khi chưa có danh mục');
    var a=success(post(product('Xi măng Hà Tiên','precision-product')),'Tạo hàng kiểm tra số lượng').product;
    failWithoutWrites(sale(a.id,'tiny-zero-stock',1e-10),'Không cấp lượng tồn ảo cho số lượng rất nhỏ');
    failWithoutWrites(sale(a.id,'micro-zero-stock',0.000001),'Không bán đơn vị nhỏ nhất khi tồn bằng 0');
    function receiveOne(id, count) {
        return {action:'receiveStock',requestId:id,date:'2026-11-03',supplier:'NCC kiểm tra',paid:0,
            items:[{productId:a.id,qty:count,unit:'bao',price:100000}]};
    }
    failWithoutWrites(receiveOne('receipt-too-precise',0.0000001),'Không nhập quá 6 chữ số thập phân');
    failWithoutWrites(receiveOne('receipt-too-large',9007199254.740992),'Không nhập số lượng vượt số nguyên vi đơn vị an toàn');
    var noise=success(post(receiveOne('receipt-floating-noise',0.1+0.2)),'Chấp nhận nhiễu biểu diễn số thực').receipt;
    equal(noise.items[0].qty,0.3,'Lưu số lượng đã chuẩn hóa đúng 6 chữ số');
    equal(qty(getInventory(),a.id),0.3,'Tồn dùng vi đơn vị nguyên');
    var decimalSale=sale(a.id,'sale-three-decimals',0.1);
    decimalSale.items.push({...decimalSale.items[0]}, {...decimalSale.items[0]});
    success(post(decimalSale),'Bán 0,1 ba dòng đúng bằng tồn 0,3');
    equal(qty(getInventory(),a.id),0,'Gộp ba dòng thập phân không âm tồn do số thực');
    failWithoutWrites(sale(a.id,'sale-after-exact-zero',0.000001),'Tồn chính xác 0 không bán thêm được vi đơn vị');
    var smallest=success(post(receiveOne('receipt-smallest',0.000001)),'Nhập đơn vị nhỏ nhất').receipt;
    equal(smallest.items[0].qty,0.000001,'Giữ đủ 6 chữ số thập phân');
    success(post(sale(a.id,'sale-smallest',0.000001)),'Bán đơn vị nhỏ nhất đúng tồn');
    equal(qty(getInventory(),a.id),0,'Nhập rồi bán vi đơn vị không để dư tồn');

    var aggregate=receiveOne('receipt-aggregate-overflow',5000000000);
    aggregate.items.push({...aggregate.items[0]});
    failWithoutWrites(aggregate,'Gộp dòng nhập vượt tổng vi đơn vị an toàn bị chặn trước ghi');
    success(post(receiveOne('receipt-large-valid',5000000000)),'Nhập lượng lớn còn trong giới hạn');
    failWithoutWrites(receiveOne('receipt-stock-overflow',5000000000),'Cộng tồn hiện tại vượt giới hạn bị chặn trước ghi');
    var tooMany=sale(a.id,'sale-aggregate-overflow',5000000000);
    tooMany.items.push({...tooMany.items[0]});
    failWithoutWrites(tooMany,'Gộp dòng bán vượt giới hạn bị chặn trước ghi');
    success(post(sale(a.id,'sale-reduce-net-before-gross-limit',4000000000)),'Xuất kho làm tồn ròng thấp hơn lượng đã nhập');
    equal(qty(getInventory(),a.id),1000000000,'Tồn ròng sau xuất vẫn chính xác');
    failWithoutWrites(receiveOne('receipt-gross-overflow-after-sales',5000000000),'Nhập mới vượt giới hạn tổng nhập bị chặn trước ghi dù tồn ròng còn trong giới hạn');
    equal(qty(getInventory(),a.id),1000000000,'Từ chối nhập vượt tổng lịch sử không làm hỏng lần đọc tồn tiếp theo');

    // Danh mục từng có nhập/xuất không được âm thầm trở lại luồng bán không theo dõi kho.
    mock.sheets.MATHANG.rows=mock.sheets.MATHANG.rows.slice(0,1);
    failWithoutWrites(sale(a.id,'cleared-catalog-with-id',100),'Danh mục bị xóa không cho bỏ qua kiểm tra mã mặt hàng');
    var byName=sale('','cleared-catalog-by-name',100);
    byName.items[0].name='Xi măng Hà Tiên';
    failWithoutWrites(byName,'Danh mục trống nhưng có phiếu nhập thì không dùng luồng cũ');
    resetInventory();
    mock.sheets.CHITIET_HD.rows[1][6]='SP000001';
    failWithoutWrites(byName,'Có dòng bán mang mã mặt hàng thì không dùng luồng cũ');
    resetInventory();
    mock.sheets.CT_NHAPKHO=new FakeSheet('CT_NHAPKHO',[
        ['receiptId','productId','name','qty','unit','price','subtotal'],
        ['NK031120260001','SP000001','Xi măng Hà Tiên',1,'bao',100000,100000]
    ]);
    failWithoutWrites(byName,'Có chi tiết nhập dang dở thì không dùng luồng cũ');
    resetInventory();
    var legacy=byName; legacy.requestId='truly-unused-legacy';
    failWithoutWrites(legacy,'Danh mục chưa có cũng không cho bán mặt hàng ngoài danh mục');
    print('PASS: '+checks+' inventory backend checks including precision and catalog regressions');
}
function runCatalogConversions() {
    resetInventory();
    var mixed={action:'createProduct',requestId:'multi-create',name:'Xi măng',type:'Vật liệu',baseUnit:'kg',
        units:[{unit:'kg',price:2500,factor:1},{unit:'bao',price:100000,factor:50}]};
    var a=success(post(mixed),'Tạo mặt hàng có nhiều đơn vị và quy đổi').product;
    equal(a.baseUnit,'kg','Lưu đơn vị gốc'); equal(a.units[1].factor,50,'Lưu hệ số 1 bao = 50 kg');
    var inBao={action:'receiveStock',requestId:'multi-receipt',date:'2026-11-03',supplier:'NCC',paid:0,
        items:[{productId:a.id,qty:2,unit:'bao',price:80000}]};
    success(post(inBao),'Nhập theo bao');
    equal(qty(getInventory(),a.id),100,'2 bao quy đổi thành 100 kg tồn');
    equal(getInventory().stock[0].unit,'kg','Kho hiển thị theo đơn vị gốc');
    // Phiếu đã lưu trước khi đổi định dạng requestHash vẫn nhận được phản hồi retry.
    mock.sheets.NHAPKHO.rows[1][8]=inventoryHash_({date:'2026-11-03',supplier:'NCC',address:'',paid:0,
        items:[{productId:a.id,qty:2,unit:'bao',price:80000}]});
    var legacyReplaySnapshot=snapshot(),legacyReplayWrites=mock.writes;
    success(post(inBao),'Retry phiếu nhập dùng requestHash phiên bản trước');
    equal(snapshot(),legacyReplaySnapshot,'Retry hash cũ không đổi chứng từ');equal(mock.writes,legacyReplayWrites,'Retry hash cũ không ghi');
    var kgSale=sale(a.id,'multi-sale-kg',2.3); kgSale.items[0].unit='kg'; kgSale.items[0].price=2500;
    success(post(kgSale),'Bán thập phân theo kg'); equal(qty(getInventory(),a.id),97.7,'Bán 2,3 kg trừ chính xác');
    mock.sheets.HOADON.rows.at(-1)[9]=inventoryHash_({date:'2026-11-03',customer:'Khách bán mới',address:'Công trình A',shipper:'Anh Giao',paid:100000,
        items:[{productId:a.id,qty:2.3,unit:'kg',price:2500}]});
    var saleLegacySnapshot=snapshot(),saleLegacyWrites=mock.writes;
    success(post(kgSale),'Retry hóa đơn dùng requestHash phiên bản trước');
    equal(snapshot(),saleLegacySnapshot,'Retry hóa đơn hash cũ không sửa dữ liệu');equal(mock.writes,saleLegacyWrites,'Retry hóa đơn hash cũ không ghi');
    success(post(sale(a.id,'multi-sale-bao',1)),'Bán theo bao'); equal(qty(getInventory(),a.id),47.7,'Bán 1 bao trừ 50 kg');
    var over=sale(a.id,'multi-over',48);over.items[0].unit='kg';failWithoutWrites(over,'Không bán vượt tồn sau quy đổi');
    var missing=sale(a.id,'multi-no-unit',1);missing.items[0].unit='';failWithoutWrites(missing,'ĐVT bắt buộc ở máy chủ');
    var invalid=sale(a.id,'multi-wrong-unit',1);invalid.items[0].unit='tấn';failWithoutWrites(invalid,'Đơn vị bán phải thuộc mặt hàng');
    var changed={...mixed,productId:a.id,requestId:'multi-price-edit',units:[{unit:'kg',price:3000,factor:1},{unit:'bao',price:110000,factor:50}]};
    success(post(changed),'Được đổi giá bán sau phát sinh kho');
    failWithoutWrites({...changed,requestId:'multi-bad-factor',units:[{unit:'kg',price:3000,factor:1},{unit:'bao',price:110000,factor:40}]},'Không đổi hệ số làm sai lịch sử nhập xuất');
    failWithoutWrites({...changed,requestId:'multi-bad-base',baseUnit:'bao',units:[{unit:'kg',price:3000,factor:0.02},{unit:'bao',price:110000,factor:1}]},'Không đổi đơn vị gốc sau phát sinh kho');
    success(post({...changed,requestId:'multi-add-unit',units:changed.units.concat([{unit:'tạ',price:200000,factor:100}])}),'Được bổ sung đơn vị mới sau phát sinh kho');
    failWithoutWrites({...mixed,requestId:'bad-base-factor',name:'Hàng lỗi',units:[{unit:'kg',price:100,factor:2}]},'Đơn vị gốc phải có hệ số 1');
    var beforeIN=qty(getInventory(),a.id); seedIn({'B12:B27':[['Xi măng']].concat(Array.from({length:15},function(){return [''];}))});
    equal(luuHoaDon(),false,'Mẫu IN thiếu ĐVT không đoán đơn vị khi có nhiều lựa chọn'); equal(qty(getInventory(),a.id),beforeIN,'IN không rõ ĐVT không trừ tồn');

    resetInventory();
    var pendingInput={action:'receiveStock',requestId:'unknown-receive',date:'2026-11-03',supplier:'NCC mới',paid:0,
        items:[{name:'Hàng nhập mới',qty:2,unit:'bao',price:50000},{name:'  hàng   nhập mới ',qty:1,unit:'kg',price:1000}]};
    var received=success(post(pendingInput),'Cho nhập tên chưa có trong danh mục');
    equal(received.products.length,1,'Một tên chuẩn hóa chỉ tạo một mã chờ');
    var p=received.products[0];equal(p.status,'pending','Hàng mới chưa đủ thông tin ở trạng thái chờ');
    equal(p.units.length,0,'Không lấy giá nhập làm giá bán');
    equal(getInventory().products[0].receivedUnits.length,2,'API gợi ý đủ đơn vị đã nhập để hoàn thiện');
    var blank=JSON.stringify(mock.sheets.HOADON.rows);
    failWithoutWrites(sale(p.id,'pending-cannot-sell',1),'Hàng chờ không được bán dù có tồn');
    equal(JSON.stringify(mock.sheets.HOADON.rows),blank,'Chặn bán hàng chờ không tạo hóa đơn');
    var complete={action:'createProduct',productId:p.id,requestId:'complete-pending',name:'Hàng nhập mới',type:'Vật liệu',baseUnit:'kg',
        units:[{unit:'kg',price:2000,factor:1},{unit:'bao',price:90000,factor:50}]};
    failWithoutWrites({...complete,requestId:'incomplete-units',units:[{unit:'kg',price:2000,factor:1}]},'Hoàn thiện phải khai báo mọi ĐVT đã nhập');
    var completed=success(post(complete),'Hoàn thiện giá bán và quy đổi mặt hàng chờ').product;
    equal(completed.id,p.id,'Hoàn thiện giữ nguyên productId đã gắn với nhập kho');
    equal(completed.status,'active','Mặt hàng đủ thông tin trở thành có thể bán');
    equal(qty(getInventory(),p.id),101,'Quy đổi 2 bao và 1 kg lịch sử thành 101 kg');
    var sold=sale(p.id,'completed-sell',1);sold.items[0].unit='kg';success(post(sold),'Hàng vừa hoàn thiện được bán');
    equal(qty(getInventory(),p.id),100,'Bán sau hoàn thiện trừ đúng tồn');
    success(post({...complete,requestId:'rename-completed',name:'Tên mới sau hoàn thiện'}),'Đổi tên mặt hàng vẫn giữ mã');
    var replayBefore=snapshot(),replayWrites=mock.writes;
    equal(success(post(pendingInput),'Retry phiếu nhập tên cũ sau hoàn thiện và đổi tên').receipt.id,received.receipt.id,'Retry nhận đúng phiếu gốc');
    equal(snapshot(),replayBefore,'Retry tên cũ không tạo mặt hàng chờ mới'); equal(mock.writes,replayWrites,'Retry không ghi hoặc cộng kho lại');
    var brokenUnknown={...pendingInput,requestId:'bad-unknown-input',items:[{name:'Một tên mới khác',qty:1,unit:'bao',price:100},{name:'Hàng sai',qty:0,unit:'kg',price:100}]};
    failWithoutWrites(brokenUnknown,'Không tạo sản phẩm chờ trước khi kiểm tra toàn bộ phiếu nhập');

    resetInventory();
    mock.sheets.MATHANG=new FakeSheet('MATHANG',[
        ['productId','name','type','price','requestId','requestHash'],['SP000001','Hàng cũ','Vật liệu',100000,'','']]);
    mock.sheets.NHAPKHO=new FakeSheet('NHAPKHO',[
        ['id','date','supplier','address','total','paid','debt','requestId','requestHash'],['NK031120260001','2026-11-03','NCC','',100000,0,100000,'','']]);
    mock.sheets.CT_NHAPKHO=new FakeSheet('CT_NHAPKHO',[
        ['receiptId','productId','name','qty','unit','price','subtotal'],['NK031120260001','SP000001','Hàng cũ',2,'',50000,100000]]);
    var legacy=getInventory();equal(legacy.products[0].status,'pending','Danh mục cũ chưa có ĐVT phải hoàn thiện');
    equal(legacy.stock[0].qty,2,'Không làm mất tồn cũ chưa có ĐVT');
    var oldDetails=JSON.stringify(mock.sheets.CT_NHAPKHO.rows);
    var migrated={action:'createProduct',productId:'SP000001',requestId:'legacy-complete',name:'Hàng cũ',type:'Vật liệu',baseUnit:'kg',
        units:[{unit:'kg',price:2000,factor:1},{unit:'bao',price:100000,factor:50}]};
    failWithoutWrites(migrated,'Phải chỉ rõ ĐVT của tồn cũ khi cấu hình nhiều đơn vị');
    success(post({...migrated,legacyUnit:'bao'}),'Gán ĐVT tồn cũ rõ ràng trước khi quy đổi');
    equal(qty(getInventory(),'SP000001'),100,'Tồn cũ 2 được ánh xạ 2 bao = 100 kg');
    equal(JSON.stringify(mock.sheets.CT_NHAPKHO.rows),oldDetails,'Quy đổi không ghi đè chứng từ lịch sử');

    resetInventory();
    var micro=success(post({action:'createProduct',requestId:'conversion-micro',name:'Hàng nhỏ',type:'Vật liệu',baseUnit:'g',units:[{unit:'g',price:10,factor:1},{unit:'phần',price:1,factor:0.1}]}),'Tạo quy đổi thập phân').product;
    failWithoutWrites({action:'receiveStock',requestId:'converted-too-small',supplier:'NCC',date:'2026-11-03',paid:0,
        items:[{productId:micro.id,qty:0.000001,unit:'phần',price:1}]},'Không làm tròn mất lượng nhỏ hơn một vi đơn vị sau quy đổi');
    success(post({action:'receiveStock',requestId:'converted-decimal',supplier:'NCC',date:'2026-11-03',paid:0,
        items:[{productId:micro.id,qty:3,unit:'phần',price:1}]}),'Nhập 3 phần quy đổi 0,3 g');
    equal(qty(getInventory(),micro.id),0.3,'Giữ chính xác kết quả quy đổi thập phân');
    print('PASS: '+checks+' inventory checks including pending catalog and unit conversions');
}

try {runInventory();runInventoryRegressions();runCatalogConversions();} catch(error){print('FAIL: '+error.message+'\n'+error.stack);quit(1);}
