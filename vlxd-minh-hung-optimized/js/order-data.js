/* Chuẩn hóa dữ liệu cũ và mới; các phép so sánh ngày dùng YYYY-MM-DD. */
window.InvoiceApp = window.InvoiceApp || {};
(function (app) {
    'use strict';
    const currency = new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 0});
    const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    });

    function money(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        const text = String(value ?? '').trim();
        let digits = text.replace(/[^\d.,]/g, '');
        const decimal = digits.match(/[.,](\d{1,2})$/);
        if (decimal) {
            const point = digits.length - decimal[0].length;
            digits = digits.slice(0, point).replace(/[.,]/g, '') + '.' + decimal[1];
        } else { digits = digits.replace(/[.,]/g, ''); }
        return digits ? Number(digits) * (text.startsWith('-') ? -1 : 1) : 0;
    }

    function formatMoney(value) { return currency.format(money(value)) + ' đ'; }

    function dateKey(year, month, day) {
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
            date.getUTCDate() !== Number(day)) return '';
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function todayKey() {
        const parts = localDate.formatToParts(new Date());
        const get = type => parts.find(part => part.type === type).value;
        return `${get('year')}-${get('month')}-${get('day')}`;
    }

    function parseDate(value, id = '') {
        const text = String(value ?? '').trim();
        let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
        if (match && dateKey(match[1], match[2], match[3])) {
            if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
                const date = new Date(text);
                if (!Number.isNaN(date.getTime())) {
                    const parts = localDate.formatToParts(date);
                    const get = type => parts.find(part => part.type === type).value;
                    return dateKey(get('year'), get('month'), get('day'));
                }
            }
            const key = dateKey(match[1], match[2], match[3]);
            if (key) return key;
        }
        match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);
        if (match) {
            const key = dateKey(match[3], match[2], match[1]);
            if (key) return key;
        }
        match = String(id).match(/^(?:HD|NK)(\d{2})(\d{2})(\d{4})\d+$/i);
        return match ? dateKey(match[3], match[2], match[1]) : '';
    }

    function formatDate(key) { return key ? key.split('-').reverse().join('/') : 'Chưa rõ ngày'; }

    function isOrderHeader(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
        const key = value => String(value ?? '').trim().toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[\s_]+/g, '');
        return ['id', 'mahd', 'sohd', 'mahoadon', 'sohoadon', 'madon', 'madonhang'].includes(key(raw.id)) &&
            ['date', 'ngay', 'ngaytao', 'ngaylap'].includes(key(raw.date));
    }

    function normalizeOrder(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Dữ liệu hóa đơn không hợp lệ.');
        let items = raw.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch { /* Giữ nội dung mặt hàng của đơn cũ. */ }
        }
        const itemText = typeof items === 'string' ? items : '';
        items = Array.isArray(items) ? items.filter(item => item && typeof item === 'object').map(item => {
            const qty = Number(String(item.qty ?? 0).replace(',', '.')) || 0;
            const price = money(item.price);
            return {productId: String(item.productId ?? ''), name: String(item.name ?? ''), qty, unit: String(item.unit ?? ''), price,
                subtotal: item.subtotal == null || item.subtotal === '' ? Math.round(qty * price) : money(item.subtotal)};
        }) : [];
        const total = raw.total == null || raw.total === '' ? items.reduce((sum, item) => sum + item.subtotal, 0) : money(raw.total);
        const paid = money(raw.paid);
        return {
            id: String(raw.id ?? '').trim(), date: parseDate(raw.date, raw.id),
            customer: String(raw.customer ?? ''), address: String(raw.address ?? ''),
            shipper: String(raw.shipper ?? ''), items, itemText, total, paid,
            debt: raw.debt == null || raw.debt === '' ? total - paid : money(raw.debt)
        };
    }

    function filterOrders(orders, from = '', to = '') {
        if (from && to && from > to) throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        return orders.filter(order => (!from && !to) || (order.date && (!from || order.date >= from) && (!to || order.date <= to)));
    }

    function sortOrders(orders) {
        return [...orders].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, 'vi', {numeric: true}));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
    }

    function requestId() {
        return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
            'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }

    app.Data = {money, formatMoney, todayKey, parseDate, formatDate, isOrderHeader, normalizeOrder, filterOrders, sortOrders, escapeHtml, requestId};
}(window.InvoiceApp));
