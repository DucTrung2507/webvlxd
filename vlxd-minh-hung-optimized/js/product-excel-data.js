/* Mẫu và kiểm tra Excel mặt hàng; không thay đổi dữ liệu trên máy chủ. */
window.InvoiceApp = window.InvoiceApp || {};
(function (app) {
    'use strict';
    const headers = ['Tên hàng', 'Loại hàng', 'ĐVT gốc', 'ĐVT', 'Hệ số quy đổi', 'Giá bán'];
    const MAX_ROWS = 1000;
    const MAX_PRODUCTS = 200;
    const clean = value => String(value == null ? '' : value).normalize('NFC').trim().replace(/\s+/g, ' ');
    const key = value => clean(value).toLowerCase();

    function createTemplate(XLSX) {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([headers.slice()]);
        sheet['!cols'] = [{wch: 32}, {wch: 22}, {wch: 15}, {wch: 15}, {wch: 20}, {wch: 20}];
        sheet['!autofilter'] = {ref: 'A1:F1'};
        XLSX.utils.book_append_sheet(workbook, sheet, 'Mat_hang');
        const examples = XLSX.utils.aoa_to_sheet([
            headers.slice(),
            ['Xi măng mẫu', 'Xi măng', 'kg', 'kg', 1, 2500],
            ['Xi măng mẫu', 'Xi măng', 'kg', 'bao', 50, 100000],
            ['Gạch mẫu', 'Gạch', 'viên', 'viên', 1, 12000],
            ['Gạch mẫu', 'Gạch', 'viên', 'thùng', 10, 115000]
        ]);
        examples['!cols'] = sheet['!cols'].map(column => ({...column}));
        ['F2', 'F3', 'F4', 'F5'].forEach(address => { examples[address].z = '#,##0.##'; });
        XLSX.utils.book_append_sheet(workbook, examples, 'Vi_du');
        const instructions = XLSX.utils.aoa_to_sheet([
            ['HƯỚNG DẪN NHẬP MẶT HÀNG'],
            ['Chỉ nhập dữ liệu vào tab Mat_hang, từ dòng 2; giữ nguyên tên tab và đủ 6 tiêu đề.'],
            ['Các tab Vi_du và Huong_dan không được nhập lên web. Xóa dữ liệu mẫu nếu bạn chép mẫu vào Mat_hang.'],
            ['Mỗi dòng là một ĐVT. Lặp lại Tên hàng, Loại hàng và ĐVT gốc khi một mặt hàng có nhiều ĐVT.'],
            ['Hệ số quy đổi = số ĐVT gốc trong 1 ĐVT của dòng đó. Ví dụ 1 bao = 50 kg thì hệ số của bao là 50.'],
            ['Phải có một dòng cho ĐVT gốc với hệ số bằng 1; mỗi ĐVT chỉ xuất hiện một lần trong cùng mặt hàng.'],
            ['Giá bán và hệ số phải lớn hơn 0. Nên nhập bằng ô số Excel; không dùng công thức, ngày tháng hay ký hiệu tiền.'],
            ['Giá dạng chữ dùng 100.000 hoặc 100.000,50; hệ số thập phân dùng 0,125. Hệ số 1000 viết liền, không phân nhóm.'],
            ['Tên hàng đã có trong danh sách mặt hàng hoặc đang chờ hoàn thiện sẽ bị báo trùng; file này chỉ thêm mặt hàng mới.'],
            ['Không khai báo số lượng tồn kho trong file này; nhập kho bằng hóa đơn nhập hàng.'],
            ['Tối đa ' + MAX_ROWS + ' dòng dữ liệu, ' + MAX_PRODUCTS + ' mặt hàng mỗi lần nhập. Xem trước và sửa mọi lỗi trước khi lưu.']
        ]);
        instructions['!cols'] = [{wch: 135}];
        XLSX.utils.book_append_sheet(workbook, instructions, 'Huong_dan');
        return workbook;
    }

    function meaningful(cell) {
        return !!cell && (cell.f != null || cell.t === 'e' || cell.t === 'b' || cell.t === 'd' ||
            (cell.v != null && !(typeof cell.v === 'string' && !cell.v.trim())));
    }

    function columnName(index) {
        let name = '';
        for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
            name = String.fromCharCode(65 + (value - 1) % 26) + name;
        }
        return name;
    }

    function inputValue(cell, XLSX, label) {
        if (!meaningful(cell)) throw new Error(label + ' không được để trống.');
        if (cell.f != null || (typeof cell.v === 'string' && cell.v.trim().startsWith('='))) {
            throw new Error(label + ' không được dùng công thức hoặc chữ bắt đầu bằng dấu =; hãy nhập giá trị trực tiếp.');
        }
        if (cell.t === 'd' || cell.v instanceof Date || (cell.t === 'n' && cell.z && XLSX && XLSX.SSF &&
            XLSX.SSF.is_date(cell.z))) throw new Error(label + ' không được là ngày tháng.');
        if (cell.t === 'b' || typeof cell.v === 'boolean' || cell.t === 'e' ||
            (typeof cell.v !== 'string' && typeof cell.v !== 'number')) {
            throw new Error(label + ' phải là chữ hoặc số hợp lệ.');
        }
        if (typeof cell.v === 'number' && !Number.isFinite(cell.v)) throw new Error(label + ' phải là số hữu hạn.');
        return cell.v;
    }

    function positiveNumber(value, isPrice, label) {
        let number = value;
        if (typeof value === 'string') {
            const text = value.trim();
            if (isPrice) {
                if (/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(text)) {
                    number = Number(text.replace(/\./g, '').replace(',', '.'));
                } else if (/^\d+(?:,\d+)?$/.test(text)) {
                    number = Number(text.replace(',', '.'));
                } else if (/^\d+\.\d{1,2}$/.test(text)) {
                    number = Number(text);
                } else throw new Error(label + ' không đúng định dạng số (ví dụ 100.000 hoặc 100.000,50).');
            } else {
                if (!/^\d+(?:[.,]\d+)?$/.test(text) || /^[1-9]\d{0,2}\.\d{3}$/.test(text)) {
                    throw new Error(label + ' không đúng định dạng; dùng số liền hoặc dấu phẩy thập phân (ví dụ 50 hoặc 0,125).');
                }
                number = Number(text.replace(',', '.'));
            }
        }
        if (!Number.isFinite(number) || number <= 0 || (isPrice && number > Number.MAX_SAFE_INTEGER)) {
            throw new Error(label + (isPrice ? ' phải lớn hơn 0 và không vượt quá ' + Number.MAX_SAFE_INTEGER + '.' : ' phải là số hữu hạn lớn hơn 0.'));
        }
        return number;
    }

    function parseWorkbook(workbook, XLSX, existingProducts) {
        const products = [], errors = [];
        const result = {products, errors, rowCount: 0};
        const error = (row, message) => errors.push({row, message});
        const sheet = workbook && workbook.Sheets && workbook.Sheets.Mat_hang;
        if (!sheet || typeof sheet !== 'object') {
            error(1, 'Không tìm thấy tab Mat_hang. Hãy dùng file mẫu tải từ trang Mặt hàng.');
            return result;
        }
        // sheetRows có thể cắt dữ liệu khi đọc file: !fullref giữ phạm vi ban đầu.
        const oversizedRange = ['!fullref', '!ref'].map(property => {
            const match = /^(?:\$?[A-Z]{1,3}\$?\d+:)?\$?[A-Z]{1,3}\$?(\d+)$/.exec(String(sheet[property] || ''));
            return match ? Number(match[1]) : 0;
        }).find(lastRow => lastRow > MAX_ROWS + 1);
        // Chỉ duyệt các ô thật, không duyệt !ref có thể chứa hàng triệu dòng định dạng rỗng.
        const rows = new Map();
        Object.keys(sheet).forEach(address => {
            if (address[0] === '!' || !meaningful(sheet[address])) return;
            const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address);
            if (!match) return;
            let column = 0;
            for (let i = 0; i < match[1].length; i++) column = column * 26 + match[1].charCodeAt(i) - 64;
            const row = Number(match[2]);
            if (!Number.isSafeInteger(row) || column > 16384 || row > 1048576) return;
            if (!rows.has(row)) rows.set(row, new Map());
            rows.get(row).set(column - 1, sheet[address]);
        });
        const dataRows = Array.from(rows.keys()).filter(row => row > 1).sort((a, b) => a - b);
        result.rowCount = dataRows.length;
        const beyondLimit = dataRows.find(row => row > MAX_ROWS + 1);
        if (beyondLimit != null || oversizedRange != null) {
            error(beyondLimit == null ? MAX_ROWS + 2 : beyondLimit,
                'Chỉ nhận tối đa ' + MAX_ROWS + ' dòng dữ liệu, từ dòng 2 đến dòng ' + (MAX_ROWS + 1) + '.');
            return result;
        }
        const headerRow = rows.get(1) || new Map(), columns = new Map();
        headerRow.forEach((cell, column) => {
            let value;
            try { value = inputValue(cell, XLSX, 'Tiêu đề cột ' + columnName(column)); }
            catch (caught) { error(1, caught.message); return; }
            const index = headers.findIndex(header => key(header) === key(value));
            if (index === -1) error(1, 'Cột ' + columnName(column) + ' có tiêu đề không hợp lệ: ' + clean(value) + '.');
            else if (columns.has(index)) error(1, 'Tiêu đề ' + headers[index] + ' bị trùng.');
            else columns.set(index, column);
        });
        headers.forEach((header, index) => { if (!columns.has(index)) error(1, 'Thiếu cột ' + header + '.'); });
        if (errors.length) return result;
        if (!dataRows.length) {
            error(2, 'Tab Mat_hang chưa có dữ liệu. Nhập mặt hàng từ dòng 2 rồi tải file lên lại.');
            return result;
        }
        const allowedColumns = new Set(columns.values());
        const existingNames = new Set((Array.isArray(existingProducts) ? existingProducts : []).map(product => key(product && product.name)));
        const groups = new Map();
        dataRows.forEach(row => {
            const cells = rows.get(row);
            let valid = true;
            cells.forEach((cell, column) => {
                if (!allowedColumns.has(column)) {
                    error(row, 'Cột ' + columnName(column) + ' có dữ liệu nhưng không có tiêu đề trong mẫu.');
                    valid = false;
                }
            });
            const values = [];
            headers.forEach((header, index) => {
                try { values[index] = inputValue(cells.get(columns.get(index)), XLSX, header); }
                catch (caught) { error(row, caught.message); valid = false; }
            });
            const name = values[0] == null ? '' : clean(values[0]);
            let group;
            if (name) {
                const nameKey = key(name);
                if (!groups.has(nameKey)) groups.set(nameKey, {name, type: '', baseUnit: '', units: [], rows: [], unitNames: new Set(), valid: true});
                group = groups.get(nameKey);
                group.rows.push(row);
                if (existingNames.has(nameKey) && group.rows.length === 1) {
                    error(row, 'Mặt hàng "' + name + '" đã có trong danh sách hoặc đang chờ hoàn thiện; file chỉ thêm mặt hàng mới.');
                    group.valid = false;
                }
            }
            let price, factor;
            [4, 5].forEach(index => {
                if (values[index] == null) return;
                try {
                    const number = positiveNumber(values[index], index === 5, headers[index]);
                    if (index === 5) price = number; else factor = number;
                } catch (caught) { error(row, caught.message); valid = false; }
            });
            if (!group) return;
            const type = values[1] == null ? '' : clean(values[1]);
            const baseUnit = values[2] == null ? '' : clean(values[2]);
            const unit = values[3] == null ? '' : clean(values[3]);
            if (type && group.type && key(type) !== key(group.type)) {
                error(row, 'Loại hàng của "' + group.name + '" phải giống các dòng trước (' + group.type + ').');
                valid = false;
            }
            if (baseUnit && group.baseUnit && key(baseUnit) !== key(group.baseUnit)) {
                error(row, 'ĐVT gốc của "' + group.name + '" phải giống các dòng trước (' + group.baseUnit + ').');
                valid = false;
            }
            if (!group.type && type) group.type = type;
            if (!group.baseUnit && baseUnit) group.baseUnit = baseUnit;
            if (unit) {
                if (group.unitNames.has(key(unit))) {
                    error(row, 'ĐVT "' + unit + '" bị trùng trong mặt hàng "' + group.name + '".');
                    valid = false;
                }
                group.unitNames.add(key(unit));
            }
            if (!valid) group.valid = false;
            else group.units.push({unit, price, factor});
        });
        if (groups.size > MAX_PRODUCTS) {
            const firstExtra = Array.from(groups.values())[MAX_PRODUCTS];
            error(firstExtra.rows[0], 'Chỉ nhận tối đa ' + MAX_PRODUCTS + ' mặt hàng mỗi lần nhập.');
            return result;
        }
        groups.forEach(group => {
            const base = group.units.find(unit => key(unit.unit) === key(group.baseUnit));
            if (!base || base.factor !== 1) {
                if (group.valid) error(group.rows[0], 'Mặt hàng "' + group.name + '" phải có ĐVT gốc "' + group.baseUnit + '" với hệ số bằng 1.');
                group.valid = false;
            }
            if (group.valid) products.push({name: group.name, type: group.type, baseUnit: base.unit,
                price: base.price, units: group.units, rows: group.rows});
        });
        errors.sort((a, b) => a.row - b.row);
        return result;
    }

    app.ProductExcelData = {headers: headers.slice(), createTemplate, parseWorkbook, MAX_ROWS, MAX_PRODUCTS};
}(window.InvoiceApp));
