// ===== CẤU HÌNH: dùng đúng bảng tính và hai tab hiện đang lưu hóa đơn =====
const SPREADSHEET_ID = "1TfROVVl8D3d3UpbwvNADxg7elcCUmbgQZMfTQi8IyQw";
const SHEET_HD = "HOADON";
const SHEET_CT = "CHITIET_HD";
const INVOICE_TIME_ZONE = "Asia/Ho_Chi_Minh";

function invoiceJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function invoiceSheets_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID);
  const hd = ss.getSheetByName(SHEET_HD);
  const ct = ss.getSheetByName(SHEET_CT);
  if (!hd || !ct) throw new Error("Không tìm thấy tab HOADON hoặc CHITIET_HD trong bảng tính.");
  return { hd: hd, ct: ct, ss: ss };
}

// Đọc theo đúng thứ tự cột của mã lưu đơn cũ, không đổi tên hoặc sửa tiêu đề.
function invoiceRows_(sheet) {
  const rows = sheet.getDataRange().getValues();
  return rows.filter(function (row, index) {
    if (row.every(function (cell) { return cell === "" || cell == null; })) return false;
    if (index !== 0) return true;
    const first = String(row[0] == null ? "" : row[0]).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
      .replace(/[\s_]+/g, "");
    return ["id", "mahd", "sohd", "mahoadon", "sohoadon", "madon", "madonhang"].indexOf(first) === -1;
  });
}

function invoiceCell_(value) {
  return value == null ? "" : value;
}

function invoiceDate_(value) {
  return value instanceof Date
    ? Utilities.formatDate(value, INVOICE_TIME_ZONE, "yyyy-MM-dd")
    : invoiceCell_(value);
}

// Lấy toàn bộ lịch sử và ghép các mặt hàng theo mã hóa đơn.
function invoiceList_(sheets) {
  const details = new Map();
  invoiceRows_(sheets.ct).forEach(function (row) {
    const id = String(invoiceCell_(row[0])).trim();
    if (!id) throw new Error("CHITIET_HD có dòng dữ liệu thiếu mã hóa đơn.");
    if (!details.has(id)) details.set(id, []);
    details.get(id).push(invoiceDetail_(row));
  });
  let orders = invoiceRows_(sheets.hd).map(function (row) {
    const id = String(invoiceCell_(row[0])).trim();
    if (!id) throw new Error("HOADON có dòng dữ liệu thiếu mã hóa đơn.");
    return {
      id: id, date: invoiceDate_(row[1]), customer: invoiceCell_(row[2]), address: invoiceCell_(row[3]),
      total: invoiceCell_(row[4]), paid: invoiceCell_(row[5]), debt: invoiceCell_(row[6]),
      shipper: invoiceCell_(row[7]), customerId: String(invoiceCell_(row[10])).trim(),
      debtStatementId: String(invoiceCell_(row[11])).trim(), items: details.get(id) || []
    };
  });
  const ss = sheets.ss || (typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp.openById(SPREADSHEET_ID) : null);
  if (typeof customersAttachOrders_ === "function") orders = customersAttachOrders_(ss, orders);
  if (typeof debtApplyPayments_ === "function") orders = debtApplyPayments_(ss, orders);
  return orders;
}

// Hai cách lưu cũ dùng chung CHITIET_HD: luuin.gs ghi 5 cột, websang.gs ghi 6 cột.
// Chỉ đọc theo từng dòng; không sửa hoặc di chuyển dữ liệu lịch sử trong Sheet.
function invoiceDetail_(row) {
  const blank = function (value) { return value == null || String(value).trim() === ""; };
  const moneyLike = function (value) {
    if (blank(value)) return false;
    try { invoiceNumber_(value, "Số tiền"); return true; } catch (err) { return false; }
  };
  const oldFiveColumns = blank(row[5]) && moneyLike(row[3]) && moneyLike(row[4]);
  const unit = oldFiveColumns ? "" : invoiceCell_(row[3]);
  const price = invoiceCell_(row[oldFiveColumns ? 3 : 4]);
  let subtotal = invoiceCell_(row[oldFiveColumns ? 4 : 5]);
  if (blank(subtotal)) {
    // Dòng 6 cột còn thiếu thành tiền vẫn giữ đúng vị trí đơn vị và đơn giá.
    const qty = Number(String(invoiceCell_(row[2])).replace(",", "."));
    if (Number.isFinite(qty) && moneyLike(price)) subtotal = Math.round(qty * invoiceNumber_(price, "Đơn giá"));
  }
  return {name: invoiceCell_(row[1]), qty: invoiceCell_(row[2]), unit: unit, price: price, subtotal: subtotal, productId: String(invoiceCell_(row[6])).trim()};
}

// Mã chính thức được tạo khi lưu; quét toàn bộ mã cùng ngày để không phụ thuộc thứ tự dòng.
// referenceDate cho phép mẫu IN tạo mã đúng ngày ở L1, không phụ thuộc ngày máy chủ.
function generateId(sheet, referenceDate, detailSheet) {
  const selectedDate = referenceDate === undefined ? new Date() : referenceDate;
  if (!(selectedDate instanceof Date) || !Number.isFinite(selectedDate.getTime())) {
    throw new Error("Ngày tạo số hóa đơn không hợp lệ.");
  }
  const date = Utilities.formatDate(selectedDate, INVOICE_TIME_ZONE, "ddMMyyyy");
  const prefix = "HD" + date;
  let max = 0;
  if (detailSheet === undefined) {
    const parent = typeof sheet.getParent === "function" ? sheet.getParent() : SpreadsheetApp.getActiveSpreadsheet();
    detailSheet = parent && parent.getSheetByName(SHEET_CT);
  }
  const reserved = invoiceRows_(sheet).concat(detailSheet ? invoiceRows_(detailSheet) : []);
  reserved.forEach(function (row) {
    const id = String(invoiceCell_(row[0])).trim();
    if (id.indexOf(prefix) !== 0) return;
    const suffix = id.slice(prefix.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  });
  return prefix + String(max + 1).padStart(4, "0");
}

function doGet(e) {
  let lock;
  try {
    const action = e && e.parameter ? e.parameter.action || "" : "";
    if (action && action !== "list" && action !== "inventory" && action !== "customers") throw new Error("Yêu cầu không được hỗ trợ.");
    // Đợi lần ghi đang chạy hoàn tất trước khi đọc cả hóa đơn và chi tiết.
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    if (action === "customers") {
      if (typeof customersGet_ !== "function") throw new Error("Cần bổ sung file customers.gs để sử dụng khách hàng.");
      return invoiceJson_(customersGet_());
    }
    if (action === "inventory") {
      if (typeof inventoryGet_ !== "function") throw new Error("Cần bổ sung file inventory.gs để sử dụng kho.");
      return invoiceJson_(inventoryGet_());
    }
    const sheets = invoiceSheets_();
    if (action === "list") return invoiceJson_({ orders: invoiceList_(sheets) });
    const rows = invoiceRows_(sheets.hd);
    return invoiceJson_({ lastId: rows.length ? String(invoiceCell_(rows[rows.length - 1][0])).trim() : "" });
  } catch (err) {
    return invoiceJson_({ status: "error", message: String(err.message || err) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function invoiceNumber_(value, label) {
  if (value === "" || value == null) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(label + " không hợp lệ.");
    return value;
  }
  const text = String(value).trim();
  // Tương thích số tiền cũ như "1.200.000 đ", "120.000" và số dạng JSON.
  if (!/^-?[\d.,\s]+(?:\s*(?:đ|₫|VND))?$/i.test(text)) throw new Error(label + " không hợp lệ.");
  let digits = text.replace(/[^\d.,]/g, "");
  const decimal = digits.match(/[.,](\d{1,2})$/);
  if (decimal) {
    digits = digits.slice(0, -decimal[0].length).replace(/[.,]/g, "") + "." + decimal[1];
  } else { digits = digits.replace(/[.,]/g, ""); }
  const number = Number(digits) * (text.charAt(0) === "-" ? -1 : 1);
  if (!digits || !Number.isFinite(number)) throw new Error(label + " không hợp lệ.");
  return number;
}

function invoiceValidate_(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Dữ liệu hóa đơn không hợp lệ.");
  const customer = String(data.customer || "").trim();
  if (!customer) throw new Error("Vui lòng nhập tên khách hàng.");
  if (!Array.isArray(data.items) || !data.items.length) throw new Error("Hóa đơn cần ít nhất một mặt hàng.");
  const items = data.items.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Mặt hàng không hợp lệ.");
    const name = String(item.name || "").trim();
    const qty = Number(String(item.qty == null ? "" : item.qty).replace(",", "."));
    const price = invoiceNumber_(item.price, "Đơn giá");
    const productId = String(item.productId || "").trim();
    if (!String(item.unit || "").trim()) throw new Error("Vui lòng nhập đơn vị tính cho mỗi mặt hàng.");
    if ((!name && !productId) || !Number.isFinite(qty) || qty <= 0 || price <= 0) {
      throw new Error("Mỗi mặt hàng cần tên, số lượng và đơn giá lớn hơn 0.");
    }
    const subtotal = item.subtotal === "" || item.subtotal == null
      ? Math.round(qty * price) : invoiceNumber_(item.subtotal, "Thành tiền");
    if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error("Thành tiền không hợp lệ.");
    return {name: name, qty: qty, unit: String(item.unit || "").trim(), price: price, subtotal: subtotal, productId: productId};
  });
  const total = data.total === "" || data.total == null
    ? items.reduce(function (sum, item) { return sum + item.subtotal; }, 0) : invoiceNumber_(data.total, "Tổng tiền");
  const paid = invoiceNumber_(data.paid, "Khách trả");
  const debt = data.debt === "" || data.debt == null ? total - paid : invoiceNumber_(data.debt, "Công nợ");
  if (total < 0 || paid < 0 || !Number.isFinite(total) || !Number.isFinite(debt)) throw new Error("Số tiền không hợp lệ.");
  return {
    date: String(data.date || Utilities.formatDate(new Date(), INVOICE_TIME_ZONE, "dd/MM/yyyy")),
    customer: customer, customerId: String(data.customerId || "").trim(), phone: String(data.phone || "").trim(),
    address: String(data.address || "").trim(), shipper: String(data.shipper || "").trim(),
    total: total, paid: paid, debt: debt, items: items
  };
}

function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Thiếu dữ liệu hóa đơn.");
    // Kiểm tra tất cả mặt hàng trước khi ghi dòng đầu tiên.
    const input = JSON.parse(e.postData.contents);
    if (input && (input.action === "createDebtStatement" || input.action === "payDebtStatement")) {
      if (typeof debtMutate_ !== "function") throw new Error("Cần bổ sung file customer-debt.gs để sử dụng công nợ khách hàng.");
      return invoiceJson_(debtMutate_(input));
    }
    if (input && (input.action === "createProduct" || input.action === "receiveStock")) {
      if (typeof inventoryMutate_ !== "function") throw new Error("Cần bổ sung file inventory.gs để sử dụng kho.");
      return invoiceJson_(inventoryMutate_(input));
    }
    if (input && input.action && input.action !== "saveOrder") throw new Error("Yêu cầu không được hỗ trợ.");
    const data = invoiceValidate_(input);
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const sheets = invoiceSheets_();
    const tracked = typeof inventorySaveSale_ === "function" ? inventorySaveSale_(sheets, data, "", input.requestId) : null;
    if (tracked) return invoiceJson_({status: "success", id: tracked.id, order: tracked});
    if (data.items.some(function (item) { return !item.name; })) throw new Error("Vui lòng nhập tên mặt hàng.");
    const newId = generateId(sheets.hd, undefined, sheets.ct);
    const customer = typeof customersResolve_ === "function" ? customersResolve_(sheets.ss, data, true) : null;
    const statementId = customer && typeof debtStatementForSale_ === "function" ? debtStatementForSale_(sheets.ss, customer.id, data.debt) : "";
    sheets.hd.appendRow([newId, data.date, data.customer, data.address, data.total, data.paid, data.debt, data.shipper, "", "", customer ? customer.id : "", statementId]);
    data.items.forEach(function (item) {
      sheets.ct.appendRow([newId, item.name, item.qty, item.unit, item.price, item.subtotal]);
    });
    SpreadsheetApp.flush();
    return invoiceJson_({ status: "success", id: newId });
  } catch (err) {
    return invoiceJson_({ status: "error", message: String(err.message || err) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
