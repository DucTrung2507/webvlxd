// Mỗi lần sửa là một dòng hoàn chỉnh; không sửa/xóa HOADON hoặc CHITIET_HD gốc.
const INVOICE_EDIT_SHEET_ = "SUAHOADON";
const INVOICE_EDIT_HEADERS_ = ["orderId", "version", "order", "requestId", "requestHash", "baseVersion", "createdAt"];

function invoiceEdits_(ss) {
  const sheet = ss.getSheetByName(INVOICE_EDIT_SHEET_);
  if (!sheet) return {sheet: null, rows: [], latest: new Map()};
  const values = sheet.getDataRange().getValues();
  if (values.every(function (row) { return row.every(function (value) { return value === "" || value == null; }); })) return {sheet: sheet, rows: [], latest: new Map()};
  INVOICE_EDIT_HEADERS_.forEach(function (header, index) {
    if (String(values[0][index] || "").trim() !== header) throw new Error("Tab SUAHOADON sai cấu trúc cột " + (index + 1) + ". Không ghi đè lịch sử chỉnh sửa.");
  });
  const latest = new Map(), requests = new Set();
  const rows = values.slice(1).filter(function (row) { return row.some(function (value) { return value !== "" && value != null; }); });
  rows.forEach(function (row) {
    const id = String(row[0] || "").trim(), version = Number(row[1]), baseVersion = Number(row[5]), requestId = String(row[3] || "");
    let order;
    try { order = JSON.parse(String(row[2])); } catch (error) { throw new Error("Lịch sử sửa hóa đơn chứa JSON không hợp lệ."); }
    const previous = latest.get(id);
    if (!id || !Number.isSafeInteger(version) || version <= 0 || baseVersion !== (previous ? previous.version : 0) || version !== baseVersion + 1 ||
        !requestId || requests.has(requestId) || !String(row[4] || "") || !order || order.id !== id || order.version !== version ||
        !Array.isArray(order.items) || !order.items.length || !String(order.customer || "").trim()) {
      throw new Error("Lịch sử chỉnh sửa hóa đơn thiếu dữ liệu, trùng yêu cầu hoặc sai phiên bản.");
    }
    const total = order.items.reduce(function (sum, item) {
      if (!item || !String(item.productId || "").trim() || !String(item.name || "").trim() || !String(item.unit || "").trim()) throw new Error("Chi tiết lịch sử sửa hóa đơn thiếu mặt hàng hoặc đơn vị.");
      const qty = inventoryQuantity_(item.qty), price = invoiceNumber_(item.price, "Đơn giá lịch sử sửa");
      const subtotal = Math.round(qty * price);
      if (price <= 0 || !Number.isFinite(subtotal) || subtotal !== invoiceNumber_(item.subtotal, "Thành tiền lịch sử sửa")) throw new Error("Chi tiết lịch sử sửa hóa đơn không khớp thành tiền.");
      return sum + subtotal;
    }, 0);
    const paid = invoiceNumber_(order.paid, "Tiền trả lịch sử sửa");
    if (!Number.isFinite(total) || paid < 0 || total !== invoiceNumber_(order.total, "Tổng lịch sử sửa") ||
        total - paid !== invoiceNumber_(order.debt, "Nợ lịch sử sửa")) throw new Error("Tổng tiền lịch sử chỉnh sửa hóa đơn không khớp.");
    requests.add(requestId); latest.set(id, order);
  });
  return {sheet: sheet, rows: rows, latest: latest};
}

function invoiceRevisionOrders_(ss, orders) {
  const edits = invoiceEdits_(ss), ids = new Set(orders.map(function (order) { return order.id; }));
  edits.latest.forEach(function (_, id) { if (!ids.has(id)) throw new Error("Lịch sử sửa tham chiếu hóa đơn không còn tồn tại: " + id); });
  return orders.map(function (order) {
    const revision = edits.latest.get(order.id);
    return Object.assign({}, order, revision || {}, {version: revision ? revision.version : 0, canEdit: true, editBlockedReason: ""});
  });
}

function invoiceRevisionSales_(ss, sales, committed) {
  const edits = invoiceEdits_(ss);
  const result = sales.filter(function (row) { return !edits.latest.has(String(row[0] || "").trim()); });
  edits.latest.forEach(function (order, id) {
    if (!committed.has(id)) throw new Error("Lịch sử sửa tham chiếu hóa đơn không còn tồn tại: " + id);
    order.items.forEach(function (item) { result.push([id, item.name, item.qty, item.unit, item.price, item.subtotal, item.productId]); });
  });
  return result;
}

function invoiceEditHash_(id, baseVersion, data) {
  return JSON.stringify({id: id, baseVersion: baseVersion, customer: String(data.customer || "").trim(),
    customerId: String(data.customerId || "").trim(), phone: typeof customersPhone_ === "function" ? customersPhone_(data.phone) : String(data.phone || "").trim(),
    address: String(data.address || "").trim(), shipper: String(data.shipper || "").trim(), paid: invoiceNumber_(data.paid, "Khách trả"),
    items: data.items.map(function (item) { return {productId: String(item.productId || "").trim(),
      name: item.productId ? "" : inventoryName_(item.name), qty: inventoryQuantity_(item.qty),
      unit: inventoryName_(item.unit), price: invoiceNumber_(item.price, "Đơn giá")}; })});
}

function invoiceUpdate_(input) {
  let lock;
  try {
    const id = String(input.id || "").trim(), baseVersion = Number(input.baseVersion);
    const requestId = inventoryRequest_(input.requestId);
    if (!id || !requestId || input.baseVersion === undefined || !Number.isSafeInteger(baseVersion) || baseVersion < 0) throw new Error("Cần mã hóa đơn, phiên bản và mã yêu cầu để lưu chỉnh sửa.");
    const data = invoiceValidate_(input), hash = invoiceEditHash_(id, baseVersion, data);
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID), edits = invoiceEdits_(ss), sheets = invoiceSheets_(ss);
    const replay = edits.rows.find(function (row) { return String(row[3] || "") === requestId; });
    if (replay) {
      if (String(replay[4] || "") !== hash) throw new Error("Yêu cầu chỉnh sửa đã lưu với nội dung khác. Hãy tải lại hóa đơn.");
      return {status: "success", order: invoiceList_(sheets).find(function (order) { return order.id === id; }), replayedVersion: Number(replay[1])};
    }
    const orders = invoiceList_(sheets), current = orders.find(function (order) { return order.id === id; });
    if (!current) throw new Error("Không tìm thấy hóa đơn cần chỉnh sửa.");
    if ((current.version || 0) !== baseVersion) throw new Error("Hóa đơn đã được chỉnh sửa ở nơi khác. Hãy đóng và mở lại để tải bản mới nhất.");
    if (current.canEdit === false) throw new Error(current.editBlockedReason || "Hóa đơn này đã tất toán, không thể chỉnh sửa.");
    const debt = typeof debtState_ === "function" ? debtState_(ss, orders) : null;
    const statement = debt && debt.statements.find(function (entry) { return entry.id === debt.owner.get(id); });
    const customerInput = Object.assign({}, data);
    if (statement) {
      if (data.customerId && data.customerId !== current.customerId) throw new Error("Không đổi khách hàng của hóa đơn đã gộp công nợ.");
      customerInput.customerId = current.customerId;
    }
    const customer = typeof customersResolve_ === "function" ? customersResolve_(ss, customerInput, false) : null;
    const products = inventoryProducts_(ss), receipts = inventoryReceipts_(ss);
    const items = inventoryPrepareItems_(data.items, products, true, false), amounts = inventoryTotals_(items, data.paid);
    const otherSales = inventoryCommittedSales_(ss).filter(function (row) { return String(row[0] || "").trim() !== id; });
    const balances = inventoryStockUnits_(ss, products, receipts, otherSales), needed = new Map();
    items.forEach(function (item) {
      const product = products.find(function (entry) { return entry.id === item.productId; });
      const key = inventoryStockKey_(product.id, product.baseUnit);
      needed.set(key, inventoryAddUnits_(needed.get(key) || 0, inventoryBaseQuantityUnits_(product, item.unit, item.qty)));
    });
    needed.forEach(function (units, key) {
      if (units > (balances.get(key) || 0)) {
        const product = products.find(function (entry) { return entry.id === JSON.parse(key)[0]; });
        throw new Error("Không đủ tồn kho cho " + product.name + " khi chỉnh sửa. Có thể dùng tối đa " + (balances.get(key) || 0) / INVENTORY_QTY_SCALE + " " + product.baseUnit + ".");
      }
    });
    const next = Object.assign({id: current.id, date: current.date, customer: data.customer, address: data.address, shipper: data.shipper,
      customerId: customer ? customer.id : "", phone: customer ? customer.phone : "", items: items,
      debtStatementId: current.debtStatementId || "", version: baseVersion + 1}, amounts);
    if (!statement && debt && next.debt > 0 && next.customerId) {
      const open = debt.statements.find(function (entry) { return entry.customerId === next.customerId && entry.status === "open"; });
      next.debtStatementId = open ? open.id : "";
    }
    if (statement && next.debt <= 0) throw new Error("Hóa đơn đã gộp công nợ phải giữ khoản nợ dương. Dùng Thu tiền để tất toán.");
    if (debt) {
      try { debtState_(ss, orders.map(function (order) { return order.id === id ? next : order; })); }
      catch (error) {
        if (/thiếu bản chốt tất toán/.test(error.message)) throw new Error("Không thể chỉnh sửa làm tất toán phiếu công nợ. Dùng Thu tiền để ghi nhận thanh toán.");
        throw error;
      }
    }
    // Sau mọi kiểm tra mới ghi hồ sơ khách và một dòng revision hoàn chỉnh.
    if (customer) {
      const savedCustomer = customersResolve_(ss, customerInput, true);
      next.customerId = savedCustomer.id; next.phone = savedCustomer.phone;
    }
    const table = invoiceEdits_(ss), sheet = table.sheet || ss.insertSheet(INVOICE_EDIT_SHEET_);
    if (!sheet.getLastRow()) sheet.appendRow(INVOICE_EDIT_HEADERS_.slice());
    sheet.appendRow([id, next.version, JSON.stringify(next), requestId, hash, baseVersion, new Date().toISOString()]);
    SpreadsheetApp.flush();
    const saved = invoiceList_(sheets).find(function (order) { return order.id === id; });
    return {status: "success", order: saved, stock: inventoryStock_(ss, products, receipts)};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
