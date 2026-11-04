/* Giữ nguyên địa chỉ triển khai Google Apps Script hiện có. */
(function (app) {
    'use strict';
    const API_URL = 'https://script.google.com/macros/s/AKfycbwYeHWRayXXhfkJyjJOpyg8ag1DFKX_GqVDfjZvlCbIG2TNirKTg0N3vR1YVMAVDJXtoA/exec';

    async function request(query = '', options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await fetch(API_URL + query, {...options, signal: controller.signal, cache: 'no-store'});
            if (!response.ok) throw new Error('Không kết nối được nơi lưu hóa đơn. Vui lòng thử lại.');
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); } catch {
                if (options.method === 'POST' && /^(success|ok|đã lưu)(?:[.!\s]*)$/i.test(text.trim())) return {success: true};
                throw new Error(options.method === 'POST'
                    ? 'Chưa nhận được xác nhận từ nơi lưu hóa đơn. Vui lòng kiểm tra trước khi lưu lại.'
                    : 'Chưa đọc được dữ liệu hóa đơn. Vui lòng kiểm tra nơi lưu dữ liệu rồi bấm Làm mới.');
            }
            if (data === false || data == null || (data && (data.success === false || data.error || data.status === 'error'))) {
                throw new Error(data && typeof data.message === 'string' ? data.message :
                    'Nơi lưu hóa đơn báo lỗi. Vui lòng kiểm tra và thử lại.');
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error(options.method === 'POST'
                ? 'Kết nối quá lâu, chưa xác nhận được kết quả lưu. Vui lòng kiểm tra hóa đơn đã lưu chưa trước khi thử lại.'
                : 'Kết nối quá lâu. Vui lòng thử lại.');
            throw error;
        } finally { clearTimeout(timeout); }
    }

    async function list() {
        const data = await request('?action=list');
        const orders = Array.isArray(data) ? data : data && data.orders;
        if (!Array.isArray(orders)) {
            const error = new Error('Chưa lấy được lịch sử hóa đơn. Cần cập nhật chức năng đọc danh sách ở nơi lưu dữ liệu, sau đó bấm Làm mới.');
            error.code = 'HISTORY_UNAVAILABLE';
            throw error;
        }
        // Tương thích bản triển khai cũ còn trả dòng tiêu đề của Sheet như một hóa đơn.
        return orders.filter(order => !app.Data.isOrderHeader(order)).map(app.Data.normalizeOrder);
    }

    async function save(order) {
        const result = await request('', {
            method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(order)
        });
        // Nếu máy chủ cấp mã chính thức, dùng mã đó thay cho mã xem trước.
        const raw = result && (result.order || (result.data && result.data.id ? result.data : null));
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.id) return {...order, ...raw};
        if (result && result.id) return {...order, id: result.id};
        const acknowledged = result && (result.success === true ||
            /^(success|ok)$/i.test(String(result.status || result.result || '')));
        if (acknowledged || (typeof result === 'string' && /^(success|ok)$/i.test(result))) return order;
        throw new Error('Chưa xác nhận được kết quả lưu. Vui lòng kiểm tra hóa đơn đã được lưu chưa trước khi thử lại.');
    }

    async function nextId(orders) {
        let lastId = '';
        try { const data = await request(); lastId = String(data && data.lastId || ''); } catch { /* Dùng danh sách đã tải để xem trước. */ }
        const [year, month, day] = app.Data.todayKey().split('-');
        const prefix = `HD${day}${month}${year}`;
        const ids = [lastId, ...orders.map(order => order.id)];
        const sequence = ids.reduce((max, id) => {
            const suffix = String(id).startsWith(prefix) ? String(id).slice(prefix.length) : '';
            return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
        }, 0);
        return prefix + String(sequence + 1).padStart(4, '0');
    }

    async function inventory() {
        const deploymentMessage = 'Chức năng kho chưa được triển khai. Hãy cập nhật các file Apps Script và triển khai phiên bản mới, sau đó bấm Làm mới.';
        let data;
        try { data = await request('?action=inventory'); } catch (error) {
            if (/Yêu cầu không được hỗ trợ|Cần bổ sung file inventory\.gs/.test(error.message)) throw new Error(deploymentMessage);
            throw error;
        }
        if (!data || Number(data.schemaVersion) < 2 || !Number.isFinite(Number(data.schemaVersion)) ||
            !Array.isArray(data.products) || !Array.isArray(data.receipts) || !Array.isArray(data.stock)) {
            throw new Error(deploymentMessage);
        }
        return data;
    }

    async function createProduct(product) {
        const result = await request('', {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify({...product, action: 'createProduct'})});
        if (!result.product || !result.product.id || !result.product.baseUnit || !Array.isArray(result.product.units) || !result.product.units.length) {
            throw new Error('Chưa xác nhận được ĐVT và giá bán. Hãy cập nhật phiên bản Apps Script, sau đó làm mới và kiểm tra danh mục trước khi thử lại.');
        }
        return result.product;
    }

    async function receiveStock(receipt) {
        const result = await request('', {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify({...receipt, action: 'receiveStock'})});
        if (!result.receipt || !result.receipt.id || !Array.isArray(result.stock)) {
            throw new Error('Chưa nhận được xác nhận nhập kho. Hãy thử lại trong biểu mẫu này.');
        }
        return result;
    }

    async function customers() {
        const message = 'Chức năng khách hàng chưa được triển khai. Hãy cập nhật Apps Script rồi bấm Làm mới.';
        let data;
        try { data = await request('?action=customers'); } catch (error) {
            if (/Yêu cầu không được hỗ trợ|customers\.gs/.test(error.message)) throw new Error(message);
            throw error;
        }
        if (!data || data.schemaVersion !== 1 || !['customers', 'orders', 'statements', 'payments'].every(key => Array.isArray(data[key]))) throw new Error(message);
        return data;
    }

    async function debtAction(action, payload) {
        const result = await request('', {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify({...payload, action})});
        if (!result.statement || !result.statement.id || !Array.isArray(result.statement.items)) {
            throw new Error('Chưa nhận được xác nhận công nợ. Hãy làm mới và kiểm tra trước khi thử lại.');
        }
        return result;
    }

    app.API = {list, save, nextId, inventory, createProduct, receiveStock, customers,
        createDebtStatement: payload => debtAction('createDebtStatement', payload),
        payDebtStatement: payload => debtAction('payDebtStatement', payload)};
}(window.InvoiceApp));
