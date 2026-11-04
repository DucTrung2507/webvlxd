/* API khách hàng/công nợ qua fetch giả, không gửi dữ liệu lên Google. */
var window = {}, responses = [], sent = [], checks = 0;
function assert(ok, message) { if (!ok) throw new Error(message); checks++; }
function equal(actual, expected, message) { assert(actual === expected, message + ': ' + actual + ' !== ' + expected); }
function setTimeout() { return 1; } function clearTimeout() {}
function AbortController() { this.signal = {}; this.abort = function () {}; }
function fetch(url, options) {
    sent.push({url: url, options: options});
    var response = responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({ok: true, text: function () { return Promise.resolve(JSON.stringify(response)); }});
}
load('js/order-data.js'); load('js/order-api.js');
async function rejects(fn, message) { var failed = false; try { await fn(); } catch (error) { failed = true; } assert(failed, message); }
async function run() {
    var api = window.InvoiceApp.API;
    responses.push({products: [], orders: []});
    await rejects(function () { return api.customers(); }, 'Old deployment cannot look like empty customers');
    responses.push({schemaVersion: 1, customers: [], orders: [], statements: []});
    await rejects(function () { return api.customers(); }, 'Missing payments rejected');
    var data = {schemaVersion: 1, customers: [{id: 'KH000001', name: 'Khách A'}], orders: [], statements: [], payments: []};
    responses.push(data);
    equal((await api.customers()).customers[0].id, 'KH000001', 'Reads stable customer ID');
    assert(sent.at(-1).url.endsWith('?action=customers'), 'Customer GET routed correctly');
    var statement = {id: 'CN041120260001', customerId: 'KH000001', items: [{orderId: 'HD041120260001'}], total: 100, paid: 0, debt: 100, status: 'open'};
    responses.push({status: 'success'});
    await rejects(function () { return api.createDebtStatement({customerId: 'KH000001', requestId: 'create-key'}); }, 'No false confirmation without statement');
    responses.push({status: 'success', statement: statement});
    equal((await api.createDebtStatement({customerId: 'KH000001', requestId: 'create-key'})).statement.id, statement.id, 'Canonical statement returned');
    var body = JSON.parse(sent.at(-1).options.body);
    equal(body.action, 'createDebtStatement', 'Create uses correct action');
    equal(body.requestId, 'create-key', 'Create retry key retained');
    equal(body.customerId, 'KH000001', 'Create bound to customer ID');
    statement = Object.assign({}, statement, {paid: 40, debt: 60});
    responses.push({status: 'success', statement: statement, payment: {id: 'TT041120260001'}});
    var result = await api.payDebtStatement({statementId: statement.id, amount: 40, date: '2026-11-04', note: 'Chuyển khoản', requestId: 'payment-key'});
    equal(result.statement.debt, 60, 'Canonical remaining debt returned');
    equal(result.payment.id, 'TT041120260001', 'Payment acknowledgment retained');
    body = JSON.parse(sent.at(-1).options.body);
    equal(body.action, 'payDebtStatement', 'Payment uses correct action');
    equal(body.requestId, 'payment-key', 'Payment retry key retained');
    equal(body.amount, 40, 'Payment amount retained');
    equal(body.note, 'Chuyển khoản', 'Payment note retained');
    equal(sent.at(-1).options.headers['Content-Type'], 'text/plain;charset=utf-8', 'Apps Script content type preserved');
    responses.push({status: 'error', message: 'Số tiền vượt công nợ'});
    await rejects(function () { return api.payDebtStatement({statementId: statement.id, amount: 100}); }, 'Server overpayment rejection propagated');
    responses.push(new Error('Mất kết nối'));
    await rejects(function () { return api.payDebtStatement({statementId: statement.id, amount: 10}); }, 'Network failure never reports success');
    print('PASS: ' + checks + ' customer API checks (mock fetch)');
}
run().catch(function (error) { print('FAIL: ' + error.message + '\n' + error.stack); quit(1); });
