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
    const key = value => String(value || '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('vi');
    function complete(product) {
        return product.status !== 'pending' && !!product.type && !!product.baseUnit && Array.isArray(product.units) &&
            product.units.length > 0 && product.units.every(unit => unit.unit && Number(unit.price) > 0 && Number(unit.factor) > 0);
    }
    function findProduct(value) {
        return state.products.find(product => [product.id, product.name, productLabel(product)].some(label => key(label) === key(value)));
    }
    function resolveProduct(value) {
        const product = findProduct(value);
        return product && complete(product) ? product : undefined;
    }
    function unitPrices(product) {
        return '<ul class="unit-prices">' + (product.units || []).map(unit =>
            `<li>${esc(unit.unit)}: <strong>${D.formatMoney(unit.price)}</strong><br><small>1 ${esc(unit.unit)} = ${quantity(unit.factor)} ${esc(product.baseUnit)}</small></li>`).join('') + '</ul>';
    }

    function render() {
        const products = state.products.filter(complete);
        const incomplete = state.products.filter(product => !complete(product));
        get('productCount').textContent = products.length + ' mặt hàng đã hoàn thiện';
        get('receiptCount').textContent = state.receipts.length + ' hóa đơn nhập';
        get('stockCount').textContent = new Set(state.stock.map(item => item.productId)).size + ' mặt hàng';
        get('pendingCount').textContent = incomplete.length + ' mặt hàng cần bổ sung';
        get('productOptions').innerHTML = products.map(product => `<option value="${esc(productLabel(product))}"></option>`).join('');
        get('receiptProductOptions').innerHTML = state.products.map(product => `<option value="${esc(productLabel(product))}"></option>`).join('');
        get('productList').innerHTML = products.length ? products.map(product =>
            `<tr><td>${esc(product.id)}</td><td>${esc(product.name)}</td><td>${esc(product.type)}</td><td>${unitPrices(product)}</td><td><button type="button" class="text-button" data-edit-product="${esc(product.id)}">Cập nhật</button></td></tr>`).join('') :
            '<tr class="empty-row"><td colspan="5">Chưa có mặt hàng hoàn thiện. Thêm mặt hàng hoặc bổ sung thông tin tại Kho.</td></tr>';
        get('pendingProducts').innerHTML = incomplete.length ? incomplete.map(product =>
            `<div class="pending-product" role="listitem"><div><strong>${esc(product.name)}</strong><small>${esc(product.id)} · Chưa được bán</small></div><button type="button" class="secondary" data-edit-product="${esc(product.id)}">Hoàn thiện</button></div>`).join('') :
            '<p class="pending-empty">Không có mặt hàng chờ hoàn thiện.</p>';
        get('stockList').innerHTML = state.stock.length ? state.stock.map(item =>
            `<tr><td>${esc(item.productId)}</td><td>${esc(item.name)}</td><td>${esc(item.unit || 'Chưa có ĐVT')}</td><td class="money">${quantity(item.qty)}</td></tr>`).join('') :
            '<tr class="empty-row"><td colspan="4">Nhập kho để ghi nhận hàng hóa và số lượng.</td></tr>';
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
                    [['productList', 5], ['receiptList', 8], ['stockList', 4]].forEach(([id, cols]) => {
                        get(id).innerHTML = `<tr class="empty-row"><td colspan="${cols}">Chưa tải được dữ liệu.</td></tr>`;
                    });
                    ['productCount', 'receiptCount', 'stockCount'].forEach(id => { get(id).textContent = 'Chưa tải được dữ liệu'; });
                    get('pendingCount').textContent = 'Chưa tải được dữ liệu';
                    get('pendingProducts').textContent = 'Chưa tải được mặt hàng cần hoàn thiện.';
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
        if (kind === 'product' && !value) syncProductUnits();
    }

    function close(kind) {
        if (forms[kind].busy) return;
        forms[kind].opening++;
        get(kind + 'Panel').close();
        if (forms[kind].focus) forms[kind].focus.focus();
    }

    async function open(kind, productId = '') {
        if (get(kind + 'Panel').open) return;
        const formState = forms[kind];
        const opening = ++formState.opening;
        formState.focus = document.activeElement;
        formState.requestId = D.requestId();
        formState.date = D.todayKey();
        formState.ready = false;
        formState.productId = productId;
        get(kind + 'Form').reset();
        get(kind + 'Form').querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        formError(kind, '');
        if (kind === 'product') {
            get('productBaseUnit').setAttribute('data-previous-base', '');
            get('productTitle').textContent = productId ? 'Cập nhật mặt hàng' : 'Thêm mặt hàng';
            get('productCode').textContent = productId ? 'Mã hàng: ' + productId : 'Mã hàng được cấp khi lưu.';
            get('productUnits').replaceChildren();
            get('legacyUnitGroup').hidden = true;
            addProductUnit();
        } else {
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
            if (kind === 'product' && productId) {
                const product = state.products.find(item => item.id === productId);
                if (!product) throw new Error('Mặt hàng không còn trong danh mục. Hãy đóng và làm mới.');
                get('productName').value = product.name;
                get('productType').value = product.type || '';
                get('productBaseUnit').value = product.baseUnit || '';
                get('productBaseUnit').setAttribute('data-previous-base', product.baseUnit || '');
                get('productUnits').replaceChildren();
                const units = (product.units || []).map(unit => ({...unit}));
                const received = [...(product.receivedUnits || []), ...state.stock.filter(item => item.productId === productId).map(item => item.unit || '')];
                [...new Set(received.filter(Boolean))].forEach(unit => {
                    if (!units.some(item => key(item.unit) === key(unit))) units.push({unit, price: product.price || '', factor: ''});
                });
                if (!units.length) units.push({unit: '', price: product.price || '', factor: 1});
                units.forEach(addProductUnit);
                const blankHistory = product.requiresLegacyUnit || state.stock.some(item => item.productId === productId && !item.unit && item.qty !== 0) ||
                    state.receipts.some(receipt => (receipt.items || []).some(item => item.productId === productId && !item.unit));
                get('legacyUnitGroup').hidden = !blankHistory;
                syncProductUnits();
                get('productLegacyUnit').value = product.legacyUnit || '';
            } else if (kind === 'receipt') {
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

    function productUnitRows() { return [...get('productUnits').querySelectorAll('.product-unit-row')]; }
    function addProductUnit(unit = {}) {
        const row = document.createElement('div');
        row.className = 'product-unit-row';
        row.innerHTML = `<label>Đơn vị tính<input class="product-unit" type="text" placeholder="bao, kg…" required></label>
            <label>Giá bán<input class="product-unit-price" type="text" inputmode="numeric" placeholder="Giá lớn hơn 0" required></label>
            <label>Cách quy đổi<select class="product-unit-method"><option value="multiply">Nhân ĐVT gốc</option><option value="divide">Chia ĐVT gốc</option></select></label>
            <label>Hệ số<input class="product-unit-factor" type="number" min="0" step="any" placeholder="Ví dụ: 50" required></label>
            <button type="button" data-delete-product-unit aria-label="Xóa đơn vị tính">×</button>`;
        row.querySelector('.product-unit').value = unit.unit || '';
        row.querySelector('.product-unit-price').value = unit.price ? Number(unit.price).toLocaleString('vi-VN') : '';
        row.querySelector('.product-unit-method').value = 'multiply';
        row.querySelector('.product-unit-factor').value = unit.factor === undefined ? '' : unit.factor;
        get('productUnits').appendChild(row);
        syncProductUnits();
    }

    function syncProductUnits() {
        const base = get('productBaseUnit').value.trim();
        const first = productUnitRows()[0];
        if (base && first && !first.querySelector('.product-unit').value.trim()) first.querySelector('.product-unit').value = base;
        productUnitRows().forEach(row => {
            const isBase = !!base && key(row.querySelector('.product-unit').value) === key(base);
            row.querySelector('.product-unit-factor').readOnly = isBase;
            row.querySelector('.product-unit-method').disabled = forms.product.busy || isBase;
            if (isBase) {
                row.querySelector('.product-unit-factor').value = '1';
                row.querySelector('.product-unit-method').value = 'multiply';
            }
        });
        const select = get('productLegacyUnit');
        const previous = select.value;
        const names = productUnitRows().map(row => row.querySelector('.product-unit').value.trim()).filter(Boolean);
        select.innerHTML = '<option value="">Chọn đơn vị…</option>' + names.map(unit => `<option value="${esc(unit)}">${esc(unit)}</option>`).join('');
        select.value = names.includes(previous) ? previous : names.length === 1 ? names[0] : '';
    }

    async function saveProduct(event) {
        event.preventDefault();
        if (forms.product.busy || !forms.product.ready) return;
        const product = {name: get('productName').value.trim(), type: get('productType').value.trim(),
            baseUnit: get('productBaseUnit').value.trim(), productId: forms.product.productId,
            units: [], requestId: forms.product.requestId};
        if (!product.name) return formError('product', 'Vui lòng nhập tên mặt hàng.', get('productName'));
        if (!product.type) return formError('product', 'Vui lòng nhập loại mặt hàng.', get('productType'));
        if (!product.baseUnit) return formError('product', 'Vui lòng nhập đơn vị tính gốc.', get('productBaseUnit'));
        const seen = new Set();
        for (const row of productUnitRows()) {
            const input = row.querySelector('.product-unit');
            const unit = input.value.trim();
            const price = D.money(row.querySelector('.product-unit-price').value);
            const amount = Number(String(row.querySelector('.product-unit-factor').value).replace(',', '.'));
            const factor = row.querySelector('.product-unit-method').value === 'divide' ? 1 / amount : amount;
            if (!unit || seen.has(key(unit))) return formError('product', 'ĐVT phải được điền và không trùng nhau.', input);
            if (!Number.isFinite(price) || price <= 0) return formError('product', 'Giá phải lớn hơn 0.', row.querySelector('.product-unit-price'));
            if (!Number.isFinite(factor) || factor <= 0) return formError('product', 'Hệ số quy đổi phải lớn hơn 0.', row.querySelector('.product-unit-factor'));
            seen.add(key(unit));
            product.units.push({unit, price, factor});
        }
        if (!seen.has(key(product.baseUnit))) return formError('product', 'Thêm ĐVT gốc vào bảng đơn vị tính và nhập giá bán.', get('productBaseUnit'));
        product.price = product.units.find(unit => key(unit.unit) === key(product.baseUnit)).price;
        if (!get('legacyUnitGroup').hidden) {
            product.legacyUnit = get('productLegacyUnit').value;
            if (!product.legacyUnit) return formError('product', 'Chọn ĐVT cho tồn kho cũ chưa ghi đơn vị.', get('productLegacyUnit'));
        }
        setBusy('product', true);
        try {
            const saved = await app.API.createProduct(product);
            ++loadVersion; pending = null;
            state.products = [...state.products.filter(item => item.id !== saved.id), saved];
            render();
            setBusy('product', false);
            close('product');
            app.notify('Đã lưu mặt hàng ' + saved.id + '.', 'success');
            load(true);
        } catch (error) { setBusy('product', false); formError('product', error.message); }
    }

    function rows() { return [...get('receiptItems').querySelectorAll('.receipt-item')]; }
    function addRow() {
        const row = document.createElement('div');
        row.className = 'receipt-item';
        row.innerHTML = `<div class="stt"></div><input class="receipt-product" type="text" list="receiptProductOptions" placeholder="Chọn hàng hoặc nhập tên mới" autocomplete="off" aria-label="Mặt hàng">
            <input class="receipt-qty" type="number" min="0" step="1" value="1" aria-label="Số lượng">
            <input class="receipt-unit" type="text" placeholder="bao, m³…" aria-label="Đơn vị tính" required>
            <input class="receipt-price" type="text" inputmode="numeric" placeholder="0" aria-label="Đơn giá nhập">
            <div class="receipt-subtotal">0 đ</div><button type="button" data-delete-receipt-item aria-label="Xóa mặt hàng">×</button>`;
        get('receiptItems').appendChild(row);
    }

    function syncRows() {
        const current = rows();
        const empty = current.findIndex(row => !row.querySelector('.receipt-product').value.trim());
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
        const filled = rows().filter(row => row.querySelector('.receipt-product').value.trim());
        const receipt = {requestId: forms.receipt.requestId, date: forms.receipt.date,
            supplier: get('receiptSupplier').value.trim(), address: get('receiptAddress').value.trim(),
            paid: D.money(get('receiptPaid').value), items: []};
        if (!receipt.supplier) return formError('receipt', 'Vui lòng nhập nhà cung cấp.', get('receiptSupplier'));
        if (!Number.isFinite(receipt.paid) || receipt.paid < 0) return formError('receipt', 'Số tiền đã trả không hợp lệ.', get('receiptPaid'));
        if (!filled.length) return formError('receipt', 'Chọn hoặc nhập ít nhất một mặt hàng.', rows()[0].querySelector('.receipt-product'));
        for (const row of filled) {
            const product = findProduct(row.querySelector('.receipt-product').value);
            const item = {productId: product ? product.id : '', name: product ? product.name : row.querySelector('.receipt-product').value.trim(),
                qty: Number(row.querySelector('.receipt-qty').value), unit: row.querySelector('.receipt-unit').value.trim(),
                price: D.money(row.querySelector('.receipt-price').value)};
            if (!Number.isFinite(item.qty) || item.qty <= 0) return formError('receipt', 'Số lượng phải lớn hơn 0.', row.querySelector('.receipt-qty'));
            if (!item.unit) return formError('receipt', 'Vui lòng nhập đơn vị tính.', row.querySelector('.receipt-unit'));
            if (product && complete(product) && !product.units.some(unit => key(unit.unit) === key(item.unit))) {
                return formError('receipt', 'ĐVT chưa được cấu hình. Cập nhật mặt hàng trước khi nhập theo ĐVT mới.', row.querySelector('.receipt-unit'));
            }
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
        if (Array.isArray(result.products)) state.products = result.products;
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
        get('productBaseUnit').addEventListener('input', () => {
            const input = get('productBaseUnit');
            const previous = input.getAttribute('data-previous-base');
            const row = productUnitRows().find(item => key(item.querySelector('.product-unit').value) === key(previous));
            if (row) row.querySelector('.product-unit').value = input.value.trim();
            input.setAttribute('data-previous-base', input.value.trim());
            syncProductUnits();
        });
        get('productUnits').addEventListener('input', event => {
            event.target.removeAttribute('aria-invalid');
            if (event.target.matches('.product-unit-price')) formatInput(event.target);
            if (event.target.matches('.product-unit')) syncProductUnits();
        });
        get('productAddUnit').addEventListener('click', () => {
            if (forms.product.busy) return;
            addProductUnit();
            productUnitRows().at(-1).querySelector('.product-unit').focus();
        });
        get('productUnits').addEventListener('click', event => {
            const button = event.target.closest('[data-delete-product-unit]');
            if (!button || forms.product.busy) return;
            button.closest('.product-unit-row').remove();
            if (!productUnitRows().length) addProductUnit();
            syncProductUnits();
        });
        ['productList', 'pendingProducts'].forEach(id => get(id).addEventListener('click', event => {
            const button = event.target.closest('[data-edit-product]');
            if (button) open('product', button.getAttribute('data-edit-product'));
        }));
        get('productForm').addEventListener('submit', saveProduct);
        get('receiptForm').addEventListener('submit', saveReceipt);
        function receiptChange(event) {
            if (!event.target.matches('.receipt-product') && !event.target.matches('.receipt-unit')) return;
            const row = event.target.closest('.receipt-item');
            const product = findProduct(row.querySelector('.receipt-product').value);
            if (event.target.matches('.receipt-product')) {
                const id = product ? product.id : '';
                if (id !== row.getAttribute('data-product-id')) {
                    const unit = product && product.units && product.units[0];
                    row.querySelector('.receipt-unit').value = unit ? unit.unit : '';
                    row.querySelector('.receipt-price').value = unit ? D.money(unit.price).toLocaleString('vi-VN') : '';
                    row.setAttribute('data-product-id', id);
                }
            } else if (product && product.units) {
                const unit = product.units.find(item => key(item.unit) === key(event.target.value));
                if (unit) row.querySelector('.receipt-price').value = D.money(unit.price).toLocaleString('vi-VN');
            }
            syncRows(); totals();
        }
        get('receiptItems').addEventListener('change', receiptChange);
        get('receiptItems').addEventListener('input', event => {
            if (event.target.matches('.receipt-product')) receiptChange(event);
            if (event.target.matches('.receipt-price')) formatInput(event.target);
            totals();
        });
        get('receiptItems').addEventListener('keydown', event => {
            if (!event.target.matches('.receipt-qty') || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const value = Number(event.target.value);
            event.target.value = String(Math.max(0, event.key === 'ArrowUp' ? Math.floor(value || 0) + 1 : Math.ceil(value || 0) - 1));
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

    app.Inventory = {load, ensureLoaded, resolveProduct, showView, getProducts: () => state.products.filter(complete)};
}(window.InvoiceApp));
