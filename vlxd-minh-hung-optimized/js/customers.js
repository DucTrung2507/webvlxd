/* Khách hàng, phiếu công nợ đang mở và các lần thu tiền. */
(function (app) {
    'use strict';
    const D = app.Data, esc = D.escapeHtml;
    const get = id => document.getElementById(id);
    const formatMoney = value => Number(D.money(value)).toLocaleString('vi-VN', {maximumFractionDigits: 2}) + ' đ';
    const key = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
    let state = {customers: [], orders: [], statements: [], payments: []};
    let loaded = false, lastError, pending, version = 0, selectedId = '', statementId = '';
    let creating = false, paying = false, paymentRequestId = '', paymentStatementId = '';
    let customerReturnFocus;
    const createKeys = new Map();

    function label(customer) {
        const code = customer.legacy ? 'Khách cũ' : customer.id;
        return `${code} — ${customer.name}${customer.phone ? ' · ' + customer.phone : customer.address ? ' · ' + customer.address : ''}`;
    }
    function resolveCustomer(value) {
        const matches = state.customers.filter(customer => [customer.id, label(customer), customer.name].some(text => key(text) === key(value)));
        return matches.length === 1 ? {...matches[0]} : undefined;
    }
    function ordersFor(id) { return state.orders.filter(order => order.customerId === id); }
    function debtFor(id) { return ordersFor(id).reduce((sum, order) => sum + Math.max(0, D.money(order.debt)), 0); }
    function badge(statement) { return `<span class="status-badge${statement.status === 'closed' ? ' closed' : ''}">${statement.status === 'closed' ? 'Đã tất toán' : 'Đang mở'}</span>`; }
    function empty(cols, text) { return `<tr class="empty-row"><td colspan="${cols}">${esc(text)}</td></tr>`; }
    function status(message) {
        ['customersStatus', 'customerDetailStatus'].forEach(id => {
            get(id).textContent = message;
            get(id).hidden = !message;
        });
    }

    function render() {
        get('customerOptions').innerHTML = state.customers.map(customer => `<option value="${esc(label(customer))}"></option>`).join('');
        get('customersCount').textContent = state.customers.length;
        get('customersOwing').textContent = state.customers.filter(customer => debtFor(customer.id) > 0).length;
        get('customersDebt').textContent = formatMoney(state.orders.reduce((sum, order) => sum + Math.max(0, D.money(order.debt)), 0));
        get('customersOpenStatements').textContent = state.statements.filter(statement => statement.status !== 'closed').length;
        const search = key(get('customerSearch').value);
        const customers = state.customers.filter(customer => !search || [customer.id, customer.name, customer.phone, customer.address].some(value => key(value).includes(search)));
        get('customerList').innerHTML = customers.length ? customers.map(customer => `<tr>
            <td>${esc(customer.legacy ? 'Chưa cấp mã' : customer.id)}</td><td>${esc(customer.name)}</td>
            <td>${esc(customer.phone || '—')}<small>${esc(customer.address || 'Chưa có địa chỉ')}</small></td>
            <td>${ordersFor(customer.id).length}</td><td class="money">${formatMoney(debtFor(customer.id))}</td>
            <td><button type="button" class="text-button" data-open-customer="${esc(customer.id)}">Xem công nợ</button></td></tr>`).join('') : empty(6, search ? 'Không tìm thấy khách hàng.' : 'Khách hàng được tự tạo khi lưu hóa đơn bán hàng đầu tiên.');
        renderDetail();
        if (statementId && get('debtStatementPanel').open) renderStatement();
    }

    function renderDetail() {
        const customer = state.customers.find(item => item.id === selectedId);
        get('customerDetail').hidden = !customer;
        if (!customer) {
            if (get('customerDetailPanel').open && !creating && !paying) closeCustomerDetail();
            return;
        }
        get('customerDetailTitle').textContent = customer.name;
        get('customerDetailCode').textContent = customer.legacy ? 'Khách từ hóa đơn cũ · Cấp mã khi lập phiếu' : customer.id;
        get('customerDetailContact').textContent = [customer.phone, customer.address].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ';
        const orders = D.sortOrders(ordersFor(customer.id));
        const statements = state.statements.filter(item => item.customerId === customer.id).slice().reverse();
        const statementByOrder = new Map();
        statements.forEach(statement => statement.items.forEach(item => statementByOrder.set(item.orderId, statement.id)));
        get('customerOrderCount').textContent = orders.length + ' đơn hàng · Còn nợ ' + formatMoney(debtFor(customer.id));
        get('customerStatementCount').textContent = statements.length + ' phiếu tổng';
        get('customerOrders').innerHTML = orders.length ? orders.map(order => `<tr><td>${esc(order.id)}</td><td>${D.formatDate(D.parseDate(order.date, order.id))}</td>
            <td class="money">${formatMoney(order.total)}</td><td class="money">${formatMoney(order.paid)}</td><td class="money">${formatMoney(order.debt)}</td><td>${esc(statementByOrder.get(order.id) || 'Chưa lập phiếu')}</td></tr>`).join('') : empty(6, 'Chưa có đơn hàng.');
        get('customerStatements').innerHTML = statements.length ? statements.map(statement => `<tr><td>${esc(statement.id)}</td><td>${D.formatDate(D.parseDate(statement.date, statement.id))}</td><td>${statement.items.length}</td>
            <td class="money">${formatMoney(statement.total)}</td><td class="money">${formatMoney(statement.paid)}</td><td class="money">${formatMoney(statement.debt)}</td><td>${badge(statement)}</td>
            <td><div class="table-actions"><button type="button" class="text-button" data-open-debt-statement="${esc(statement.id)}">Xem / In</button>${statement.status !== 'closed' ? `<button type="button" class="text-button" data-collect-debt="${esc(statement.id)}">Thu tiền</button>` : ''}</div></td></tr>`).join('') : empty(8, 'Chưa có phiếu tổng. Bấm Lập / In công nợ tổng để gộp các đơn còn nợ.');
        get('customerExportDebt').disabled = creating || debtFor(customer.id) <= 0;
        get('customerExportDebt').textContent = creating ? 'Đang lập phiếu…' : 'Lập / In công nợ tổng';
    }

    function openCustomerDetail(id) {
        if (!state.customers.some(customer => customer.id === id)) return;
        if (!get('customerDetailPanel').open) customerReturnFocus = document.activeElement;
        selectedId = id;
        renderDetail();
        if (!get('customerDetailPanel').open) get('customerDetailPanel').showModal();
    }

    function closeCustomerDetail() {
        if (creating || paying) return;
        if (get('customerPaymentPanel').open) get('customerPaymentPanel').close();
        if (get('debtStatementPanel').open) get('debtStatementPanel').close();
        get('customerDetailPanel').close();
        get('customerDetail').hidden = true;
        selectedId = '';
        statementId = '';
        if (customerReturnFocus && customerReturnFocus.isConnected !== false) customerReturnFocus.focus();
        else get('customerSearch').focus();
    }

    function renderStatement() {
        const statement = state.statements.find(item => item.id === statementId);
        if (!statement) return;
        const customer = statement.customer || state.customers.find(item => item.id === statement.customerId) || {};
        get('debtStatementTitle').textContent = statement.id;
        get('debtStatementMeta').textContent = 'Ngày mở: ' + D.formatDate(D.parseDate(statement.date, statement.id));
        get('debtStatementCustomer').textContent = [customer.id || statement.customerId, customer.name, customer.phone, customer.address].filter(Boolean).join(' · ');
        get('debtStatementStatus').textContent = statement.status === 'closed' ? 'Đã tất toán. Phiếu đã kết thúc, các đơn mới thuộc đợt tiếp theo.' : 'Đang mở. Đơn hàng mới còn nợ tiếp tục gộp vào phiếu này.';
        get('debtStatementItems').innerHTML = statement.items.map(item => `<tr><td>${esc(item.orderId)}</td><td>${D.formatDate(D.parseDate(item.date, item.orderId))}</td>
            <td class="money">${formatMoney(item.total)}</td><td class="money">${formatMoney(item.paid)}</td><td class="money">${formatMoney(item.debt)}</td></tr>`).join('');
        get('debtStatementTotal').textContent = formatMoney(statement.total);
        get('debtStatementPaid').textContent = formatMoney(statement.paid);
        get('debtStatementDebt').textContent = formatMoney(statement.debt);
        get('debtStatementCollect').disabled = statement.status === 'closed';
        get('debtStatementPayments').innerHTML = (statement.payments || []).length ? statement.payments.map(payment => `<tr><td>${esc(payment.id)}</td><td>${D.formatDate(D.parseDate(payment.date))}</td><td class="money">${formatMoney(payment.amount)}</td><td>${esc(payment.note)}</td></tr>`).join('') : empty(4, 'Chưa có lần thu tiền theo phiếu.');
    }

    function load(force = false) {
        if (pending && !force) return pending;
        const requestVersion = ++version;
        status('Đang tải khách hàng và công nợ…');
        pending = (async () => {
            try {
                const data = await app.API.customers();
                if (requestVersion !== version) return null;
                state = data; loaded = true; lastError = null;
                render(); status(''); return state;
            } catch (error) {
                if (requestVersion !== version) return null;
                lastError = error;
                status(error.message + (loaded ? ' Đang hiển thị dữ liệu lần tải trước.' : ''));
                if (!loaded) get('customerList').innerHTML = empty(6, 'Chưa tải được khách hàng. Bấm Làm mới để thử lại.');
                return null;
            } finally { if (requestVersion === version) pending = null; }
        })();
        return pending;
    }

    async function ensureLoaded() {
        if (pending) await pending;
        if (!loaded || lastError) await load();
        if (!loaded || lastError) throw lastError || new Error('Chưa tải được khách hàng.');
        return state;
    }

    function rememberStatement(statement, previousCustomerId = '') {
        const previous = state.statements.find(item => item.id === statement.id);
        function allocations(record) {
            const result = new Map();
            (record && record.payments || []).forEach(payment => (payment.allocations || []).forEach(item => {
                result.set(item.orderId, (result.get(item.orderId) || 0) + Math.round(Number(item.amount) * 100));
            }));
            return result;
        }
        const before = allocations(previous), after = allocations(statement);
        state.orders = state.orders.map(order => {
            const delta = (after.get(order.id) || 0) - (before.get(order.id) || 0);
            return delta ? {...order, paid: (Math.round(D.money(order.paid) * 100) + delta) / 100,
                debt: (Math.round(D.money(order.debt) * 100) - delta) / 100} : order;
        });
        if (previousCustomerId && previousCustomerId !== statement.customerId && statement.customer) {
            const old = state.customers.find(customer => customer.id === previousCustomerId);
            if (old && old.legacy) {
                state.customers = [...state.customers.filter(customer => customer.id !== old.id && customer.id !== statement.customerId), {...statement.customer, legacy: false}];
                state.orders = state.orders.map(order => order.customerId === old.id ? {...order, customerId: statement.customerId} : order);
            }
        }
        state.statements = [...state.statements.filter(item => item.id !== statement.id), statement];
        statementId = statement.id;
        selectedId = statement.customerId;
    }
    function showStatement(id) {
        statementId = id;
        renderStatement();
        if (!get('debtStatementPanel').open) get('debtStatementPanel').showModal();
    }
    function printStatement() {
        const statement = state.statements.find(item => item.id === statementId);
        if (!statement) return;
        try { app.Print.printStatement(statement); }
        catch { app.notify('Chưa mở được cửa sổ in. Phiếu đã được lưu, bạn có thể in lại.', 'error'); }
    }

    async function createStatement() {
        if (creating || !selectedId) return;
        const customerId = selectedId;
        if (!createKeys.has(customerId)) createKeys.set(customerId, D.requestId());
        creating = true; renderDetail();
        try {
            const result = await app.API.createDebtStatement({customerId, requestId: createKeys.get(customerId)});
            ++version; pending = null;
            rememberStatement(result.statement, customerId);
            createKeys.delete(customerId);
            await load(true);
            showStatement(result.statement.id);
            app.notify('Đã cập nhật phiếu công nợ tổng.', 'success');
            printStatement();
        } catch (error) { status(error.message); }
        finally { creating = false; renderDetail(); }
    }

    function paymentBusy(value) {
        paying = value;
        get('customerPaymentForm').setAttribute('aria-busy', String(value));
        get('customerPaymentForm').querySelectorAll('input, button').forEach(control => { control.disabled = value; });
        get('customerPaymentSave').textContent = value ? 'Đang ghi nhận…' : 'Lưu thu tiền';
    }
    function openPayment(id) {
        const statement = state.statements.find(item => item.id === id);
        if (!statement || statement.status === 'closed' || paying) return;
        paymentStatementId = id;
        paymentRequestId = D.requestId();
        get('customerPaymentForm').reset();
        get('customerPaymentDate').value = D.todayKey();
        get('customerPaymentInfo').textContent = id + ' · Còn nợ ' + formatMoney(statement.debt);
        get('customerPaymentError').hidden = true;
        paymentBusy(false);
        get('customerPaymentPanel').showModal();
        get('customerPaymentAmount').focus();
    }
    function closePayment() { if (!paying) get('customerPaymentPanel').close(); }
    async function savePayment(event) {
        event.preventDefault();
        if (paying || !paymentStatementId) return;
        const statement = state.statements.find(item => item.id === paymentStatementId);
        const raw = get('customerPaymentAmount').value.trim();
        const amount = D.money(raw), date = get('customerPaymentDate').value;
        const error = get('customerPaymentError');
        error.hidden = true;
        if (!/^[\d.,\s]+$/.test(raw) || !Number.isFinite(amount) || amount <= 0 || !statement || amount > D.money(statement.debt)) {
            error.textContent = 'Số tiền thu phải lớn hơn 0 và không vượt công nợ còn lại.'; error.hidden = false;
            get('customerPaymentAmount').focus(); return;
        }
        if (!date || D.parseDate(date) !== date) { error.textContent = 'Vui lòng nhập ngày thu hợp lệ.'; error.hidden = false; get('customerPaymentDate').focus(); return; }
        paymentBusy(true);
        try {
            const result = await app.API.payDebtStatement({statementId: paymentStatementId, amount, date,
                note: get('customerPaymentNote').value.trim(), requestId: paymentRequestId});
            ++version; pending = null;
            rememberStatement(result.statement);
            paymentBusy(false); closePayment(); render();
            app.notify(result.statement.status === 'closed' ? 'Đã thu đủ và tất toán phiếu công nợ.' : 'Đã ghi nhận thu tiền.', 'success');
            await load(true);
            if (app.List) app.List.load();
        } catch (caught) { paymentBusy(false); error.textContent = caught.message; error.hidden = false; }
    }

    document.addEventListener('DOMContentLoaded', () => {
        get('customersRefresh').addEventListener('click', () => load(true));
        get('customerSearch').addEventListener('input', render);
        get('customerList').addEventListener('click', event => {
            const button = event.target.closest('[data-open-customer]');
            if (!button) return;
            openCustomerDetail(button.getAttribute('data-open-customer'));
        });
        document.querySelectorAll('[data-close-customer-detail]').forEach(button => button.addEventListener('click', closeCustomerDetail));
        get('customerDetailPanel').addEventListener('cancel', event => { event.preventDefault(); closeCustomerDetail(); });
        get('customerExportDebt').addEventListener('click', createStatement);
        get('customerStatements').addEventListener('click', event => {
            const view = event.target.closest('[data-open-debt-statement]');
            const collect = event.target.closest('[data-collect-debt]');
            if (view) showStatement(view.getAttribute('data-open-debt-statement'));
            if (collect) openPayment(collect.getAttribute('data-collect-debt'));
        });
        document.querySelectorAll('[data-close-debt-statement]').forEach(button => button.addEventListener('click', () => get('debtStatementPanel').close()));
        document.querySelectorAll('[data-close-customer-payment]').forEach(button => button.addEventListener('click', closePayment));
        get('customerPaymentPanel').addEventListener('cancel', event => { if (paying) event.preventDefault(); });
        get('debtStatementPrint').addEventListener('click', printStatement);
        get('debtStatementCollect').addEventListener('click', () => openPayment(statementId));
        get('customerPaymentFull').addEventListener('click', () => {
            const statement = state.statements.find(item => item.id === paymentStatementId);
            if (statement) get('customerPaymentAmount').value = Number(statement.debt).toLocaleString('vi-VN', {maximumFractionDigits: 2});
        });
        get('customerPaymentForm').addEventListener('submit', savePayment);
    });
    app.Customers = {load, ensureLoaded, resolveCustomer, getCustomers: () => state.customers.map(customer => ({...customer}))};
}(window.InvoiceApp));
