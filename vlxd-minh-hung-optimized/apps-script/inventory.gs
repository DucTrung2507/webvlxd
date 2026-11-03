// Ba tab riêng cho danh mục và nhập kho; không dùng lại NHAPHANG/KHO/TKNHAPHANG cũ.
const inventoryTables_ = {
  products: {name: "MATHANG", headers: ["productId", "name", "type", "price", "requestId", "requestHash"]},
  receipts: {name: "NHAPKHO", headers: ["id", "date", "supplier", "address", "total", "paid", "debt", "requestId", "requestHash"]},
  details: {name: "CT_NHAPKHO", headers: ["receiptId", "productId", "name", "qty", "unit", "price", "subtotal"]}
};

function inventoryName_(value) {
  return String(value == null ? "" : value).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function inventoryRead_(ss, key) {
  const schema = inventoryTables_[key];
  const sheet = ss.getSheetByName(schema.name);
  if (!sheet) return {sheet: null, rows: []};
  const data = sheet.getDataRange().getValues();
  if (data.every(function (row) { return row.every(function (v) { return v === "" || v == null; }); })) return {sheet: sheet, rows: []};
  schema.headers.forEach(function (header, index) {
    if (inventoryName_(data[0][index]) !== inventoryName_(header)) {
      throw new Error("Tab " + schema.name + " có cấu trúc khác dự kiến tại cột " + (index + 1) + ". Không tự ghi đè dữ liệu hiện có.");
    }
  });
  return {sheet: sheet, rows: data.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== "" && value != null; });
  })};
}

function inventoryEnsure_(ss, key) {
  const table = inventoryRead_(ss, key);
  const schema = inventoryTables_[key];
  const sheet = table.sheet || ss.insertSheet(schema.name);
  if (!sheet.getLastRow()) sheet.appendRow(schema.headers.slice());
  return sheet;
}

function inventoryProducts_(ss) {
  const ids = new Set();
  const names = new Set();
  return inventoryRead_(ss, "products").rows.map(function (row) {
    const id = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    const type = String(row[2] || "").trim();
    const price = invoiceNumber_(row[3], "Giá mặt hàng");
    if (!id || !name || !type || price <= 0 || ids.has(id) || names.has(inventoryName_(name))) {
      throw new Error("Danh mục MATHANG có mã/tên trùng hoặc mặt hàng chưa hợp lệ. Kiểm tra lại danh mục.");
    }
    ids.add(id); names.add(inventoryName_(name));
    return {id: id, name: name, type: type, price: price};
  });
}

function inventoryReceipts_(ss) {
  const details = new Map();
  inventoryRead_(ss, "details").rows.forEach(function (row) {
    const id = String(row[0] || "").trim();
    if (!details.has(id)) details.set(id, []);
    details.get(id).push({productId: String(row[1] || "").trim(), name: String(row[2] || ""),
      qty: inventoryQuantity_(row[3]), unit: String(row[4] || ""), price: invoiceNumber_(row[5], "Đơn giá nhập"),
      subtotal: invoiceNumber_(row[6], "Thành tiền nhập")});
  });
  const ids = new Set();
  return inventoryRead_(ss, "receipts").rows.map(function (row) {
    const id = String(row[0] || "").trim();
    if (!id || ids.has(id)) throw new Error("NHAPKHO có dòng thiếu mã hoặc trùng mã phiếu.");
    ids.add(id);
    return {id: id, date: invoiceDate_(row[1]), supplier: String(row[2] || ""), address: String(row[3] || ""),
      total: invoiceNumber_(row[4], "Tổng tiền nhập"), paid: invoiceNumber_(row[5], "Đã trả nhà cung cấp"),
      debt: invoiceNumber_(row[6], "Công nợ nhà cung cấp"), requestId: String(row[7] || ""), items: details.get(id) || []};
  });
}

// Số lượng kho dùng số nguyên đơn vị 1/1.000.000, không cấp thêm tồn do sai số số thực.
const INVENTORY_QTY_SCALE = 1000000;

function inventoryQuantityUnits_(value) {
  const text = String(value == null ? "" : value).trim().replace(",", ".");
  const number = Number(text);
  const parts = text.match(/^\+?(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!parts || !Number.isFinite(number) || number <= 0) throw new Error("Số lượng phải là số lớn hơn 0.");
  const digits = (parts[1] + (parts[2] || "")).replace(/^0+/, "") || "0";
  const shift = Number(parts[3] || 0) - (parts[2] || "").length + 6;
  let units;
  if (shift >= 0) {
    if (digits.length + shift > 16) throw new Error("Số lượng quá lớn để theo dõi tồn kho chính xác.");
    units = Number(digits + "0".repeat(shift));
  } else {
    const cut = -shift;
    const head = cut >= digits.length ? "0" : digits.slice(0, -cut);
    const tail = cut >= digits.length ? digits : digits.slice(-cut);
    if (/^0+$/.test(tail)) {
      units = Number(head);
    } else {
      // Chỉ bỏ nhiễu IEEE-754 của giá trị Number, ví dụ 0.1 + 0.2.
      // Chuỗi người dùng nhập nhiều hơn 6 chữ số thập phân luôn bị từ chối.
      const scaled = number * INVENTORY_QTY_SCALE;
      const rounded = Math.round(scaled);
      const tolerance = Math.min(0.000001, Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4);
      if (typeof value !== "number" || Math.abs(scaled - rounded) > tolerance) {
        throw new Error("Số lượng chỉ được có tối đa 6 chữ số thập phân (nhỏ nhất 0,000001).");
      }
      units = rounded;
    }
  }
  if (!Number.isSafeInteger(units)) throw new Error("Số lượng quá lớn để theo dõi tồn kho chính xác.");
  if (units <= 0) throw new Error("Số lượng nhỏ nhất là 0,000001.");
  if (Math.round((units / INVENTORY_QTY_SCALE) * INVENTORY_QTY_SCALE) !== units) {
    throw new Error("Số lượng quá lớn để theo dõi tồn kho chính xác.");
  }
  return units;
}

function inventoryQuantity_(value) {
  return inventoryQuantityUnits_(value) / INVENTORY_QTY_SCALE;
}

function inventoryAddUnits_(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(total)) {
    throw new Error("Tổng số lượng quá lớn để theo dõi tồn kho chính xác.");
  }
  return total;
}

function inventoryStockUnits_(ss, products, receipts) {
  const balances = new Map(products.map(function (product) { return [product.id, 0]; }));
  function apply(id, units) {
    if (!balances.has(id)) throw new Error("Chứng từ kho tham chiếu mã mặt hàng không còn trong danh mục: " + id);
    balances.set(id, inventoryAddUnits_(balances.get(id), units));
  }
  receipts.forEach(function (receipt) {
    receipt.items.forEach(function (item) { apply(item.productId, inventoryQuantityUnits_(item.qty)); });
  });
  const hd = ss.getSheetByName(SHEET_HD);
  const ct = ss.getSheetByName(SHEET_CT);
  if (hd && ct) {
    const committed = new Set(invoiceRows_(hd).map(function (row) { return String(row[0] || "").trim(); }));
    invoiceRows_(ct).forEach(function (row) {
      const productId = String(row[6] || "").trim();
      // Không đoán tên hàng lịch sử thành xuất kho; chỉ trừ dòng có productId và hóa đơn đã hoàn tất.
      if (productId && committed.has(String(row[0] || "").trim())) apply(productId, -inventoryQuantityUnits_(row[2]));
    });
  }
  return balances;
}

function inventoryStock_(ss, products, receipts) {
  const balances = inventoryStockUnits_(ss, products, receipts);
  return products.map(function (product) {
    return {productId: product.id, name: product.name, qty: balances.get(product.id) / INVENTORY_QTY_SCALE};
  });
}

function inventoryGet_(ss) {
  ss = ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = inventoryProducts_(ss);
  const receipts = inventoryReceipts_(ss);
  return {products: products, receipts: receipts, stock: inventoryStock_(ss, products, receipts),
    lastReceiptId: receipts.length ? receipts[receipts.length - 1].id : ""};
}

function inventoryRequest_(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 160) throw new Error("Mã yêu cầu lưu không hợp lệ.");
  return value.trim();
}

function inventoryReplay_(rows, column, requestId, hash) {
  if (!requestId) return null;
  const match = rows.find(function (row) { return String(row[column] || "") === requestId; });
  if (match && String(match[column + 1] || "") !== hash) {
    throw new Error("Yêu cầu này đã lưu với nội dung khác. Tạo yêu cầu mới để lưu thay đổi.");
  }
  return match || null;
}

function inventoryDateKey_(value) {
  return Utilities.formatDate(value === undefined || value === "" ? new Date() : invoiceInDate_(value), INVOICE_TIME_ZONE, "yyyy-MM-dd");
}

function inventoryNextId_(prefix, tables) {
  let max = 0;
  tables.forEach(function (rows) {
    rows.forEach(function (row) {
      const id = String(row[0] || "").trim();
      const tail = id.indexOf(prefix) === 0 ? id.slice(prefix.length) : "";
      if (/^\d+$/.test(tail)) max = Math.max(max, Number(tail));
    });
  });
  return prefix + String(max + 1).padStart(prefix === "SP" ? 6 : 4, "0");
}

function inventoryPrepareItems_(items, products, allowName) {
  if (!Array.isArray(items) || !items.length) throw new Error("Chứng từ cần ít nhất một mặt hàng.");
  return items.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Mặt hàng không hợp lệ.");
    const id = String(item.productId || "").trim();
    const product = id ? products.find(function (p) { return p.id === id; }) : allowName
      ? products.find(function (p) { return inventoryName_(p.name) === inventoryName_(item.name); }) : null;
    if (!product) throw new Error("Mặt hàng " + (item.name || id || "đang chọn") + " chưa có trong danh mục. Hãy chọn đúng mặt hàng.");
    const qty = inventoryQuantity_(item.qty);
    const price = invoiceNumber_(item.price, "Đơn giá");
    const subtotal = Math.round(qty * price);
    if (price <= 0 || !Number.isFinite(subtotal)) throw new Error("Đơn giá và thành tiền phải hợp lệ, đơn giá lớn hơn 0.");
    return {productId: product.id, name: product.name, qty: qty, unit: String(item.unit || "").trim(), price: price, subtotal: subtotal};
  });
}

// Tên hàng do danh mục cung cấp có thể đổi sau này; mã yêu cầu giữ nguyên ý định gốc.
function inventoryHash_(canonical) {
  return JSON.stringify(Object.assign({}, canonical, {items: canonical.items.map(function (item) {
    return {productId: item.productId, qty: item.qty, unit: item.unit, price: item.price};
  })}));
}

function inventoryTotals_(items, paid) {
  const total = items.reduce(function (sum, item) { return sum + item.subtotal; }, 0);
  paid = invoiceNumber_(paid, "Số tiền đã trả");
  if (!Number.isFinite(total) || paid < 0) throw new Error("Số tiền không hợp lệ.");
  return {total: total, paid: paid, debt: total - paid};
}

function inventoryMutate_(data) {
  let lock;
  try {
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const products = inventoryProducts_(ss);
    const requestId = inventoryRequest_(data.requestId);
    if (data.action === "createProduct") {
      const name = String(data.name || "").trim().replace(/\s+/g, " ");
      const type = String(data.type || "").trim();
      const price = invoiceNumber_(data.price, "Giá mặt hàng");
      if (!name || !type || price <= 0) throw new Error("Nhập tên, loại mặt hàng và giá lớn hơn 0.");
      const hash = JSON.stringify({name: name, type: type, price: price});
      const rows = inventoryRead_(ss, "products").rows;
      const replay = inventoryReplay_(rows, 4, requestId, hash);
      if (replay) return {status: "success", product: products.find(function (p) { return p.id === String(replay[0]); })};
      if (products.some(function (p) { return inventoryName_(p.name) === inventoryName_(name); })) throw new Error("Tên mặt hàng đã có trong danh mục.");
      const product = {id: inventoryNextId_("SP", [rows]), name: name, type: type, price: price};
      inventoryEnsure_(ss, "products").appendRow([product.id, name, type, price, requestId, hash]);
      SpreadsheetApp.flush();
      return {status: "success", product: product};
    }
    if (data.action !== "receiveStock") throw new Error("Yêu cầu kho không được hỗ trợ.");
    const supplier = String(data.supplier || "").trim();
    if (!supplier) throw new Error("Vui lòng nhập tên nhà cung cấp.");
    const date = inventoryDateKey_(data.date);
    const address = String(data.address || "").trim();
    const items = inventoryPrepareItems_(data.items, products, false);
    const amounts = inventoryTotals_(items, data.paid);
    const canonical = {date: date, supplier: supplier, address: address, paid: amounts.paid, items: items};
    const hash = inventoryHash_(canonical);
    const headers = inventoryRead_(ss, "receipts").rows;
    const replay = inventoryReplay_(headers, 7, requestId, hash);
    if (replay) {
      const receipts = inventoryReceipts_(ss);
      return {status: "success", receipt: receipts.find(function (r) { return r.id === String(replay[0]); }), stock: inventoryStock_(ss, products, receipts)};
    }
    // Kiểm tra giới hạn tổng tồn trước khi ghi bất kỳ dòng nào của phiếu mới.
    inventoryStockUnits_(ss, products, inventoryReceipts_(ss).concat([{items: items}]));
    const prefix = "NK" + date.split("-").reverse().join("");
    const id = inventoryNextId_(prefix, [headers, inventoryRead_(ss, "details").rows]);
    const ct = inventoryEnsure_(ss, "details");
    const hd = inventoryEnsure_(ss, "receipts");
    // Chi tiết chưa có header tương ứng là bản ghi chưa hoàn tất, không cộng tồn kho.
    items.forEach(function (item) { ct.appendRow([id, item.productId, item.name, item.qty, item.unit, item.price, item.subtotal]); });
    SpreadsheetApp.flush();
    hd.appendRow([id, date, supplier, address, amounts.total, amounts.paid, amounts.debt, requestId, hash]);
    SpreadsheetApp.flush();
    const receipt = Object.assign({id: id, requestId: requestId}, canonical, amounts);
    const receipts = inventoryReceipts_(ss);
    return {status: "success", receipt: receipt, stock: inventoryStock_(ss, products, receipts)};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

// Gọi khi đã giữ cùng script lock với thao tác lưu hóa đơn/phiếu nhập.
// Trả null để giữ luồng cũ nếu danh mục chưa có mặt hàng.
function inventorySaveSale_(sheets, data, fixedId, requestId) {
  const ss = sheets.ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = inventoryProducts_(ss);
  if (!products.length) {
    const incomingId = data.items.some(function (item) { return String(item.productId || "").trim(); });
    const receiptData = inventoryRead_(ss, "receipts").rows.length || inventoryRead_(ss, "details").rows.length;
    const trackedSales = invoiceRows_(sheets.ct).some(function (row) { return String(row[6] || "").trim(); });
    if (incomingId || receiptData || trackedSales) {
      throw new Error("Danh mục mặt hàng đang trống nhưng đã có dữ liệu kho hoặc mã mặt hàng. Khôi phục danh mục trước khi lưu hóa đơn.");
    }
    return null;
  }
  const items = inventoryPrepareItems_(data.items, products, true);
  const amounts = inventoryTotals_(items, data.paid);
  const canonical = {date: inventoryDateKey_(data.date), customer: String(data.customer || "").trim(),
    address: String(data.address || "").trim(), shipper: String(data.shipper || "").trim(), paid: amounts.paid, items: items};
  const hash = inventoryHash_(canonical);
  requestId = inventoryRequest_(requestId);
  const invoiceRows = invoiceRows_(sheets.hd);
  const replay = inventoryReplay_(invoiceRows, 8, requestId, hash);
  if (replay) {
    return invoiceList_(sheets).find(function (order) { return order.id === String(replay[0]); });
  }
  const balances = inventoryStockUnits_(ss, products, inventoryReceipts_(ss));
  const needed = new Map();
  items.forEach(function (item) {
    needed.set(item.productId, inventoryAddUnits_(needed.get(item.productId) || 0, inventoryQuantityUnits_(item.qty)));
  });
  needed.forEach(function (units, id) {
    const balance = balances.get(id);
    if (balance === undefined || units > balance) {
      throw new Error("Không đủ tồn kho cho " + products.find(function (p) { return p.id === id; }).name + ". Còn " + (balance === undefined ? 0 : balance / INVENTORY_QTY_SCALE) + ".");
    }
  });
  const detailRows = invoiceRows_(sheets.ct);
  const id = fixedId || generateId(sheets.hd, undefined, sheets.ct);
  if (fixedId && invoiceRows.concat(detailRows).some(function (row) { return String(row[0] || "").trim() === id; })) {
    throw new Error("Số hóa đơn đã tồn tại hoặc có lần lưu chưa hoàn tất. Hãy tạo số hóa đơn mới.");
  }
  inventorySaleColumns_(sheets);
  items.forEach(function (item) {
    sheets.ct.appendRow([id, item.name, item.qty, item.unit, item.price, item.subtotal, item.productId]);
  });
  SpreadsheetApp.flush();
  sheets.hd.appendRow([id, canonical.date, canonical.customer, canonical.address, amounts.total, amounts.paid, amounts.debt, canonical.shipper, requestId, hash]);
  SpreadsheetApp.flush();
  return Object.assign({id: id, requestId: requestId}, canonical, amounts);
}

function inventorySaleColumns_(sheets) {
  // Chỉ thêm nhãn metadata khi dòng đầu là tiêu đề; không đè lên dữ liệu headerless.
  const updates = [];
  [[sheets.hd, 9, ["requestId", "requestHash"]], [sheets.ct, 7, ["productId"]]].forEach(function (entry) {
    const sheet = entry[0];
    if (!sheet.getLastRow()) return;
    const row = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), entry[1] + entry[2].length - 1)).getValues()[0];
    if (invoiceRows_({getDataRange: function () { return {getValues: function () { return [row]; }}; }}).length) return;
    entry[2].forEach(function (header, index) {
      const current = row[entry[1] - 1 + index];
      if (current && inventoryName_(current) !== inventoryName_(header)) {
        throw new Error("Cột mới của " + sheet.getName() + " đang có dữ liệu khác. Cần kiểm tra trước khi lưu kho.");
      }
      if (!current) updates.push({sheet: sheet, column: entry[1] + index, header: header});
    });
  });
  updates.forEach(function (update) { update.sheet.getRange(1, update.column).setValue(update.header); });
}
