/* Đọc Excel tại trình duyệt, kiểm tra trước rồi dùng API tạo mặt hàng hiện có. */
(function (app) {
    'use strict';
    const D = app.Data, esc = D.escapeHtml;
    const get = id => document.getElementById(id);
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    let batch = null, busy = false, parsing = false, pauseRequested = false, generation = 0, runSerial = 0, returnFocus;
    const priceText = value => Number(value).toLocaleString('vi-VN', {maximumFractionDigits: 20}) + ' đ';

    function error(message) { get('productImportError').textContent = message; get('productImportError').hidden = !message; }
    function workbookTools() {
        if (!window.XLSX || !app.ProductExcelData) throw new Error('Chưa tải được công cụ đọc Excel. Hãy tải lại trang rồi thử lại.');
        return window.XLSX;
    }
    function openPanel() {
        if (!get('productImportPanel').open) {
            returnFocus = document.activeElement;
            get('productImportPanel').showModal();
        }
    }
    function closePanel() {
        if (busy) return;
        ++generation;
        if (parsing) batch = null;
        parsing = false;
        get('productImportPanel').close();
        if (returnFocus) returnFocus.focus();
    }
    function chooseFile() {
        if (busy) return;
        get('productExcelFile').value = '';
        get('productExcelFile').click();
    }
    function controls() {
        const entries = batch ? batch.entries : [];
        const remaining = entries.some(entry => !entry.saved);
        get('productImportPanel').setAttribute('aria-busy', String(busy || parsing));
        get('productImportConfirm').disabled = busy || parsing || !remaining || !!(batch && batch.errors.length);
        get('productImportConfirm').textContent = busy ? 'Đang nhập…' : entries.some(entry => entry.status === 'error') ? 'Thử lại phần chưa nhập' : entries.some(entry => entry.saved) ? 'Tiếp tục nhập' : 'Nhập mặt hàng';
        get('productImportPause').hidden = !busy;
        get('productImportPause').disabled = pauseRequested;
        get('productImportPause').textContent = pauseRequested ? 'Đang chờ lưu xong…' : 'Dừng sau mặt hàng này';
        ['productTemplateDownload', 'productExcelImport', 'productImportChoose', 'productExcelFile'].forEach(id => { get(id).disabled = busy; });
        document.querySelectorAll('[data-close-product-import]').forEach(button => { button.disabled = busy; });
    }
    function render() {
        const entries = batch ? batch.entries : [];
        const errors = batch ? batch.errors : [];
        get('productImportPanel').classList.toggle('has-preview', entries.length > 0);
        get('productImportChoose').textContent = batch || parsing ? 'Chọn file khác' : 'Chọn file Excel';
        get('productImportSummary').textContent = parsing ? 'Đang đọc file và kiểm tra danh mục…' : batch
            ? `${batch.filename} · ${batch.rowCount} dòng · ${entries.length} mặt hàng · ${errors.length} lỗi` : 'Chọn file Excel đã điền để xem trước.';
        get('productImportErrors').hidden = !errors.length;
        get('productImportErrors').innerHTML = errors.slice(0, 100).map(item => `<li>${item.row ? 'Dòng ' + esc(item.row) + ': ' : ''}${esc(item.message)}</li>`).join('') +
            (errors.length > 100 ? `<li>Còn ${errors.length - 100} lỗi khác. Sửa file rồi chọn lại để kiểm tra.</li>` : '');
        const status = entry => entry.saved ? 'Đã thêm · ' + entry.saved.id : entry.status === 'saving' ? 'Đang lưu…' : entry.status === 'error' ? entry.message : 'Chờ nhập';
        get('productImportList').innerHTML = entries.length ? entries.map(entry => `<tr><td>${esc((entry.product.rows || []).join(', '))}</td><td>${esc(entry.product.name)}</td><td>${esc(entry.product.type)}</td><td>${esc(entry.product.baseUnit)}</td>
            <td><ul class="unit-prices">${entry.product.units.map(unit => `<li>1 ${esc(unit.unit)} = ${esc(unit.factor)} ${esc(entry.product.baseUnit)} · ${esc(priceText(unit.price))}</li>`).join('')}</ul></td>
            <td class="import-status${entry.saved ? ' text-success' : entry.status === 'error' ? ' text-debt' : ''}">${esc(status(entry))}</td></tr>`).join('') :
            `<tr class="empty-row"><td colspan="6">${parsing ? 'Đang đọc file…' : errors.length ? 'Sửa các lỗi trong file rồi chọn lại.' : 'Chưa có mặt hàng để nhập.'}</td></tr>`;
        const preview = get('productImportList').closest('.order-table-wrapper');
        if (preview) preview.hidden = !entries.length;
        const completed = entries.filter(entry => entry.saved).length;
        get('productImportProgress').textContent = entries.length ? `Đã thêm ${completed} / ${entries.length} mặt hàng.` +
            (completed === entries.length ? ' Hoàn tất.' : !busy && completed ? ' Các mặt hàng đã lưu được giữ lại; có thể tiếp tục phần còn lại.' : '') : '';
        controls();
    }
    function payload(product) {
        return {name: product.name, type: product.type, baseUnit: product.baseUnit, price: product.price,
            units: product.units.map(unit => ({...unit})), requestId: D.requestId()};
    }
    async function readFile(file) {
        if (busy || !file) return;
        const current = ++generation;
        batch = null; parsing = true; pauseRequested = false;
        openPanel(); error(''); render();
        try {
            if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Chọn file Excel .xlsx hoặc .xls theo mẫu.');
            if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('File Excel phải có dữ liệu và không lớn hơn 5 MB.');
            const XLSX = workbookTools();
            const buffer = await file.arrayBuffer();
            if (current !== generation) return;
            let workbook;
            try { workbook = XLSX.read(buffer, {type: 'array', sheetRows: app.ProductExcelData.MAX_ROWS + 2, cellFormula: true, cellDates: false, cellNF: true}); }
            catch { throw new Error('Không đọc được file Excel. Kiểm tra file đúng định dạng và không có mật khẩu.'); }
            const inventory = await app.Inventory.load(true);
            if (current !== generation) return;
            if (!inventory) throw new Error('Chưa tải được danh mục để kiểm tra tên trùng. Hãy chọn lại file khi kết nối ổn định.');
            const result = app.ProductExcelData.parseWorkbook(workbook, XLSX, app.Inventory.getAllProducts());
            if (current !== generation) return;
            batch = {filename: file.name, rowCount: result.rowCount, errors: result.errors,
                entries: result.products.map(product => ({product, payload: payload(product), status: 'ready', saved: null, message: ''}))};
        } catch (caught) {
            if (current === generation) error(caught.message || 'Chưa đọc được file. Hãy kiểm tra và thử lại.');
        } finally {
            if (current === generation) { parsing = false; render(); }
        }
    }
    function downloadTemplate() {
        if (busy) return;
        try { const XLSX = workbookTools(); XLSX.writeFile(app.ProductExcelData.createTemplate(XLSX), 'Mau_mat_hang_Minh_Hung.xlsx', {bookType: 'xlsx'}); }
        catch (caught) {
            openPanel(); error(caught.message || 'Chưa tải được file mẫu. Hãy thử lại.'); render();
        }
    }
    async function runImport() {
        if (busy || parsing || !batch || batch.errors.length || !batch.entries.some(entry => !entry.saved)) return;
        const current = batch, currentGeneration = generation, currentRun = ++runSerial;
        busy = true; pauseRequested = false; error(''); render();
        try {
            for (const entry of current.entries) {
                if (entry.saved) continue;
                if (pauseRequested) break;
                entry.status = 'saving'; entry.message = ''; render();
                try {
                    const saved = await app.API.createProduct(entry.payload);
                    entry.saved = saved; entry.status = 'done';
                    app.Inventory.rememberProduct(saved);
                } catch (caught) {
                    entry.status = entry.saved ? 'done' : 'error';
                    entry.message = caught.message || 'Chưa xác nhận được lưu mặt hàng.';
                    error('Mặt hàng ' + entry.product.name + ': ' + entry.message + (entry.saved ? '' : ' Bấm thử lại để kiểm tra và tiếp tục cùng yêu cầu.'));
                    break;
                }
                render();
            }
        } finally {
            busy = false; render();
        }
        const completed = current.entries.filter(entry => entry.saved).length;
        if (completed) {
            let refreshed;
            try { refreshed = await app.Inventory.load(true); } catch { refreshed = null; }
            if (!refreshed && batch === current && generation === currentGeneration && runSerial === currentRun && !busy) {
                const previous = get('productImportError').textContent;
                error((previous ? previous + ' ' : '') + 'Đã lưu các mặt hàng được xác nhận nhưng chưa làm mới được danh mục.');
            }
        }
    }
    document.addEventListener('DOMContentLoaded', () => {
        get('productTemplateDownload').addEventListener('click', downloadTemplate);
        get('productExcelImport').addEventListener('click', () => {
            if (busy) return;
            if (!get('productImportPanel').open && batch && batch.entries.length && batch.entries.every(entry => entry.saved)) {
                batch = null;
                error('');
            }
            openPanel(); render();
            get('productImportChoose').focus();
        });
        get('productImportChoose').addEventListener('click', chooseFile);
        get('productExcelFile').addEventListener('change', event => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            return readFile(file);
        });
        get('productImportConfirm').addEventListener('click', runImport);
        get('productImportPause').addEventListener('click', () => { pauseRequested = true; controls(); });
        document.querySelectorAll('[data-close-product-import]').forEach(button => button.addEventListener('click', closePanel));
        get('productImportPanel').addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
        render();
    });
}(window.InvoiceApp));
