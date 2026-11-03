/* Google Apps Script giả lập dùng chung cho các bộ kiểm thử JSC; không gọi Google. */
var checks = 0;
function assert(value, message) { if (!value) throw new Error(message); checks++; }
function equal(actual, expected, message) { assert(actual === expected, message + ': ' + actual + ' !== ' + expected); }
function cloneRows(rows) { return rows.map(function (row) { return row.slice(); }); }
var mock = {sheets: {}, writes: 0, held: false, acquires: 0, releases: 0, failWrite: '', reads: [], alerts: [], dialogs: [], writeLog: []};

function FakeSheet(name, rows) { this.name = name; this.rows = cloneRows(rows); }
FakeSheet.prototype.getLastRow = function () {
    for (var i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].some(function (v) { return v !== '' && v != null; })) return i + 1;
    return 0;
};
FakeSheet.prototype.getLastColumn = function () { return this.rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0); };
FakeSheet.prototype.getDataRange = function () { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
FakeSheet.prototype.getRange = function (row, col, height, width) {
    var sheet = this;
    if (typeof row === 'string') {
        var match = row.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
        if (!match) throw new Error('Unexpected A1 range: ' + row);
        function column(text) { return text.split('').reduce(function(n,c){return n * 26 + c.charCodeAt(0) - 64;},0); }
        col = column(match[1]);
        row = Number(match[2] || 1);
        width = match[3] ? column(match[3]) - col + 1 : 1;
        height = match[3] ? Number(match[4] || Math.max(row, sheet.getLastRow())) - row + 1 : 1;
    }
    height = height || 1; width = width || 1;
    return {
        getValues: function () {
            mock.reads.push({sheet: sheet.name, held: mock.held});
            return Array.from({length: height}, function (_, y) {
                return Array.from({length: width}, function (_, x) {
                    var v = (sheet.rows[row + y - 1] || [])[col + x - 1];
                    return v == null ? '' : v;
                });
            });
        },
        setValues: function (values) {
            assert(values.length === height && values.every(function (v) { return v.length === width; }), 'setValues dimensions');
            beforeWrite(sheet.name);
            values.forEach(function (valuesRow, y) {
                var target = sheet.rows[row + y - 1] || (sheet.rows[row + y - 1] = []);
                valuesRow.forEach(function (value, x) { target[col + x - 1] = value; });
            });
            return this;
        },
        getValue: function () { return this.getValues()[0][0]; },
        setValue: function (value) { this.setValues([[value]]); return this; },
        getRow: function () { return row; },
        getColumn: function () { return col; },
        getLastRow: function () { return row + height - 1; },
        getLastColumn: function () { return col + width - 1; },
        clearContent: function () {
            beforeWrite(sheet.name);
            for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
                if (sheet.rows[row + y - 1]) sheet.rows[row + y - 1][col + x - 1] = '';
            }
        }
    };
};
function beforeWrite(name) {
    if (mock.failWrite === name) { mock.failWrite = ''; throw new Error('Simulated write failure'); }
    mock.writes++;
    mock.writeLog.push({sheet: name, held: mock.held});
}
FakeSheet.prototype.appendRow = function (row) { beforeWrite(this.name); this.rows.push(row.slice()); return this; };
FakeSheet.prototype.deleteRow = function (row) { beforeWrite(this.name); this.rows.splice(row - 1, 1); };
FakeSheet.prototype.deleteRows = function (row, count) { beforeWrite(this.name); this.rows.splice(row - 1, count); };
FakeSheet.prototype.getSheetId = function () { return 99; };
FakeSheet.prototype.getMaxRows = function () { return Math.max(1000, this.rows.length); };
function spreadsheet() { return {getSheetByName: function(name){return mock.sheets[name] || null;}, insertSheet: function(name){beforeWrite(name); return mock.sheets[name] = new FakeSheet(name, []);}, getId: function(){return '1TfROVVl8D3d3UpbwvNADxg7elcCUmbgQZMfTQi8IyQw';}}; }

var SpreadsheetApp = {
    openById: function (id) {
        equal(id, '1TfROVVl8D3d3UpbwvNADxg7elcCUmbgQZMfTQi8IyQw', 'Đọc đúng bảng tính hiện có');
        return spreadsheet();
    },
    getActiveSpreadsheet: spreadsheet,
    getUi: function () { return {
        alert: function (message) { assert(!mock.held, 'Thông báo giao diện chỉ hiện sau khi giải phóng khóa'); mock.alerts.push(message); },
        showModalDialog: function (html, title) { assert(!mock.held, 'Cửa sổ in mở ngoài khóa'); mock.dialogs.push({html: html, title: title}); }
    }; },
    flush: function () {}
};
var HtmlService = {createHtmlOutput: function (html) { return html; }};
var ContentService = {
    MimeType: {JSON: 'application/json', TEXT: 'text/plain'},
    createTextOutput: function (text) {
        return {text: text, mime: '', setMimeType: function (mime) { this.mime = mime; return this; }, getContent: function () { return this.text; }};
    }
};
var Utilities = {
    formatDate: function (date, zone, pattern) {
        equal(zone, 'Asia/Ho_Chi_Minh', 'Dùng múi giờ Việt Nam');
        var parts = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
        function part(type) { return parts.find(function (p) { return p.type === type; }).value; }
        var year = part('year'), month = part('month'), day = part('day');
        if (pattern === 'yyyy-MM-dd') return year + '-' + month + '-' + day;
        if (pattern === 'ddMMyyyy') return day + month + year;
        if (pattern === 'dd/MM/yyyy') return day + '/' + month + '/' + year;
        throw new Error('Unexpected date pattern: ' + pattern);
    }
};
var LockService = {getScriptLock: function () {
    return {
        waitLock: function () { if (mock.held) throw new Error('Lock busy'); mock.held = true; mock.acquires++; },
        tryLock: function () { if (mock.held) return false; mock.held = true; mock.acquires++; return true; },
        hasLock: function () { return mock.held; },
        releaseLock: function () { assert(mock.held, 'Chỉ giải phóng khóa đang giữ'); mock.held = false; mock.releases++; }
    };
}};

