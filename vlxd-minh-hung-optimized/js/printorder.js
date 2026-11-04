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
        const fields = {d_id: statement.id, d_date: 'Ngày lập: ' + formatDate(parseDate(statement.date)),
            d_through: 'Cập nhật đến: ' + formatDate(parseDate(statement.throughDate)),
            d_customer: customer.name || statement.customerName || '', d_customerId: statement.customerId || customer.id || '',
            d_phone: customer.phone || '', d_address: customer.address || '',
            d_total: statementMoney(statement.total), d_paid: statementMoney(statement.paid), d_debt: statementMoney(statement.debt),
            d_status: statement.status === 'closed' ? 'ĐÃ TẤT TOÁN' : 'CHƯA TẤT TOÁN'};
        Object.entries(fields).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
        document.getElementById('d_table').innerHTML = statement.items.map((item, index) => `<tr>
            <td>${index + 1}</td><td>${html(item.orderId)}</td><td>${html(formatDate(parseDate(item.date)))}</td>
            <td>${html(statementMoney(item.total))}</td><td>${html(statementMoney(item.paid))}</td><td>${html(statementMoney(item.debt))}</td></tr>`).join('');
        document.getElementById('d_payments').innerHTML = (statement.payments || []).map(payment => `<tr>
            <td>${html(payment.id)}</td><td>${html(formatDate(parseDate(payment.date)))}</td>
            <td>${html(statementMoney(payment.amount))}</td><td>${html(payment.note || '')}</td></tr>`).join('') ||
            '<tr><td colspan="4">Chưa ghi nhận thanh toán.</td></tr>';
        document.body.classList.add('printing-debt');
        try { window.print(); }
        finally { document.body.classList.remove('printing-debt'); }
    }
    app.Print = {print, printStatement};
}(window.InvoiceApp));
