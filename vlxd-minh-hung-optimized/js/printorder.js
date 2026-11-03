(function (app) {
    'use strict';
    const {normalizeOrder, formatDate, formatMoney, escapeHtml: html} = app.Data;
    function print(raw, kind = 'sale') {
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
    app.Print = {print};
}(window.InvoiceApp));
