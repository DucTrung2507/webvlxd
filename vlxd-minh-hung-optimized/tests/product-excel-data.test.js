/* Parser và mẫu Excel thật; chạy bằng Node VM hoặc JavaScriptCore, không gọi mạng. */
var window = {};
load('js/vendor/xlsx.full.min.js');
load('js/product-excel-data.js');
var excel = typeof XLSX === 'undefined' ? window.XLSX : XLSX;
var data = window.InvoiceApp.ProductExcelData;
var checks = 0;
function assert(condition, label) { checks++; if (!condition) throw new Error(label); }
function equal(actual, expected, label) { assert(JSON.stringify(actual) === JSON.stringify(expected), label + ': ' + JSON.stringify(actual)); }
function book(rows, titles) {
    var workbook = excel.utils.book_new();
    excel.utils.book_append_sheet(workbook, excel.utils.aoa_to_sheet([titles || data.headers].concat(rows || [])), 'Mat_hang');
    return workbook;
}
function row(name) { return [name || 'Xi măng', 'Xi măng', 'kg', 'kg', 1, 2500]; }
function parse(workbook, existing) { return data.parseWorkbook(workbook, excel, existing || []); }
function errorContains(result, text, line) {
    assert(result.errors.some(function (error) { return error.message.includes(text) && (line == null || error.row === line); }),
        'Expected error ' + text + ' at ' + line + ': ' + JSON.stringify(result.errors));
}

try {
    equal(data.headers, ['Tên hàng', 'Loại hàng', 'ĐVT gốc', 'ĐVT', 'Hệ số quy đổi', 'Giá bán'], 'Six documented headers');
    equal(data.MAX_ROWS, 1000, 'Data row cap');
    equal(data.MAX_PRODUCTS, 200, 'Product cap');
    var template = data.createTemplate(excel);
    equal(template.SheetNames, ['Mat_hang', 'Vi_du', 'Huong_dan'], 'Template separates input, examples, and instructions');
    equal(excel.utils.sheet_to_json(template.Sheets.Mat_hang, {header: 1}), [data.headers], 'Input template has no accidental sample products');
    assert(excel.utils.sheet_to_json(template.Sheets.Vi_du, {header: 1}).length > 2, 'Examples demonstrate several units');
    assert(template.Sheets.Mat_hang['!cols'].length === 6, 'Template columns have readable widths');
    errorContains(parse(template), 'chưa có dữ liệu', 2);
    var bytes = excel.write(template, {bookType: 'xlsx', type: 'array'});
    var roundtrip = excel.read(bytes, {type: 'array', cellFormula: true, cellNF: true, cellDates: false});
    equal(roundtrip.SheetNames, template.SheetNames, 'Template is a valid writable xlsx file');
    errorContains(parse(roundtrip), 'chưa có dữ liệu', 2);

    var source = book([
        ['  Xi   măng  ', 'Xi măng', 'KG', 'bao', 50, '100.000'],
        ['xi măng', 'xi măng', 'kg', 'kg', 1, '2.500,50'],
        ['Gạch', 'Gạch', 'viên', 'viên', 1, 12000]
    ]);
    var before = JSON.stringify(source);
    var result = parse(source);
    equal(result.errors, [], 'Multi-unit file validates');
    equal(result.rowCount, 3, 'Counts unit data rows');
    equal(result.products.length, 2, 'Case and whitespace variations group into one product');
    equal(result.products[0], {name: 'Xi măng', type: 'Xi măng', baseUnit: 'kg', price: 2500.5,
        units: [{unit: 'bao', price: 100000, factor: 50}, {unit: 'kg', price: 2500.5, factor: 1}], rows: [2, 3]},
        'Preserves ordered units and Excel rows, takes legacy price from base unit');
    equal(JSON.stringify(source), before, 'Parsing does not modify workbook');
    var existing = [{id: 'SP1', name: ' XI   MĂNG ', status: 'pending'}];
    var existingBefore = JSON.stringify(existing);
    result = parse(source, existing);
    errorContains(result, 'đã có', 2);
    equal(result.products.map(function (product) { return product.name; }), ['Gạch'], 'An existing pending product is excluded without suppressing valid groups');
    equal(JSON.stringify(existing), existingBefore, 'Existing catalog is not modified');
    errorContains(parse(book([row('Gạch')]), [{name: 'Gạch', status: 'active'}]), 'đã có', 2);
    var decomposed = 'Ga\u0323ch';
    result = parse(book([row('Gạch'), [decomposed, 'Xi măng', 'kg', 'bao', 10, 12000]]));
    equal(result.errors, [], 'NFC names group without false collisions');
    equal(result.products.length, 1, 'NFC grouping shares a product');
    equal(result.products[0].rows, [2, 3], 'Group remembers all source lines');

    var titles = [' GIÁ  BÁN ', 'Đvt', 'tên hàng', 'ĐVT GỐC', 'Loại hàng', 'Hệ số quy đổi'];
    result = parse(book([[2500, 'kg', 'Xi măng', 'kg', 'Xi măng', 1]], titles));
    equal(result.errors, [], 'Reordered headers accept case and spacing');
    equal(result.products[0].units[0], {unit: 'kg', price: 2500, factor: 1}, 'Reordered columns map correctly');
    errorContains(parse(book([row()], data.headers.slice(0, 5))), 'Thiếu cột Giá bán', 1);
    errorContains(parse(book([row()], data.headers.concat(['Giá bán']))), 'bị trùng', 1);
    errorContains(parse(book([row()], data.headers.concat(['Ghi chú']))), 'tiêu đề không hợp lệ', 1);
    source = book([row().concat(['Dữ liệu thừa'])]);
    errorContains(parse(source), 'không có tiêu đề', 2);
    source = book([row()]); source.Sheets.Mat_hang.G1 = {t: 's', v: '   '};
    equal(parse(source).errors, [], 'Empty extra columns do not invalidate a file');
    errorContains(parse({Sheets: {Vi_du: template.Sheets.Vi_du}}), 'Không tìm thấy tab Mat_hang', 1);
    errorContains(parse(null), 'Không tìm thấy tab Mat_hang', 1);
    source = book([row()]); source.Sheets.Vi_du = book([row('Không nhập')]).Sheets.Mat_hang;
    equal(parse(source).products.length, 1, 'Only Mat_hang is imported');

    data.headers.forEach(function (label, index) {
        var values = row(); values[index] = '';
        var missing = parse(book([values]));
        errorContains(missing, label + ' không được để trống', 2);
        equal(missing.products.length, 0, 'Missing ' + label + ' prevents product creation');
        var withFormula = book([row()]);
        withFormula.Sheets.Mat_hang[excel.utils.encode_cell({r: 1, c: index})].f = '1+1';
        errorContains(parse(withFormula), 'không được dùng công thức', 2);
        var withLiteralFormula = book([row()]);
        withLiteralFormula.Sheets.Mat_hang[excel.utils.encode_cell({r: 1, c: index})] = {t: 's', v: '  =1+1'};
        errorContains(parse(withLiteralFormula), 'chữ bắt đầu bằng dấu =', 2);
        equal(parse(withLiteralFormula).products, [], 'Literal formula text in ' + label + ' cannot reach Google Sheets');
    });
    source = book([row()]); source.Sheets.Mat_hang.A1.f = '"Tên hàng"';
    errorContains(parse(source), 'không được dùng công thức', 1);
    source = book([row()]); source.Sheets.Mat_hang.A2 = {t: 's', v: '=HYPERLINK("https://example.com","Tên hàng")'};
    bytes = excel.write(source, {bookType: 'xlsx', type: 'array'});
    roundtrip = excel.read(bytes, {type: 'array', cellFormula: true, cellNF: true, cellDates: false});
    equal(roundtrip.Sheets.Mat_hang.A2.f, undefined, 'Literal formula in XLSX has no formula metadata');
    errorContains(parse(roundtrip), 'chữ bắt đầu bằng dấu =', 2);
    [
        {t: 'b', v: true}, {t: 'e', v: 7}, {t: 'd', v: new Date('2026-01-01T00:00:00Z')},
        {t: 'n', v: 46023, z: 'dd/mm/yyyy'}, {t: 'n', v: Infinity}, {t: 'n', v: NaN}
    ].forEach(function (cell) {
        var invalidType = book([row()]); invalidType.Sheets.Mat_hang.F2 = cell;
        assert(parse(invalidType).errors.length > 0, 'Dates, booleans, errors, and nonfinite cells are rejected');
    });
    source = book([row()]); source.Sheets.Mat_hang.F2 = {t: 'n', v: 46023, z: 'dd/mm/yyyy'};
    bytes = excel.write(source, {bookType: 'xlsx', type: 'array'});
    roundtrip = excel.read(bytes, {type: 'array', cellFormula: true, cellNF: true, cellDates: false});
    errorContains(parse(roundtrip), 'không được là ngày tháng', 2);

    ['100.000', '100.000,50', '12345,75', '12345.75', '1.000.000', 0.25].forEach(function (price, index) {
        var prices = row(); prices[5] = price;
        var values = [100000, 100000.5, 12345.75, 12345.75, 1000000, 0.25];
        equal(parse(book([prices])).products[0].price, values[index], 'Localized and native numeric prices parse precisely');
    });
    ['100.00.0', '100.000đ', '1 000', '1,000.50', '1e3', '-500', '+500', 'NaN', 0, -1, Infinity, Number.MAX_SAFE_INTEGER + 1].forEach(function (price) {
        var invalidPrice = row(); invalidPrice[5] = price;
        errorContains(parse(book([invalidPrice])), 'Giá bán', 2);
    });
    ['0,125', '0.125', 0.125, '50', 50].forEach(function (factor, index) {
        var factors = [row(), ['Xi măng', 'Xi măng', 'kg', 'bao', factor, 1000]];
        var factorResult = parse(book(factors));
        equal(factorResult.errors, [], 'Valid decimal factor is accepted');
        equal(factorResult.products[0].units[1].factor, index < 3 ? 0.125 : 50, 'Factor is normalized');
    });
    ['1.000', '1.000.000', '1e3', '50 kg', '0,1,2', '1 000', '-1', '+1', 0, -1, Infinity].forEach(function (factor) {
        errorContains(parse(book([row(), ['Xi măng', 'Xi măng', 'kg', 'bao', factor, 1000]])), 'Hệ số quy đổi', 3);
    });

    errorContains(parse(book([row(), ['Xi măng', 'Gạch', 'kg', 'bao', 50, 100000]])), 'Loại hàng', 3);
    errorContains(parse(book([row(), ['Xi măng', 'Xi măng', 'bao', 'bao', 50, 100000]])), 'ĐVT gốc', 3);
    errorContains(parse(book([row(), ['Xi măng', 'Xi măng', 'kg', ' KG ', 1, 100000]])), 'bị trùng', 3);
    errorContains(parse(book([['Xi măng', 'Xi măng', 'kg', 'bao', 50, 100000]])), 'phải có ĐVT gốc', 2);
    var notOne = row(); notOne[4] = 2;
    errorContains(parse(book([notOne])), 'hệ số bằng 1', 2);
    source = book([row(), [], ['Gạch', 'Gạch', 'viên', 'viên', 1, 12000]]);
    result = parse(source);
    equal(result.rowCount, 2, 'Entirely blank rows are ignored');
    equal(result.products[1].rows, [4], 'Blank rows preserve original Excel numbering');

    var boundaryRows = [];
    for (var i = 0; i < data.MAX_ROWS; i++) boundaryRows.push(['Một mặt hàng', 'Loại', 'gốc', i === 0 ? 'gốc' : 'đvt' + i, i + 1, 100]);
    equal(parse(book(boundaryRows)).errors, [], 'Exactly 1000 data rows accepted');
    boundaryRows.push(['Một mặt hàng', 'Loại', 'gốc', 'thừa', 10, 100]);
    errorContains(parse(book(boundaryRows)), 'tối đa 1000', 1002);
    source = book([row()]); source.Sheets.Mat_hang.A1002 = {t: 's', v: 'Ngoài giới hạn'};
    errorContains(parse(source), 'tối đa 1000', 1002);
    source = book([row()]); source.Sheets.Mat_hang['!ref'] = 'A1:XFD1048576';
    errorContains(parse(source), 'tối đa 1000', 1002);
    source = book([row()]); source.Sheets.Mat_hang['!fullref'] = 'A1:F1000000';
    errorContains(parse(source), 'tối đa 1000', 1002);
    source = book(boundaryRows);
    bytes = excel.write(source, {bookType: 'xlsx', type: 'array'});
    roundtrip = excel.read(bytes, {type: 'array', sheetRows: data.MAX_ROWS + 2, cellNF: true, cellFormula: true});
    errorContains(parse(roundtrip), 'tối đa 1000', 1002);
    var productRows = [];
    for (var p = 0; p < data.MAX_PRODUCTS; p++) productRows.push(row('Mặt hàng ' + p));
    equal(parse(book(productRows)).products.length, 200, 'Exactly 200 products accepted');
    productRows.push(row('Mặt hàng thừa'));
    errorContains(parse(book(productRows)), 'tối đa 200', 202);
    equal(parse(book(productRows)).products, [], 'Over-limit product batches cannot be partially submitted');
    print('PASS: ' + checks + ' product Excel data checks (real XLSX roundtrip, no network)');
} catch (error) {
    print('FAIL: ' + error.message + '\n' + error.stack);
    quit(1);
}
