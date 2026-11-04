// Hồ sơ khách hàng; các hóa đơn cũ được liên kết khi đọc, không sửa lịch sử.
const CUSTOMERS_SHEET_ = "KHACHHANG";
const CUSTOMERS_HEADERS_ = ["customerId", "name", "phone", "address", "createdAt", "legacyKey"];

function customersText_(value) {
  return String(value == null ? "" : value).normalize("NFC").trim().replace(/\s+/g, " ");
}

function customersKey_(name, address) {
  return JSON.stringify([customersText_(name).toLowerCase(), customersText_(address).toLowerCase()]);
}

function customersPhone_(value) {
  const text = customersText_(value);
  if (!text) return "";
  if (!/^\+?[\d\s().-]+$/.test(text)) throw new Error("Số điện thoại khách hàng không hợp lệ.");
  let digits = text.replace(/\D/g, "");
  if (/^84\d{9}$/.test(digits)) digits = "0" + digits.slice(2);
  if (digits.length < 8 || digits.length > 15) throw new Error("Số điện thoại cần từ 8 đến 15 chữ số.");
  return digits;
}

function customersTable_(ss) {
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_);
  if (!sheet) return {sheet: null, rows: []};
  const data = sheet.getDataRange().getValues();
  if (data.every(function (row) { return row.every(function (value) { return value === "" || value == null; }); })) return {sheet: sheet, rows: []};
  CUSTOMERS_HEADERS_.forEach(function (header, index) {
    if (customersText_(data[0][index]).toLowerCase() !== header.toLowerCase()) throw new Error("Tab KHACHHANG sai cấu trúc tại cột " + (index + 1) + ". Không tự ghi đè dữ liệu.");
  });
  return {sheet: sheet, rows: data.slice(1).filter(function (row) { return row.some(function (value) { return value !== "" && value != null; }); })};
}

function customersRegistry_(ss) {
  const ids = new Set(), phones = new Set(), links = new Set();
  return customersTable_(ss).rows.map(function (row) {
    const customer = {id: customersText_(row[0]), name: customersText_(row[1]), phone: customersPhone_(row[2]),
      address: customersText_(row[3]), createdAt: String(row[4] || ""), legacyKey: String(row[5] || ""), legacy: false};
    if (!/^KH\d+$/.test(customer.id) || !customer.name || ids.has(customer.id) ||
        (customer.phone && phones.has(customer.phone)) || (customer.legacyKey && links.has(customer.legacyKey))) {
      throw new Error("KHACHHANG có mã, số điện thoại hoặc liên kết lịch sử trùng/không hợp lệ. Kiểm tra lại dữ liệu.");
    }
    ids.add(customer.id);
    if (customer.phone) phones.add(customer.phone);
    if (customer.legacyKey) links.add(customer.legacyKey);
    return customer;
  });
}

function customersVirtualId_(key) { return "LEGACY:" + encodeURIComponent(key); }

function customersAttachOrders_(ss, orders) {
  const registry = customersRegistry_(ss), byId = new Map(), byKey = new Map();
  registry.forEach(function (customer) {
    byId.set(customer.id, customer);
    if (customer.legacyKey) byKey.set(customer.legacyKey, customer);
  });
  return orders.map(function (order) {
    const key = customersKey_(order.customer, order.address);
    const customer = order.customerId ? byId.get(order.customerId) : byKey.get(key);
    if (order.customerId && !customer) throw new Error("Hóa đơn " + order.id + " tham chiếu mã khách hàng không còn trong danh mục.");
    return Object.assign({}, order, {customerId: customer ? customer.id : customersText_(order.customer) ? customersVirtualId_(key) : "",
      phone: customer ? customer.phone : ""});
  });
}

function customersContext_(ss) {
  const registry = customersRegistry_(ss), customers = registry.slice(), byId = new Map();
  customers.forEach(function (customer) { byId.set(customer.id, customer); });
  const orders = invoiceList_(invoiceSheets_(ss));
  orders.forEach(function (order) {
    if (!order.customerId || byId.has(order.customerId)) return;
    const customer = {id: order.customerId, name: customersText_(order.customer), phone: "", address: customersText_(order.address),
      createdAt: "", legacyKey: customersKey_(order.customer, order.address), legacy: true};
    byId.set(customer.id, customer); customers.push(customer);
  });
  return {customers: customers, orders: orders};
}

function customersResolve_(ss, data, create) {
  const registry = customersRegistry_(ss);
  let id = customersText_(data.customerId), name = customersText_(data.customer || data.name);
  let address = customersText_(data.address), phone = customersPhone_(data.phone), legacyKey = "", distinctPhone = false;
  const sameName = function (customer) { return customer.name.toLowerCase() === name.toLowerCase(); };
  if (id.indexOf("LEGACY:") === 0) {
    let key;
    try { key = decodeURIComponent(id.slice(7)); } catch (error) { throw new Error("Mã khách hàng lịch sử không hợp lệ."); }
    const existing = registry.find(function (customer) { return customer.legacyKey === key; });
    if (existing) id = existing.id;
    else {
      const candidates = invoiceRows_(invoiceSheets_(ss).hd).filter(function (row) {
        return !String(row[10] || "").trim() && customersText_(row[2]) && customersKey_(row[2], row[3]) === key;
      });
      if (!candidates.length || customersVirtualId_(key) !== id) throw new Error("Không tìm thấy khách hàng lịch sử cần liên kết.");
      if (name && name.toLowerCase() !== customersText_(candidates[0][2]).toLowerCase()) throw new Error("Thông tin không khớp khách hàng lịch sử đã chọn.");
      name = customersText_(candidates[0][2]); address = customersText_(candidates[0][3]); legacyKey = key; id = "";
    }
  }
  let current = id ? registry.find(function (customer) { return customer.id === id; }) : null;
  if (id && !current) throw new Error("Mã khách hàng không tồn tại. Chọn lại khách hàng.");
  if (current) {
    if (name && !sameName(current)) throw new Error("Tên không khớp mã khách hàng đã chọn.");
    if (phone && current.phone && phone !== current.phone) throw new Error("Số điện thoại không khớp khách hàng đã chọn.");
  } else {
    if (!name) throw new Error("Vui lòng nhập tên khách hàng.");
    const key = customersKey_(name, address);
    if (phone) {
      current = registry.find(function (customer) { return customer.phone === phone; });
      if (current && !sameName(current)) throw new Error("Số điện thoại đã thuộc khách hàng khác. Chọn đúng mã khách hàng.");
    }
    if (!current) {
      const matches = registry.filter(function (customer) { return customersKey_(customer.name, customer.address) === key; });
      if (phone && matches.length && matches.every(function (customer) { return customer.phone && customer.phone !== phone; })) {
        distinctPhone = true;
      } else if (matches.length > 1) {
        throw new Error("Thông tin trùng khách hàng khác. Hãy chọn đúng mã khách hàng để tránh gộp công nợ.");
      } else current = matches[0] || null;
    }
    if (!current) legacyKey = distinctPhone ? "" : legacyKey || key;
  }
  if (current) {
    if (phone && !current.phone) {
      const duplicate = registry.find(function (customer) { return customer.id !== current.id && customer.phone === phone; });
      if (duplicate) throw new Error("Số điện thoại đã được sử dụng bởi khách hàng khác.");
      if (create) {
        const table = customersTable_(ss), index = table.sheet.getDataRange().getValues().findIndex(function (row) { return String(row[0]) === current.id; });
        table.sheet.getRange(index + 1, 3).setValue(phone);
        current.phone = phone;
      }
    }
    return current;
  }
  const customer = {id: "", name: name, phone: phone, address: address, createdAt: new Date().toISOString(), legacyKey: legacyKey, legacy: false};
  if (!create) return customer;
  const max = registry.reduce(function (max, entry) { return Math.max(max, Number(entry.id.slice(2))); }, 0);
  if (!Number.isSafeInteger(max + 1)) throw new Error("Không thể cấp thêm mã khách hàng an toàn. Kiểm tra mã trong danh mục.");
  customer.id = "KH" + String(max + 1).padStart(6, "0");
  const table = customersTable_(ss), sheet = table.sheet || ss.insertSheet(CUSTOMERS_SHEET_);
  if (!sheet.getLastRow()) sheet.appendRow(CUSTOMERS_HEADERS_.slice());
  sheet.appendRow([customer.id, customer.name, customer.phone, customer.address, customer.createdAt, customer.legacyKey]);
  SpreadsheetApp.flush();
  return customer;
}

function customersGet_(ss) {
  ss = ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const context = customersContext_(ss);
  const debt = typeof debtGet_ === "function" ? debtGet_(ss, context.orders, context.customers) : {statements: [], payments: []};
  context.customers = context.customers.map(function (customer) {
    const orders = context.orders.filter(function (order) { return order.customerId === customer.id; });
    return Object.assign({}, customer, {orderCount: orders.length,
      total: orders.reduce(function (sum, order) { return sum + invoiceNumber_(order.total, "Tổng tiền"); }, 0),
      paid: orders.reduce(function (sum, order) { return sum + invoiceNumber_(order.paid, "Khách trả"); }, 0),
      debt: orders.reduce(function (sum, order) { return sum + Math.max(0, invoiceNumber_(order.debt, "Công nợ")); }, 0),
      credit: orders.reduce(function (sum, order) { return sum + Math.max(0, -invoiceNumber_(order.debt, "Công nợ")); }, 0)});
  });
  return Object.assign({schemaVersion: 1}, context, debt);
}
