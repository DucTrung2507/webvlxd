/* Danh mục và nhập kho dùng cùng dữ liệu Google Sheet với hóa đơn bán. */
(function (app) {
    'use strict';
    const D = app.Data;
    const get = id => document.getElementById(id);
    const esc = D.escapeHtml;
    const quantity = value => Number(value || 0).toLocaleString('vi-VN', {maximumFractionDigits: 6});
    let state = {products: [], receipts: [], stock: [], lastReceiptId: ''};
    let loaded = false;
    let loadVersion = 0;
    let pending;
    let lastError;
    const forms = {
        product: {busy: false, ready: false, opening: 0},
        receipt: {busy: false, ready: false, opening: 0}
    };

    function status(message) {
        ['productStatus', 'inventoryStatus'].forEach(id => {
            get(id).textContent = message;
            get(id).hidden = !message;
        });
    }

    function productLabel(product) { return product.id + ' — ' + product.name; }
    function resolveProduct(value) {
        const text = String(value || '').trim().toLocaleLowerCase('vi');
        return state.products.find(product => [product.id, product.name, productLabel(product)]
            .some(label => String(label).trim().toLocaleLowerCase('vi') === text));
    }

    function render() {
        get('productCount').textContent = state.products.length + ' mặt hàng';
        get('receiptCount').textContent = state.receipts.length + ' hóa đơn nhập';
        get('stockCount').textContent = state.stock.length + ' mặt hàng';
        get('productOptions').innerHTML = state.products.map(product => `<option value="${esc(productLabel(product))}"></option>`).join('');
        get('productList').innerHTML = state.products.length ? state.products.map(product =>
            `<tr><td>${esc(product.id)}</td><td>${esc(product.name)}</td><td>${esc(product.type)}</td><td class="money">${D.formatMoney(product.price)}</td></tr>`).join('') :
            '<tr class="empty-row"><td colspan="4">Chưa có mặt hàng. Bấm Thêm mặt hàng để bắt đầu.</td></tr>';
        get('stockList').innerHTML = state.stock.length ? state.stock.map(item =>
            `<tr><td>${esc(item.productId)}</td><td>${esc(item.name)}</td><td class="money">${quantity(item.qty)}</td></tr>`).join('') :
            '<tr class="empty-row"><td colspan="3">Tạo mặt hàng, sau đó nhập kho để ghi nhận số lượng.</td></tr>';
        const receipts = D.sortOrders(state.receipts.map(receipt => ({...receipt, date: D.parseDate(receipt.date, receipt.id)})));
        get('receiptList').innerHTML = receipts.length ? receipts.map(receipt => {
            const detail = (receipt.items || []).map(item => `<li>${esc(item.name)}: ${quantity(item.qty)} ${esc(item.unit)} × ${D.formatMoney(item.price)}</li>`).join('');
            return `<tr><td><button type="button" class="text-button" data-print-receipt="${esc(receipt.id)}" aria-label="In hóa đơn ${esc(receipt.id)}">${esc(receipt.id)}</button></td>
                <td>${D.formatDate(receipt.date)}</td><td>${esc(receipt.supplier)}</td><td>${esc(receipt.address)}</td>
                <td><details><summary>${(receipt.items || []).length} mặt hàng</summary><ul>${detail}</ul></details></td>
                <td class="money">${D.formatMoney(receipt.total)}</td><td class="money">${D.formatMoney(receipt.paid)}</td><td class="money">${D.formatMoney(receipt.debt)}</td></tr>`;
        }).join('') : '<tr class="empty-row"><td colspan="8">Chưa có hóa đơn nhập. Bấm Nhập kho để tạo phiếu đầu tiên.</td></tr>';
    }

    function load(force = false) {
        if (pending && !force) return pending;
        const version = ++loadVersion;
        status('Đang tải danh mục và tồn kho…');
        pending = (async () => {
            try {
                const result = await app.API.inventory();
                if (version !== loadVersion) return null;
                state = result;
                loaded = true;
                lastError = null;
                render();
                status('');
                return state;
            } catch (error) {
                if (version !== loadVersion) return null;
                lastError = error;
                status(error.message + (loaded ? ' Đang hiển thị dữ liệu lần tải trước.' : ''));
                if (!loaded) {
                    [['productList', 4], ['receiptList', 8], ['stockList', 3]].forEach(([id, cols]) => {
                        get(id).innerHTML = `<tr class="empty-row"><td colspan="${cols}">Chưa tải được dữ liệu.</td></tr>`;
                    });
                    ['productCount', 'receiptCount', 'stockCount'].forEach(id => { get(id).textContent = 'Chưa tải được dữ liệu'; });
                }
                return null;
            } finally { if (version === loadVersion) pending = null; }
        })();
        return pending;
    }

    async function ensureLoaded() {
        if (pending) await pending;
        if (!loaded || lastError) await load();
        if (!loaded || lastError) throw lastError || new Error('Chưa tải được danh mục mặt hàng. Vui lòng thử lại.');
        return state;
    }

    function showView(view) {
        document.querySelectorAll('[data-page]').forEach(section => { section.hidden = section.getAttribute('data-page') !== view; });
        document.querySelectorAll('[data-view]').forEach(button => {
            const active = button.getAttribute('data-view') === view;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        });
        if (view !== 'sales') load();
    }

    function formError(kind, message, input) {
        get(kind + 'FormError').hidden = !message;
        get(kind + 'FormError').textContent = message;
        if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    }

    function setBusy(kind, value) {
        const form = get(kind + 'Form');
        forms[kind].busy = value;
        form.setAttribute('aria-busy', String(value));
        form.querySelectorAll('input, select, button').forEach(control => { control.disabled = value; });
        get(kind + 'Save').disabled = value || !forms[kind].ready;
        if (kind === 'receipt') get('receiptSaveAndPrint').disabled = value || !forms[kind].ready;
        get(kind + 'Save').textContent = value ? 'Đang lưu…' : (kind === 'product' ? 'Lưu mặt hàng' : 'Lưu nhập kho');
    }

    function close(kind) {
        if (forms[kind].busy) return;
        forms[kind].opening++;
        get(kind + 'Panel').close();
        if (forms[kind].focus) forms[kind].focus.focus();
    }

    async function open(kind) {
        if (get(kind + 'Panel').open) return;
        const formState = forms[kind];
        const opening = ++formState.opening;
        formState.focus = document.activeElement;
        formState.requestId = D.requestId();
        formState.date = D.todayKey();
        formState.ready = false;
        get(kind + 'Form').reset();
        get(kind + 'Form').querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        formError(kind, '');
        if (kind === 'receipt') {
            get('receiptId').textContent = 'Đang tạo mã…';
            get('receiptItems').replaceChildren();
            syncRows();
            totals();
        }
        setBusy(kind, false);
        get(kind + 'Panel').showModal();
        get(kind === 'product' ? 'productName' : 'receiptSupplier').focus();
        try {
            await ensureLoaded();
            if (opening !== formState.opening || !get(kind + 'Panel').open) return;
            if (kind === 'receipt') {
                if (!state.products.length) throw new Error('Chưa có mặt hàng. Đóng biểu mẫu và vào Mặt hàng → Thêm mặt hàng trước khi nhập kho.');
                rows().forEach(row => populateProducts(row.querySelector('.receipt-product')));
                get('receiptId').textContent = nextReceiptId();
            }
            formState.ready = true;
            setBusy(kind, false);
        } catch (error) {
            if (opening === formState.opening && get(kind + 'Panel').open) formError(kind, error.message);
        }
    }

    function nextReceiptId() {
        const [year, month, day] = D.todayKey().split('-');
        const prefix = `NK${day}${month}${year}`;
        const sequence = [state.lastReceiptId, ...state.receipts.map(receipt => receipt.id)].reduce((max, id) => {
            const suffix = String(id || '').startsWith(prefix) ? String(id).slice(prefix.length) : '';
            return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
        }, 0);
        return prefix + String(sequence + 1).padStart(4, '0');
    }

    function formatInput(input) {
        const digits = input.value.replace(/\D/g, '');
        input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
    }

    async function saveProduct(event) {
        event.preventDefault();
        if (forms.product.busy || !forms.product.ready) return;
        const product = {name: get('productName').value.trim(), type: get('productType').value.trim(),
            price: D.money(get('productPrice').value), requestId: forms.product.requestId};
        if (!product.name) return formError('product', 'Vui lòng nhập tên mặt hàng.', get('productName'));
        if (!product.type) return formError('product', 'Vui lòng nhập loại mặt hàng.', get('productType'));
        if (!Number.isFinite(product.price) || product.price <= 0) return formError('product', 'Giá phải lớn hơn 0.', get('productPrice'));
        setBusy('product', true);
        try {
            const saved = await app.API.createProduct(product);
            ++loadVersion; pending = null;
            state.products = [...state.products.filter(item => item.id !== saved.id), saved];
            if (!state.stock.some(item => item.productId === saved.id)) state.stock.push({productId: saved.id, name: saved.name, qty: 0});
            render();
            setBusy('product', false);
            close('product');
            app.notify('Đã tạo mặt hàng ' + saved.id + '.', 'success');
            load(true);
        } catch (error) { setBusy('product', false); formError('product', error.message); }
    }

    function rows() { return [...get('receiptItems').querySelectorAll('.receipt-item')]; }
    function populateProducts(select) {
        const value = select.value;
        select.innerHTML = '<option value="">Chọn mặt hàng…</option>' + state.products.map(product =>
            `<option value="${esc(product.id)}">${esc(productLabel(product))}</option>`).join('');
        select.value = value;
    }

    function addRow() {
        const row = document.createElement('div');
        row.className = 'receipt-item';
        row.innerHTML = `<div class="stt"></div><select class="receipt-product" aria-label="Mặt hàng"></select>
            <input class="receipt-qty" type="number" min="0.000001" step="0.000001" value="1" aria-label="Số lượng">
            <input class="receipt-unit" type="text" placeholder="bao, m³…" aria-label="Đơn vị tính">
            <input class="receipt-price" type="text" inputmode="numeric" placeholder="0" aria-label="Đơn giá nhập">
            <div class="receipt-subtotal">0 đ</div><button type="button" data-delete-receipt-item aria-label="Xóa mặt hàng">×</button>`;
        populateProducts(row.querySelector('.receipt-product'));
        get('receiptItems').appendChild(row);
    }

    function syncRows() {
        const current = rows();
        const empty = current.findIndex(row => !row.querySelector('.receipt-product').value);
        if (empty === -1) addRow(); else current.slice(empty + 1).forEach(row => row.remove());
        rows().forEach((row, index) => {
            row.querySelector('.stt').textContent = index + 1;
            [['.receipt-product', 'Mặt hàng'], ['.receipt-qty', 'Số lượng'], ['.receipt-unit', 'Đơn vị tính'], ['.receipt-price', 'Đơn giá nhập']].forEach(([selector, label]) => {
                row.querySelector(selector).setAttribute('aria-label', label + ', dòng ' + (index + 1));
            });
        });
    }

    function totals() {
        let total = 0;
        rows().forEach(row => {
            const qty = Number(row.querySelector('.receipt-qty').value);
            const subtotal = row.querySelector('.receipt-product').value && Number.isFinite(qty) && qty > 0 ?
                Math.round(qty * D.money(row.querySelector('.receipt-price').value)) : 0;
            row.querySelector('.receipt-subtotal').textContent = D.formatMoney(subtotal);
            total += subtotal;
        });
        get('receiptTotal').textContent = D.formatMoney(total);
        get('receiptDebt').textContent = D.formatMoney(total - D.money(get('receiptPaid').value));
        return total;
    }

    async function saveReceipt(event) {
        event.preventDefault();
        if (forms.receipt.busy || !forms.receipt.ready) return;
        const filled = rows().filter(row => row.querySelector('.receipt-product').value);
        const receipt = {requestId: forms.receipt.requestId, date: forms.receipt.date,
            supplier: get('receiptSupplier').value.trim(), address: get('receiptAddress').value.trim(),
            paid: D.money(get('receiptPaid').value), items: []};
        if (!receipt.supplier) return formError('receipt', 'Vui lòng nhập nhà cung cấp.', get('receiptSupplier'));
        if (!Number.isFinite(receipt.paid) || receipt.paid < 0) return formError('receipt', 'Số tiền đã trả không hợp lệ.', get('receiptPaid'));
        if (!filled.length) return formError('receipt', 'Chọn ít nhất một mặt hàng.', rows()[0].querySelector('.receipt-product'));
        for (const row of filled) {
            const item = {productId: row.querySelector('.receipt-product').value,
                qty: Number(row.querySelector('.receipt-qty').value), unit: row.querySelector('.receipt-unit').value.trim(),
                price: D.money(row.querySelector('.receipt-price').value)};
            if (!Number.isFinite(item.qty) || item.qty <= 0) return formError('receipt', 'Số lượng phải lớn hơn 0.', row.querySelector('.receipt-qty'));
            if (!Number.isFinite(item.price) || item.price <= 0) return formError('receipt', 'Đơn giá nhập phải lớn hơn 0.', row.querySelector('.receipt-price'));
            receipt.items.push(item);
        }
        const shouldPrint = event.submitter && event.submitter.value === 'print';
        setBusy('receipt', true);
        let result;
        try { result = await app.API.receiveStock(receipt); } catch (error) {
            setBusy('receipt', false); formError('receipt', error.message); return;
        }
        ++loadVersion; pending = null;
        state.receipts = [...state.receipts.filter(item => item.id !== result.receipt.id), result.receipt];
        state.stock = result.stock;
        state.lastReceiptId = result.receipt.id;
        render();
        setBusy('receipt', false);
        close('receipt');
        app.notify('Đã lưu ' + result.receipt.id + ' và cập nhật kho.', 'success');
        load(true);
        if (shouldPrint) printReceipt(result.receipt);
    }

    function printReceipt(receipt) {
        try { app.Print.print(receipt, 'receipt'); }
        catch { app.notify('Phiếu đã lưu nhưng chưa mở được cửa sổ in. Bấm mã phiếu để in lại.', 'error'); }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.getAttribute('data-view'))));
        ['product', 'receipt'].forEach(kind => {
            document.querySelectorAll('[data-open-' + kind + ']').forEach(button => button.addEventListener('click', () => open(kind)));
            document.querySelectorAll('[data-close-' + kind + ']').forEach(button => button.addEventListener('click', () => close(kind)));
            get(kind + 'Panel').addEventListener('cancel', event => { event.preventDefault(); close(kind); });
            get(kind + 'Form').addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
        });
        get('warehouseRefresh').addEventListener('click', () => load(true));
        get('productRefresh').addEventListener('click', () => load(true));
        get('productPrice').addEventListener('input', () => formatInput(get('productPrice')));
        get('productForm').addEventListener('submit', saveProduct);
        get('receiptForm').addEventListener('submit', saveReceipt);
        get('receiptItems').addEventListener('change', event => {
            if (!event.target.matches('.receipt-product')) return;
            const row = event.target.closest('.receipt-item');
            const product = resolveProduct(event.target.value);
            row.querySelector('.receipt-price').value = product ? D.money(product.price).toLocaleString('vi-VN') : '';
            syncRows(); totals();
        });
        get('receiptItems').addEventListener('input', event => {
            if (event.target.matches('.receipt-price')) formatInput(event.target);
            totals();
        });
        get('receiptItems').addEventListener('click', event => {
            const button = event.target.closest('[data-delete-receipt-item]');
            if (!button || forms.receipt.busy) return;
            const index = rows().indexOf(button.closest('.receipt-item'));
            button.closest('.receipt-item').remove();
            syncRows(); totals();
            rows()[Math.min(index, rows().length - 1)].querySelector('.receipt-product').focus();
        });
        get('receiptAddItem').addEventListener('click', () => { syncRows(); totals(); rows().at(-1).querySelector('.receipt-product').focus(); });
        get('receiptPaid').addEventListener('input', () => { formatInput(get('receiptPaid')); totals(); });
        get('receiptPayFull').addEventListener('click', () => { get('receiptPaid').value = totals().toLocaleString('vi-VN'); totals(); });
        get('receiptList').addEventListener('click', event => {
            const button = event.target.closest('[data-print-receipt]');
            if (!button) return;
            const receipt = state.receipts.find(item => item.id === button.getAttribute('data-print-receipt'));
            if (receipt) printReceipt(receipt);
        });
    });

    app.Inventory = {load, ensureLoaded, resolveProduct, showView, getProducts: () => state.products.slice()};
}(window.InvoiceApp));
