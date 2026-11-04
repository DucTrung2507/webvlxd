/* Client API → doGet/doPost thật, qua Sheets giả lập; không gọi mạng. Chạy bằng JSC. */
load('tests/apps-script-mocks.js');
load('apps-script/websang.gs');
load('apps-script/inventory.gs');
load('apps-script/luuin.gs');
load('apps-script/soHD.gs');
var window = {};
function setTimeout() { return 1; }
function clearTimeout() {}
function AbortController() { this.signal = {}; this.abort = function () {}; }
var fetch = async function (url, options) {
    var response = options.method === 'POST' ? doPost({postData:{contents:options.body}}) :
        doGet({parameter:{action:(url.match(/[?&]action=([^&]+)/) || [,''])[1]}});
    return {ok:true, text:async function () { return response.getContent(); }};
};
load('js/order-data.js');
load('js/order-api.js');

async function run() {
    var legacy = ['HD010120230001','1/1/2023','Khách cũ','',900000,0,900000,''];
    mock.sheets = {
        HOADON:new FakeSheet('HOADON', [['Số HD','Ngày','Khách','Địa chỉ','Tổng','Trả','Nợ','Người giao'], legacy]),
        CHITIET_HD:new FakeSheet('CHITIET_HD', [['Số HD','Tên hàng','SL','ĐVT','Giá','Thành tiền'],
            [legacy[0],'Xi măng',10,'bao',90000,900000]])
    };
    var API = window.InvoiceApp.API;
    equal((await API.inventory()).products.length, 0, 'Client reads initially empty catalog');
    var product = await API.createProduct({name:'Xi măng',type:'Vật liệu',price:100000,baseUnit:'bao',units:[{unit:'bao',price:100000,factor:1}],requestId:'flow-product'});
    equal(product.id, 'SP000001', 'Client receives official product code');
    var receiptPayload = {requestId:'flow-receipt',date:'2026-11-03',supplier:'Nhà cung cấp',address:'Kho',paid:100000,
        items:[{productId:product.id,qty:2.5,unit:'bao',price:90000}]};
    var received = await API.receiveStock(receiptPayload);
    equal(received.receipt.id, 'NK031120260001', 'Client receives official NK code');
    equal(received.stock[0].qty, 2.5, 'Historical untracked sales do not reduce new stock');
    equal(received.receipt.debt, 125000, 'Server computes import debt');
    var payload = {id:'preview',requestId:'flow-sale',date:'03/11/2026',customer:'Khách mua',paid:'10.000',
        items:[{productId:product.id,name:'SP000001 — Xi măng',qty:'0.125',unit:'bao',price:'100.000',subtotal:'12.500 đ'}]};
    var sold = await API.save(payload);
    assert(/^HD\d{12,}$/.test(sold.id), 'Sale gets committed HD ID');
    equal(sold.items[0].name, 'Xi măng', 'Canonical product name replaces UI label');
    equal(sold.total, 12500, 'Localized sale prices parsed once by server');
    equal(sold.debt, 2500, 'Server computes sale debt');
    equal((await API.inventory()).stock[0].qty, 2.375, 'Sale deducts fractional quantity');
    var writes = mock.writes;
    equal((await API.save(payload)).id, sold.id, 'Sale retry round-trips official ID');
    equal(mock.writes, writes, 'Sale retry writes no additional rows');
    equal((await API.receiveStock(receiptPayload)).stock[0].qty, 2.375, 'Receipt retry returns current stock');
    equal(mock.writes, writes, 'Receipt retry does not re-add stock');
    var error;
    try { await API.save({...payload,requestId:'flow-oversell',items:[{...payload.items[0],qty:'3'}]}); }
    catch (caught) { error = caught; }
    assert(error && error.message.includes('Không đủ tồn kho'), 'Stock rejection reaches real API client');
    equal(mock.writes, writes, 'Oversell has no writes');
    var listed = (await API.list()).find(function (order) { return order.id === sold.id; });
    equal(listed.items[0].productId, product.id, 'History preserves stock linkage through normalization');
    equal(listed.items[0].qty, 0.125, 'History preserves fractional quantity');
    equal(JSON.stringify(mock.sheets.HOADON.rows[1]), JSON.stringify(legacy), 'Legacy invoice left intact');
    print('PASS: ' + checks + ' client/backend inventory flow checks (mock Sheets, no network)');
}
run().catch(function (error) { print('FAIL: ' + error.message + '\n' + error.stack); quit(1); });
