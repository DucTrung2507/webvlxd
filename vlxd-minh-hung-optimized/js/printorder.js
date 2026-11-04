(function (app) {
    'use strict';
    const {normalizeOrder, parseDate, formatDate, formatMoney, money, escapeHtml: html} = app.Data;
    const statementMoney = value => money(value).toLocaleString('vi-VN', {maximumFractionDigits: 2}) + ' đ';
    function print(raw, kind = 'sale') {
        if (document.body) document.body.classList.remove('printing-debt');
        const receipt = kind === 'receipt';
        const supplier = receipt ? String(raw.supplier ?? raw.customer ?? '') : '';
        const order = normalizeOrder(receipt ? {...raw, customer: supplier, shipper: supplier} : raw);
        const fields = {p_id: order.id, p_date: 'Ngày ' + formatDate(order.date), p_name: order.customer,
            p_address: order.address, p_total: formatMoney(order.total), p_paid: formatMoney(order.paid),
            p_debt: formatMoney(order.debt), p_shipper: order.shipper,
            p_title: receipt ? 'PHIẾU NHẬP KHO' : 'HÓA ĐƠN BÁN HÀNG',
            p_partyLabel: receipt ? 'NHÀ CUNG CẤP:' : 'TÊN KHÁCH HÀNG:',
            p_paidLabel: receipt ? 'ĐÃ THANH TOÁN' : 'KHÁCH TRẢ',
            p_footerLabel: receipt ? 'NHÀ CUNG CẤP' : 'NGƯỜI GIAO HÀNG'};
        Object.entries(fields).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
        document.getElementById('p_table').innerHTML = order.items.map((item, index) => `<tr>
            <td>${index + 1}</td><td>${html(item.name)}</td><td>${html(item.unit || '—')}</td><td>${html(item.qty)}</td>
            <td>${html(formatMoney(item.price))}</td><td>${html(formatMoney(item.subtotal))}</td></tr>`).join('');
        window.print();
    }

    function printStatement(statement) {
        if (!statement || !statement.id || !Array.isArray(statement.items)) throw new Error('Chưa có phiếu công nợ tổng hợp lệ để in.');
        const customer = statement.customer && typeof statement.customer === 'object' ? statement.customer : {};
        const total = statement.items.reduce((sum, item) => sum + money(item.total), 0);
        const paid = statement.items.reduce((sum, item) => sum + money(item.paid), money(statement.paid));
        const fields = {d_id: statement.id, d_date: 'Ngày lập: ' + formatDate(parseDate(statement.date)),
            d_through: 'Cập nhật đến: ' + formatDate(parseDate(statement.throughDate)),
            d_customer: customer.name || statement.customerName || '',
            d_phone: customer.phone || '', d_address: customer.address || '',
            d_total: statementMoney(total), d_paid: statementMoney(paid), d_debt: statementMoney(statement.debt)};
        Object.entries(fields).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field) field.textContent = value;
        });
        const groups = new Map();
        statement.items.forEach(item => {
            const date = parseDate(item.date, item.orderId);
            if (!groups.has(date)) groups.set(date, []);
            const goods = Array.isArray(item.goods) && item.goods.length ? item.goods : [{
                name: `Hóa đơn ${item.orderId} (chưa có chi tiết hàng)`, qty: null, unit: '', price: null, subtotal: item.total
            }];
            goods.forEach(good => groups.get(date).push(good));
        });
        const quantity = value => value == null ? '—' : Number.isFinite(Number(value))
            ? Number(value).toLocaleString('vi-VN', {maximumFractionDigits: 6}) : String(value);
        document.getElementById('d_table').innerHTML = [...groups.entries()].sort(([a], [b]) =>
            a && b ? a.localeCompare(b) : a ? -1 : b ? 1 : 0).map(([date, goods]) => goods.map((good, index) => `<tr>
            ${index === 0 ? `<td rowspan="${goods.length}" class="debt-date">${html(formatDate(date))}</td>` : ''}
            <td>${html(good.name)}</td><td>${html(quantity(good.qty))}</td><td>${html(good.unit || '—')}</td>
            <td>${good.price == null ? '—' : html(statementMoney(good.price))}</td><td>${html(statementMoney(good.subtotal))}</td></tr>`).join('')).join('');
        document.body.classList.add('printing-debt');
        try { window.print(); }
        finally { document.body.classList.remove('printing-debt'); }
    }
    app.Print = {print, printStatement};
}(window.InvoiceApp));
