(function (app) {
    'use strict';
    const {money, formatMoney, todayKey, formatDate} = app.Data;
    const get = id => document.getElementById(id);
    let saving = false;
    let opening = 0;
    let ready = false;
    let saveRequestId = '';
    let orderDate = '';
    let returnFocus;
    let toastTimer;

    function notify(message, type = '') {
        const toast = get('toast');
        toast.textContent = message;
        toast.className = 'toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
    }
    app.notify = notify;

    function rows() { return [...get('items').querySelectorAll('.item')]; }

    function addItem() {
        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `<div class="stt"></div>
            <input class="name" type="text" list="productOptions" placeholder="Chọn mặt hàng đã tạo" aria-label="Tên hàng" autocomplete="off">
            <input class="qty" type="number" value="1" min="0.000001" step="0.000001" aria-label="Số lượng">
            <input class="unit" type="text" placeholder="bao, m³…" aria-label="Đơn vị tính">
            <input class="price" type="text" inputmode="numeric" placeholder="0" aria-label="Đơn giá">
            <div class="subtotal">0 đ</div>
            <button type="button" data-delete-item aria-label="Xóa mặt hàng">×</button>`;
        get('items').appendChild(row);
    }

    function syncItemRows() {
        const current = rows();
        const firstEmpty = current.findIndex(row => !row.querySelector('.name').value.trim());
        if (firstEmpty === -1) {
            // Khi chưa có dòng hoặc tất cả đã có tên, thêm một dòng trống kế tiếp.
            addItem();
        } else {
            // Một dòng trống kết thúc danh sách; các dòng phía sau mất theo.
            current.slice(firstEmpty + 1).forEach(row => row.remove());
        }
        renumber();
    }

    function renumber() {
        rows().forEach((row, index) => {
            row.querySelector('.stt').textContent = index + 1;
            [['.name', 'Tên hàng'], ['.qty', 'Số lượng'], ['.unit', 'Đơn vị tính'], ['.price', 'Đơn giá']].forEach(([selector, label]) => {
                row.querySelector(selector).setAttribute('aria-label', `${label}, dòng ${index + 1}`);
            });
        });
    }

    function formatInput(input) {
        const digits = input.value.replace(/\D/g, '');
        input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
    }

    function totals() {
        let total = 0;
        rows().forEach(row => {
            const qty = Number(row.querySelector('.qty').value);
            const subtotal = row.querySelector('.name').value.trim() && Number.isFinite(qty) && qty > 0 ?
                Math.round(qty * money(row.querySelector('.price').value)) : 0;
            row.querySelector('.subtotal').textContent = formatMoney(subtotal);
            total += subtotal;
        });
        get('total').textContent = formatMoney(total);
        get('debt').textContent = formatMoney(total - money(get('paid').value));
        return total;
    }

    function setBusy(value) {
        saving = value;
        get('createForm').setAttribute('aria-busy', String(value));
        get('createForm').querySelectorAll('input, button').forEach(control => { control.disabled = value; });
        get('saveOrder').disabled = value || !ready;
        get('saveAndPrint').disabled = value || !ready;
        get('saveOrder').textContent = value ? 'Đang lưu…' : 'Lưu hóa đơn';
    }

    async function open() {
        if (get('orderPanel').open) return;
        const request = ++opening;
        returnFocus = document.activeElement;
        ready = false;
        saveRequestId = app.Data.requestId();
        orderDate = todayKey();
        get('createForm').reset();
        get('orderFormError').hidden = true;
        get('createForm').querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        get('orderId').textContent = 'Đang tạo mã…';
        get('items').replaceChildren();
        syncItemRows();
        totals();
        setBusy(false);
        get('orderPanel').showModal();
        get('customer').focus();
        try {
            if (app.Inventory) {
                await app.Inventory.ensureLoaded();
                if (!app.Inventory.getProducts().length) throw new Error('Chưa có mặt hàng. Đóng biểu mẫu, vào Mặt hàng để tạo danh mục và vào Kho để nhập hàng trước khi bán.');
            }
            const id = await app.API.nextId(app.List.getOrders());
            if (request !== opening || !get('orderPanel').open) return;
            get('orderId').textContent = id;
            ready = true;
            setBusy(false);
        } catch (error) {
            if (request !== opening || !get('orderPanel').open) return;
            get('orderId').textContent = 'Chưa cấp mã';
            get('orderFormError').textContent = error.message;
            get('orderFormError').hidden = false;
        }
    }

    function close() {
        if (saving) return;
        opening++;
        get('orderPanel').close();
        if (returnFocus) returnFocus.focus();
    }

    function collect() {
        const form = get('createForm');
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        const filled = rows().filter(row => row.querySelector('.name').value.trim());
        let message = '';
        let invalid;
        const fail = (input, text) => {
            input.setAttribute('aria-invalid', 'true');
            if (!invalid) { invalid = input; message = text; }
        };
        if (!get('customer').value.trim()) fail(get('customer'), 'Vui lòng nhập tên khách hàng.');
        if (!filled.length) fail(rows()[0].querySelector('.name'), 'Vui lòng nhập ít nhất một mặt hàng.');
        filled.forEach(row => {
            const name = row.querySelector('.name');
            const qty = row.querySelector('.qty');
            const price = row.querySelector('.price');
            if (app.Inventory && !app.Inventory.resolveProduct(name.value)) fail(name, 'Chọn mặt hàng có trong danh mục. Nếu là hàng mới, hãy tạo trong Mặt hàng trước.');
            if (!Number.isFinite(Number(qty.value)) || Number(qty.value) <= 0) fail(qty, 'Số lượng phải lớn hơn 0.');
            if (!Number.isFinite(money(price.value)) || money(price.value) <= 0) fail(price, 'Đơn giá phải lớn hơn 0.');
        });
        const error = get('orderFormError');
        error.hidden = !invalid;
        error.textContent = message;
        if (invalid) { invalid.focus(); return null; }
        const total = totals();
        return {
            id: get('orderId').textContent, date: formatDate(orderDate), requestId: saveRequestId,
            customer: get('customer').value.trim(), address: get('address').value.trim(),
            shipper: get('shipper').value.trim(), total: formatMoney(total), paid: get('paid').value || '0',
            debt: formatMoney(total - money(get('paid').value)),
            items: filled.map(row => {
                const name = row.querySelector('.name').value.trim();
                const product = app.Inventory && app.Inventory.resolveProduct(name);
                return {productId: product ? product.id : '', name: product ? product.name : name,
                    qty: row.querySelector('.qty').value, unit: row.querySelector('.unit').value.trim(),
                    price: row.querySelector('.price').value, subtotal: row.querySelector('.subtotal').textContent};
            })
        };
    }

    async function submit(event) {
        event.preventDefault();
        if (saving || !ready) return;
        const order = collect();
        if (!order) return;
        const print = event.submitter && event.submitter.value === 'print';
        setBusy(true);
        let saved;
        try { saved = await app.API.save(order); } catch (error) {
            setBusy(false);
            get('orderFormError').textContent = error.message || 'Chưa lưu được hóa đơn. Kiểm tra kết nối và thử lại.';
            get('orderFormError').hidden = false;
            return;
        }
        setBusy(false);
        close();
        notify('Đã lưu hóa đơn thành công.', 'success');
        app.List.remember(saved);
        app.List.load();
        if (app.Inventory) app.Inventory.load(true);
        if (print) {
            try { app.Print.print(saved); } catch {
                notify('Hóa đơn đã lưu, nhưng chưa mở được cửa sổ in. Kiểm tra trình duyệt trước khi in lại.', 'error');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-open-order]').forEach(button => button.addEventListener('click', open));
        document.querySelectorAll('[data-close-order]').forEach(button => button.addEventListener('click', close));
        get('orderPanel').addEventListener('cancel', event => { event.preventDefault(); close(); });
        get('orderPanel').addEventListener('click', event => {
            if (event.target !== get('orderPanel')) return;
            const rect = get('orderPanel').getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        });
        get('addItem').addEventListener('click', () => {
            if (saving) return;
            syncItemRows();
            totals();
            rows().at(-1).querySelector('.name').focus();
        });
        get('items').addEventListener('input', event => {
            event.target.removeAttribute('aria-invalid');
            if (event.target.matches('.price')) formatInput(event.target);
            if (event.target.matches('.name')) {
                if (app.Inventory) {
                    const row = event.target.closest('.item');
                    const product = app.Inventory.resolveProduct(event.target.value);
                    if (product && row.getAttribute('data-product-id') !== product.id) {
                        row.querySelector('.price').value = money(product.price).toLocaleString('vi-VN');
                    } else if (!event.target.value.trim()) row.querySelector('.price').value = '';
                    row.setAttribute('data-product-id', product ? product.id : '');
                }
                syncItemRows();
            }
            totals();
        });
        get('items').addEventListener('click', event => {
            const button = event.target.closest('[data-delete-item]');
            if (!button || saving) return;
            const row = button.closest('.item');
            const index = rows().indexOf(row);
            row.remove();
            syncItemRows();
            totals();
            const remaining = rows();
            remaining[Math.min(index, remaining.length - 1)].querySelector('.name').focus();
        });
        get('paid').addEventListener('input', () => { formatInput(get('paid')); totals(); });
        get('payFull').addEventListener('click', () => { get('paid').value = totals().toLocaleString('vi-VN'); totals(); });
        get('customer').addEventListener('input', () => get('customer').removeAttribute('aria-invalid'));
        get('createForm').addEventListener('submit', submit);
        app.List.init();
    });
}(window.InvoiceApp));
