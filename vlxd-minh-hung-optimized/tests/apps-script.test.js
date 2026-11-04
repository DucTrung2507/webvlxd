/* Chạy từ thư mục dự án: JavaScriptCore jsc tests/apps-script.test.js. Không gọi Google. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs');
load('apps-script/inventory.gs');
load('apps-script/luuin.gs');
load('apps-script/soHD.gs');
var hdHeader = ['ID', 'Ngày', 'Khách hàng', 'Địa chỉ', 'Tổng', 'Khách trả', 'Công nợ', 'Nhân viên giao'];
var ctHeader = ['ID', 'Tên hàng', 'Số lượng', 'ĐVT', 'Đơn giá', 'Thành tiền'];
function reset(hd, ct) {
    mock.sheets = {HOADON: new FakeSheet('HOADON', hd), CHITIET_HD: new FakeSheet('CHITIET_HD', ct),
        MATHANG: new FakeSheet('MATHANG', [
            ['productId','name','type','price','requestId','requestHash','units','status','legacyUnit','baseUnit'],
            ['SP000001','Xi măng','Vật liệu',90000,'','',JSON.stringify([{unit:'bao',price:90000,factor:1}]),'active','','bao']
        ]),
        NHAPKHO: new FakeSheet('NHAPKHO', [['id','date','supplier','address','total','paid','debt','requestId','requestHash'],['NK010120260001','2026-01-01','NCC','',900000000,0,900000000,'','']]),
        CT_NHAPKHO: new FakeSheet('CT_NHAPKHO', [['receiptId','productId','name','qty','unit','price','subtotal'],['NK010120260001','SP000001','Xi măng',10000,'bao',90000,900000000]])
    };
    mock.writes = 0; mock.held = false; mock.acquires = 0; mock.releases = 0; mock.failWrite = ''; mock.reads = []; mock.alerts = []; mock.dialogs = [];
}
function result(output) {
    equal(output.mime, ContentService.MimeType.JSON, 'Trả JSON');
    return JSON.parse(output.getContent());
}
function history() { return result(doGet({parameter: {action: 'list'}})); }
function submit(data) { return result(doPost({postData: {contents: JSON.stringify(data)}})); }
function validOrder() {
    return {id: 'preview-must-not-be-used', date: '03/11/2026', customer: 'Nguyễn An', address: 'Địa chỉ A',
        total: '180.000 đ', paid: '100.000', debt: '80.000 đ', shipper: 'Anh Nam',
        items: [{name: 'Xi măng', qty: '2', unit: 'bao', price: '90.000', subtotal: '180.000 đ'}]};
}
function makeIn(values) {
    var sheet = mock.sheets.IN = new FakeSheet('IN', []);
    Object.keys(values).forEach(function (range) {
        var value = values[range];
        if (Array.isArray(value)) sheet.getRange(range).setValues(value);
        else sheet.getRange(range).setValue(value);
    });
    mock.writes = 0; mock.reads = []; return sheet;
}
function invoiceInput(overrides) {
    var items = Array.from({length: 16}, function (_, index) { return [index === 0 ? 'Xi măng' : '']; });
    var qty = Array.from({length: 16}, function (_, index) { return [index === 0 ? 2 : '']; });
    var price = Array.from({length: 16}, function (_, index) { return [index === 0 ? 90000 : '']; });
    var subtotal = Array.from({length: 16}, function (_, index) { return [index === 0 ? 180000 : '']; });
    return Object.assign({'B5': 'HD031120260020', 'L1': new Date('2026-11-03T00:00:00+07:00'), 'C8': 'Khách nhập từ Sheet',
        'C9': 'Địa chỉ từ IN', 'E28': 180000, 'E29': 100000, 'E30': 80000, 'E32': 'Anh Giao',
        'B12:B27': items, 'E12:E27': qty, 'F12:F27': price, 'G12:G27': subtotal}, overrides || {});
}
function run() {
    var oldId = 'HD010120230001', recentId = 'HD031120260002', noDetailId = 'HD020220240001';
    reset([hdHeader,
        [oldId, '1/1/2023', 'Khách lâu năm', 'Địa chỉ cũ', '180.000 đ', '100.000', '80.000 đ', 'Anh A'],
        ['', '', '', '', '', '', '', ''],
        [recentId, new Date('2026-11-02T18:00:00Z'), 'Khách mới', '', 100000, 100000, 0, 'Anh B'],
        [noDetailId, '', 'Thiếu ngày và chi tiết', '', 0, 0, 0, '']
    ], [ctHeader,
        [recentId, 'Cát', 0.5, 'm³', 200000, 100000],
        [oldId, 'Xi măng', 2, 'bao', '90.000', '180.000 đ'],
        ['', '', '', '', '', ''],
        [oldId, 'Gạch', 10, 'viên', 1000, 10000]
    ]);
    var before = JSON.stringify([mock.sheets.HOADON.rows, mock.sheets.CHITIET_HD.rows]);
    var data = history();
    equal(data.orders.length, 3, 'Lấy toàn bộ hóa đơn, bỏ dòng trống và tiêu đề');
    var old = data.orders.find(function (o) { return o.id === oldId; });
    var recent = data.orders.find(function (o) { return o.id === recentId; });
    var absent = data.orders.find(function (o) { return o.id === noDetailId; });
    equal(old.customer, 'Khách lâu năm', 'Giữ hóa đơn cũ');
    equal(old.items.length, 2, 'Ghép mọi mặt hàng theo mã dù nằm cách nhau');
    equal(old.items[0].unit, 'bao', 'Giữ đơn vị tính');
    equal(old.items[1].name, 'Gạch', 'Không ghép nhầm mặt hàng');
    equal(recent.items.length, 1, 'Không lấy mặt hàng của hóa đơn khác');
    equal(recent.items[0].unit, 'm³', 'Giữ ký tự đơn vị tính');
    equal(recent.date, '2026-11-03', 'Đọc ô ngày theo múi giờ Việt Nam');
    equal(old.date, '1/1/2023', 'Giữ chuỗi ngày cũ để frontend chuẩn hóa');
    equal(absent.items.length, 0, 'Giữ hóa đơn chưa có chi tiết');
    equal(absent.date, '', 'Không loại hóa đơn thiếu ngày');
    equal(JSON.stringify([mock.sheets.HOADON.rows, mock.sheets.CHITIET_HD.rows]), before, 'GET không thay đổi dữ liệu');
    equal(mock.writes, 0, 'GET không ghi Sheet');
    var preview = result(doGet());
    assert(typeof preview.lastId === 'string', 'GET mặc định trả lastId xem trước');
    assert([oldId, recentId, noDetailId].indexOf(preview.lastId) >= 0, 'lastId là hóa đơn thật');

    reset([hdHeader], [ctHeader]);
    equal(history().orders.length, 0, 'Sheet chỉ có tiêu đề trả danh sách rỗng');
    reset([], []);
    equal(history().orders.length, 0, 'Sheet rỗng trả danh sách rỗng');
    reset([[oldId, '1/1/2023', 'Không có tiêu đề', '', 10, 0, 10, '']], [[oldId, 'Đá', 1, 'khối', 10, 10]]);
    equal(history().orders.length, 1, 'Không mất dòng đầu nếu dữ liệu không có tiêu đề');

    var prefix = 'HD' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'ddMMyyyy');
    reset([hdHeader,
        [prefix + '0010', '3/11/2026', 'Đơn số lớn', '', 1, 0, 1, ''],
        [prefix + '0002', '3/11/2026', 'Đơn đảo thứ tự', '', 1, 0, 1, ''],
        [oldId, '1/1/2023', 'Đơn cũ cuối bảng', '', 1, 0, 1, '']
    ], [ctHeader]);
    var saved = submit(validOrder());
    equal(saved.status, 'success', 'Lưu thành công');
    equal(saved.id, prefix + '0011', 'Sinh mã theo số lớn nhất hôm nay dù Sheet đảo thứ tự');
    assert(saved.id !== 'preview-must-not-be-used', 'Mã do máy chủ quyết định');
    var hd = mock.sheets.HOADON.rows.at(-1), ct = mock.sheets.CHITIET_HD.rows.at(-1);
    equal(hd[0], saved.id, 'Mã chính thức ở HOADON');
    equal(hd[2], 'Nguyễn An', 'Lưu tên khách hàng');
    equal(hd[3], 'Địa chỉ A', 'Lưu địa chỉ');
    equal(hd[7], 'Anh Nam', 'Lưu nhân viên giao');
    equal(ct[0], saved.id, 'Chi tiết dùng cùng mã chính thức');
    equal(ct[1], 'Xi măng', 'Lưu tên mặt hàng');
    equal(String(ct[2]), '2', 'Lưu số lượng');
    equal(ct[3], 'bao', 'Lưu ĐVT đúng vị trí');
    var savedAgain = submit(validOrder());
    equal(savedAgain.id, prefix + '0012', 'Hai lần lưu liên tiếp không trùng mã');
    equal(mock.held, false, 'Giải phóng khóa sau lưu thành công');
    equal(mock.acquires, mock.releases, 'Mỗi khóa có một lần giải phóng');
    equal(history().orders.find(function(o){return o.id === saved.id;}).items[0].unit, 'bao', 'Đọc lại được hóa đơn vừa ghi');

    var invalidOrders = [null, {}, {...validOrder(), customer: ''}, {...validOrder(), items: []},
        {...validOrder(), items: [{name: 'Đá', qty: 0, price: 10}]},
        {...validOrder(), items: [{name: 'Đá', qty: 1, price: 0}]},
        {...validOrder(), items: [{name: '', qty: 1, price: 10}]},
        {...validOrder(), items: [{name: 'Đá', qty: 'abc', price: 10}]}];
    invalidOrders.forEach(function (order) {
        var writesBefore = mock.writes;
        equal(submit(order).status, 'error', 'Từ chối đơn sai');
        equal(mock.writes, writesBefore, 'Đơn sai không ghi một phần');
        equal(mock.held, false, 'Không giữ khóa sau lỗi dữ liệu');
    });
    equal(result(doPost({postData:{contents:'{invalid'}})).status, 'error', 'Báo lỗi JSON sai');
    equal(mock.held, false, 'Không giữ khóa sau JSON sai');
    mock.failWrite = 'HOADON';
    equal(submit(validOrder()).status, 'error', 'Báo lỗi ghi Sheet');
    equal(mock.held, false, 'Giải phóng khóa khi ghi thất bại');
    assert(submit(validOrder()).status === 'success', 'Lần lưu tiếp theo vẫn thực hiện được sau lỗi');
    delete mock.sheets.CHITIET_HD;
    equal(history().status, 'error', 'Báo rõ khi thiếu Sheet chi tiết');
    equal(mock.held, false, 'Giải phóng khóa khi đọc lỗi');
    // Cùng tab lịch sử chứa cả dòng 5 cột cũ và dòng 6 cột của web.
    reset([hdHeader, [oldId, '1/1/2023', 'Hóa đơn hỗn hợp', '', 0, 0, 0, '']], [ctHeader,
        [oldId, 'Dòng luuin cũ', 2, 90000, 180000],
        [oldId, 'Dòng web có ĐVT', 2, 'bao', 90000, 180000],
        [oldId, 'Dòng web thiếu ĐVT', 3, '', 1000, 3000],
        [oldId, 'Dòng 6 có thành tiền 0', 2, '', 90000, 0],
        [oldId, 'Dòng 6 thiếu thành tiền', 2, 'bao', 90000, ''],
        [oldId, 'Dòng 6 thiếu ĐVT/thành tiền', 0.5, '', 1000, ''],
        [oldId, 'Dòng 5 tiền định dạng', 2, '90.000 đ', '180.000 đ', '']
    ]);
    var mixedBefore = JSON.stringify(mock.sheets.CHITIET_HD.rows);
    var mixed = history().orders[0].items;
    equal(mixed.length, 7, 'Đọc mọi dòng 5 và 6 cột trong cùng hóa đơn');
    equal(mixed[0].unit, '', 'Định dạng 5 cột không lấy giá làm ĐVT');
    equal(mixed[0].price, 90000, 'Đơn giá 5 cột lấy từ D');
    equal(mixed[0].subtotal, 180000, 'Thành tiền 5 cột lấy từ E');
    equal(mixed[1].unit, 'bao', 'Đơn vị dòng 6 cột');
    equal(mixed[1].price, 90000, 'Đơn giá dòng 6 cột lấy từ E');
    equal(mixed[2].unit, '', 'Dòng 6 không có đơn vị giữ trống');
    equal(mixed[2].price, 1000, 'Dòng 6 không ĐVT vẫn đúng giá');
    equal(mixed[3].subtotal, 0, 'F bằng 0 không bị coi là ô trống');
    equal(mixed[3].price, 90000, 'F bằng 0 không đổi sơ đồ cột');
    equal(mixed[4].subtotal, 180000, 'Tính dòng 6 thiếu thành tiền, có ĐVT');
    equal(mixed[5].subtotal, 500, 'Tính dòng 6 thiếu thành tiền/ĐVT');
    equal(mixed[6].price, '90.000 đ', 'Đọc giá định dạng ở cột D cũ');
    equal(mixed[6].subtotal, '180.000 đ', 'Đọc thành tiền định dạng ở cột E cũ');
    equal(JSON.stringify(mock.sheets.CHITIET_HD.rows), mixedBefore, 'Đọc tương thích không di chuyển hoặc sửa dữ liệu cũ');

    // Mẫu IN dùng chung cách sinh mã dù ngày trong HOADON là Date hoặc chuỗi.
    var referenceDate = new Date('2026-11-03T00:00:00+07:00');
    reset([hdHeader,
        ['HD031120260012', '3/11/2026', 'Ngày dạng chuỗi', '', 0, 0, 0, ''],
        ['HD031120260004', referenceDate, 'Ngày dạng Date', '', 0, 0, 0, ''],
        ['HD010120230999', '1/1/2023', 'Khác ngày', '', 0, 0, 0, '']
    ], [ctHeader]);
    equal(generateId(mock.sheets.HOADON, referenceDate), 'HD031120260013', 'Sinh mã theo ngày tham chiếu, không đếm dòng hoặc dựa kiểu ô ngày');
    makeIn(invoiceInput());
    taoSoHoaDonTuDong();
    equal(mock.sheets.IN.getRange('B5').getValue(), 'HD031120260013', 'soHD cập nhật B5 đúng mã tiếp theo');
    mock.sheets.IN.getRange('L1').setValue('03/11/2026');
    taoSoHoaDonTuDong();
    equal(mock.sheets.IN.getRange('B5').getValue(), 'HD031120260013', 'soHD hỗ trợ ngày nhập dạng chuỗi Việt Nam');

    reset([hdHeader], [ctHeader]);
    makeIn(invoiceInput());
    var sheetSaved = luuHoaDon();
    equal(sheetSaved, true, 'Nút lưu trong Sheet vẫn hoạt động');
    var inHeader = mock.sheets.HOADON.rows.at(-1), inDetail = mock.sheets.CHITIET_HD.rows.at(-1);
    equal(inHeader[0], 'HD031120260020', 'Lưu số IN đã hiển thị và chưa trùng');
    equal(inHeader[2], 'Khách nhập từ Sheet', 'Lưu tên khách từ đúng C8');
    equal(inHeader[7], 'Anh Giao', 'Lưu nhân viên từ đúng E32');
    equal(inDetail.length, 7, 'Lưu từ IN dùng cột productId theo dõi tồn');
    equal(inDetail[0], inHeader[0], 'Chi tiết từ IN cùng mã hóa đơn');
    equal(inDetail[3], 'bao', 'IN chỉ tự chọn ĐVT khi danh mục có đúng một đơn vị');
    equal(inDetail[4], 90000, 'Giá từ F12 đúng cột E dữ liệu');
    equal(inDetail[5], 180000, 'Thành tiền từ G12 đúng cột F dữ liệu');
    assert(mock.alerts.length > 0, 'Lưu IN vẫn thông báo kết quả');
    equal(mock.held, false, 'Lưu IN giải phóng khóa');
    assert(mock.reads.filter(function (read) { return read.sheet === 'HOADON'; }).every(function (read) { return read.held; }), 'Kiểm tra trùng trong IN nằm trong khóa dùng chung');
    var writesBeforeDuplicate = mock.writes;
    equal(luuHoaDon(), false, 'IN chặn lưu trùng B5');
    equal(mock.writes, writesBeforeDuplicate, 'IN trùng mã không ghi thêm dòng');
    equal(mock.held, false, 'IN trùng mã giải phóng khóa');

    var badInputs = [
        {'B5': ''}, {'C8': ''},
        {'B12:B27': Array.from({length:16}, function(){return [''];})},
        {'E12:E27': [[0]].concat(Array.from({length:15}, function(){return [''];}))},
        {'F12:F27': [[0]].concat(Array.from({length:15}, function(){return [''];}))}
    ];
    badInputs.forEach(function (bad) {
        reset([hdHeader], [ctHeader]);
        makeIn(invoiceInput(bad));
        var savedBad = luuHoaDon();
        equal(savedBad, false, 'IN từ chối dữ liệu sai');
        equal(mock.writes, 0, 'IN dữ liệu sai không ghi một phần');
        equal(mock.held, false, 'IN dữ liệu sai không giữ khóa');
    });
    // Số lượng là số thập phân, không được đọc qua bộ phân tích tiền tệ.
    ['0,125', '0.125'].forEach(function (quantity) {
        reset([hdHeader], [ctHeader]);
        var emptyRows = Array.from({length:15}, function(){return [''];});
        makeIn(invoiceInput({
            'E12:E27': [[quantity]].concat(emptyRows),
            'F12:F27': [[1000]].concat(emptyRows),
            'G12:G27': [['']].concat(emptyRows)
        }));
        equal(luuHoaDon(), true, 'IN chấp nhận số lượng lẻ dạng chuỗi ' + quantity);
        var fractionalDetail = mock.sheets.CHITIET_HD.rows.at(-1);
        equal(fractionalDetail[2], 0.125, 'Không biến số lượng 0,125 thành 125');
        equal(fractionalDetail[5], 125, 'G trống tính số lượng nhân đơn giá và làm tròn đồng');
        equal(mock.held, false, 'Số lượng lẻ không giữ khóa sau lưu');
    });
    ['Infinity', '1e309'].forEach(function (quantity) {
        reset([hdHeader], [ctHeader]);
        makeIn(invoiceInput({'E12:E27': [[quantity]].concat(Array.from({length:15}, function(){return [''];}))}));
        equal(luuHoaDon(), false, 'IN từ chối số lượng không hữu hạn ' + quantity);
        equal(mock.writes, 0, 'Số lượng không hữu hạn bị chặn trước khi ghi');
        equal(mock.held, false, 'Số lượng không hữu hạn không giữ khóa');
    });
    // Tiêu đề thực tế của bảng tính đã triển khai phải bị loại ở cả hai tab.
    reset([
        ['Số HD', 'Ngày', 'Khách', 'Địa chỉ', 'Tổng', 'Trả', 'Nợ', 'Người giao'],
        ['HD031120260001', '03/11/2026', 'Khách thật', 'Địa chỉ thật', 180000, 100000, 80000, 'Anh Giao']
    ], [
        ['Số HD', 'Tên hàng', 'SL', 'Giá', 'Thành tiền'],
        ['HD031120260001', 'Xi măng', 2, 90000, 180000]
    ]);
    var actualHeaderSnapshot = JSON.stringify([mock.sheets.HOADON.rows, mock.sheets.CHITIET_HD.rows]);
    var actualHistory = history().orders;
    equal(actualHistory.length, 1, 'Số HD là tiêu đề, không phải hóa đơn');
    equal(actualHistory[0].id, 'HD031120260001', 'Chỉ trả mã hóa đơn thật');
    equal(actualHistory[0].items.length, 1, 'Không ghép dòng tiêu đề thành mặt hàng');
    equal(actualHistory[0].items[0].name, 'Xi măng', 'Chỉ ghép tên mặt hàng thật');
    equal(actualHistory[0].items[0].price, 90000, 'Chi tiết 5 cột thực tế vẫn đúng giá');
    equal(actualHistory[0].items[0].subtotal, 180000, 'Chi tiết 5 cột thực tế vẫn đúng thành tiền');
    equal(mock.writes, 0, 'Bỏ tiêu đề khi đọc không ghi Google Sheet');
    equal(JSON.stringify([mock.sheets.HOADON.rows, mock.sheets.CHITIET_HD.rows]), actualHeaderSnapshot, 'Giữ nguyên cả tiêu đề và dữ liệu thực tế');
    print('PASS: ' + checks + ' Apps Script checks (mock Sheets, no live writes)');
}
try { run(); } catch (error) { print('FAIL: ' + error.message + '\n' + error.stack); quit(1); }
