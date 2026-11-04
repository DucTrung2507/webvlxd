(function (app) {
    'use strict';
    const {formatMoney, formatDate, filterOrders, sortOrders, normalizeOrder, escapeHtml: html} = app.Data;
    const state = {orders: [], pending: new Map(), from: '', to: '', search: '', complete: false, error: '', request: 0};
    const get = id => document.getElementById(id);
    const searchKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi').trim();
    function matchesSearch(order) {
        const text = searchKey(state.search);
        return !text || searchKey([order.id, order.customer, order.customerId, order.phone, order.address, order.shipper,
            order.itemText, ...order.items.map(item => item.name)].join(' ')).includes(text);
    }

    function allOrders() {
        const ids = new Set(state.orders.filter(order => order.id).map(order => order.id));
        return sortOrders([...state.orders, ...[...state.pending.values()].filter(order => !ids.has(order.id))]);
    }

    function renderItems(order) {
        if (!order.items.length) return html(order.itemText || '—');
        return `<details><summary>${order.items.length} mặt hàng</summary><ul class="order-items">${order.items.map(item =>
            `<li><strong>${html(item.name)}</strong><br>SL: ${html(item.qty)}${item.unit ? ' ' + html(item.unit) : ''} × ${html(formatMoney(item.price))}<br>Thành tiền: ${html(formatMoney(item.subtotal))}</li>`
        ).join('')}</ul></details>`;
    }

    function render() {
        const all = allOrders();
        const visible = filterOrders(all, state.from, state.to).filter(matchesSearch);
        const filtered = state.from || state.to || state.search;
        const unknown = all.filter(order => !order.date).length;
        get('statsCount').textContent = visible.length.toLocaleString('vi-VN');
        ['total', 'paid', 'debt'].forEach(field => {
            const target = 'stats' + field[0].toUpperCase() + field.slice(1);
            get(target).textContent = formatMoney(visible.reduce((sum, order) => sum + order[field], 0));
        });
        let count = `Hiển thị ${visible.length} / ${all.length} hóa đơn`;
        if (state.from || state.to) count += ` · ${state.from ? formatDate(state.from) : 'Từ trước'} — ${state.to ? formatDate(state.to) : 'Đến nay'}`;
        if (state.search) count += ' · Tìm: ' + state.search;
        if (unknown) count += ` · ${unknown} hóa đơn chưa rõ ngày${state.from || state.to ? ' không nằm trong kết quả lọc ngày' : ''}`;
        if (!state.complete) count += ' · Lịch sử chưa tải đầy đủ';
        get('resultCount').textContent = count;
        get('listStatus').hidden = !state.error;
        get('listStatus').textContent = state.error;
        const emptyMessage = !state.complete && !all.length ? 'Chưa tải được hóa đơn. Bấm Làm mới để thử lại.' :
            filtered ? 'Không có hóa đơn phù hợp với tìm kiếm và bộ lọc.' : 'Chưa có hóa đơn nào.';
        get('orderList').innerHTML = visible.length ? visible.map(order => `<tr>
            <td>${order.id ? `<button type="button" class="text-button" data-open-sale="${html(order.id)}">${html(order.id)}</button>` : 'Chưa có mã'}</td><td>${html(formatDate(order.date))}</td>
            <td>${html(order.customer || '—')}</td><td>${html(order.address || '—')}</td>
            <td>${renderItems(order)}</td><td class="money">${html(formatMoney(order.total))}</td>
            <td class="money">${html(formatMoney(order.paid))}</td><td class="money text-debt">${html(formatMoney(order.debt))}</td>
            <td>${html(order.shipper || '—')}</td></tr>`).join('') :
            `<tr class="empty-row"><td colspan="9">${html(emptyMessage)}</td></tr>`;
    }

    async function load() {
        const request = ++state.request;
        get('refreshOrders').disabled = true;
        get('refreshOrders').textContent = 'Đang tải…';
        get('orderList').setAttribute('aria-busy', 'true');
        if (!allOrders().length) get('resultCount').textContent = 'Đang tải toàn bộ hóa đơn…';
        try {
            const orders = await app.API.list();
            if (request !== state.request) return;
            state.orders = orders;
            orders.forEach(order => state.pending.delete(order.id));
            state.complete = true;
            state.error = '';
        } catch (error) {
            if (request !== state.request) return;
            state.error = error.message || 'Không tải được hóa đơn. Kiểm tra kết nối và bấm Làm mới.';
            if (allOrders().length) state.error += ' Danh sách đang hiển thị được giữ lại và có thể chưa cập nhật.';
        } finally {
            if (request === state.request) {
                get('refreshOrders').disabled = false;
                get('refreshOrders').textContent = 'Làm mới';
                get('orderList').setAttribute('aria-busy', 'false');
                render();
            }
        }
    }

    function remember(raw) {
        const order = normalizeOrder(raw);
        state.pending.set(order.id, order);
        // Đơn vừa lưu được ưu tiên cho tới lần tải lại thành công.
        state.orders = state.orders.filter(existing => existing.id !== order.id);
        render();
        if (filterOrders([order], state.from, state.to).length === 0) {
            app.notify('Đã lưu hóa đơn. Chọn Xem tất cả để xem đơn ngoài khoảng ngày đang lọc.', 'success');
        }
    }

    function init() {
        get('filterForm').addEventListener('submit', event => {
            event.preventDefault();
            const from = get('fromDate').value;
            const to = get('toDate').value;
            const error = get('filterError');
            if (from && to && from > to) {
                error.textContent = 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
                error.hidden = false;
                get('toDate').setAttribute('aria-invalid', 'true');
                get('toDate').focus();
                return;
            }
            error.hidden = true;
            get('toDate').removeAttribute('aria-invalid');
            state.from = from;
            state.to = to;
            render();
        });
        get('resetFilters').addEventListener('click', () => {
            get('filterForm').reset();
            get('filterError').hidden = true;
            get('toDate').removeAttribute('aria-invalid');
            state.from = state.to = '';
            state.search = '';
            get('orderSearch').value = '';
            render();
        });
        get('orderSearch').addEventListener('input', () => { state.search = get('orderSearch').value.trim(); render(); });
        get('orderList').addEventListener('click', event => {
            const button = event.target.closest('[data-open-sale]');
            if (button && app.Order) app.Order.openExisting(button.getAttribute('data-open-sale'));
        });
        get('refreshOrders').addEventListener('click', load);
        load();
    }

    app.List = {init, load, remember, getOrders: allOrders};
}(window.InvoiceApp));
