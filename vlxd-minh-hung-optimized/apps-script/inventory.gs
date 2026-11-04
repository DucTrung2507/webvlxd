// Ba tab riêng cho danh mục và nhập kho; không dùng lại NHAPHANG/KHO/TKNHAPHANG cũ.
const inventoryTables_ = {
  products: {name: "MATHANG", headers: ["productId", "name", "type", "price", "requestId", "requestHash", "units", "status", "legacyUnit", "baseUnit"], legacyColumns: 6},
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
    if (schema.legacyColumns && index >= schema.legacyColumns && !data[0][index]) return;
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
  else if (schema.legacyColumns) {
    schema.headers.slice(schema.legacyColumns).forEach(function (header, i) {
      const cell = sheet.getRange(1, schema.legacyColumns + i + 1);
      if (!cell.getValue()) cell.setValue(header);
    });
  }
  return sheet;
}

function inventoryProductUnits_(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Mặt hàng cần ít nhất một đơn vị tính và giá bán.");
  const seen = new Set();
  return value.map(function (entry) {
    const unit = String(entry && entry.unit || "").trim().replace(/\s+/g, " ");
    const price = invoiceNumber_(entry && entry.price, "Giá bán theo đơn vị");
    const key = inventoryName_(unit);
    if (!unit || price <= 0 || seen.has(key)) throw new Error("Đơn vị tính không được trống hoặc trùng; mỗi đơn vị cần giá bán lớn hơn 0.");
    seen.add(key);
    const factor = Number(entry && entry.factor);
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("Hệ số quy đổi phải là số lớn hơn 0.");
    return {unit: unit, price: price, factor: factor};
  });
}

function inventoryProducts_(ss) {
  const ids = new Set(), names = new Set();
  return inventoryRead_(ss, "products").rows.map(function (row) {
    const id = String(row[0] || "").trim(), name = String(row[1] || "").trim();
    const type = String(row[2] || "").trim();
    const price = invoiceNumber_(row[3], "Giá mặt hàng");
    let units = [];
    if (row[6]) {
      try { units = inventoryProductUnits_(JSON.parse(String(row[6]))); }
      catch (error) { throw new Error("Đơn vị/giá của " + name + " trong MATHANG không hợp lệ: " + error.message); }
    }
    const status = row[7] === "pending" || !type || !units.length ? "pending" : "active";
    const legacyUnit = String(row[8] || "").trim();
    const baseUnit = String(row[9] || "").trim();
    if (units.length && (!baseUnit || !units.some(function (entry) { return inventoryName_(entry.unit) === inventoryName_(baseUnit) && entry.factor === 1; }))) {
      throw new Error("Mặt hàng " + name + " thiếu đơn vị gốc có hệ số bằng 1.");
    }
    if (!id || !name || price < 0 || ids.has(id) || names.has(inventoryName_(name)) ||
        (legacyUnit && !units.some(function (entry) { return inventoryName_(entry.unit) === inventoryName_(legacyUnit); }))) {
      throw new Error("Danh mục MATHANG có mã/tên trùng hoặc mặt hàng chưa hợp lệ. Kiểm tra lại danh mục.");
    }
    ids.add(id); names.add(inventoryName_(name));
    return {id: id, name: name, type: type, price: units.length ? units[0].price : price,
      units: units, status: status, legacyUnit: legacyUnit, baseUnit: baseUnit};
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

function inventoryStockKey_(productId, unit) {
  return JSON.stringify([productId, inventoryName_(unit)]);
}

function inventoryBaseQuantityUnits_(product, unit, qty) {
  unit = String(unit || "").trim() || product.legacyUnit || "";
  if (product.status !== "active") return inventoryQuantityUnits_(qty);
  const configured = product.units.find(function (entry) { return inventoryName_(entry.unit) === inventoryName_(unit); });
  if (!configured) throw new Error("Đơn vị " + (unit || "chưa có ĐVT") + " của " + product.name + " chưa có quy đổi. Hoàn thiện danh mục trước.");
  return inventoryQuantityUnits_(inventoryQuantity_(qty) * configured.factor);
}

function inventoryCommittedSales_(ss) {
  const hd = ss.getSheetByName(SHEET_HD), ct = ss.getSheetByName(SHEET_CT);
  if (!hd || !ct) return [];
  const committed = new Set(invoiceRows_(hd).map(function (row) { return String(row[0] || "").trim(); }));
  return invoiceRows_(ct).filter(function (row) {
    return String(row[6] || "").trim() && committed.has(String(row[0] || "").trim());
  });
}

function inventoryStockUnits_(ss, products, receipts, sales) {
  const balances = new Map(), touched = new Set();
  const byId = new Map(products.map(function (product) { return [product.id, product]; }));
  function apply(id, unit, qty, direction) {
    const product = byId.get(id);
    if (!product) throw new Error("Chứng từ kho tham chiếu mã mặt hàng không còn trong danh mục: " + id);
    unit = String(unit || "").trim() || product.legacyUnit || "";
    touched.add(id);
    const key = inventoryStockKey_(id, product.status === "active" ? product.baseUnit : unit);
    const units = qty === 0 ? 0 : inventoryBaseQuantityUnits_(product, unit, qty) * direction;
    balances.set(key, inventoryAddUnits_(balances.get(key) || 0, units));
  }
  products.forEach(function (product) { if (product.status === "active") apply(product.id, product.baseUnit, 0, 1); });
  receipts.forEach(function (receipt) {
    receipt.items.forEach(function (item) { apply(item.productId, item.unit, item.qty, 1); });
  });
  (sales || inventoryCommittedSales_(ss)).forEach(function (row) {
    apply(String(row[6] || "").trim(), row[3], row[2], -1);
  });
  products.forEach(function (product) {
    if (!touched.has(product.id)) apply(product.id, "", 0, 1);
  });
  return balances;
}

function inventoryStock_(ss, products, receipts, sales) {
  const balances = inventoryStockUnits_(ss, products, receipts, sales);
  const byId = new Map(products.map(function (product) { return [product.id, product]; }));
  const receivedNames = new Map();
  receipts.forEach(function (receipt) { receipt.items.forEach(function (item) {
    const key = inventoryStockKey_(item.productId, item.unit);
    if (!receivedNames.has(key)) receivedNames.set(key, item.unit);
  }); });
  return Array.from(balances.entries()).map(function (entry) {
    const parts = JSON.parse(entry[0]), product = byId.get(parts[0]);
    return {productId: product.id, name: product.name,
      unit: product.status === "active" ? product.baseUnit : receivedNames.has(entry[0]) ? receivedNames.get(entry[0]) : parts[1],
      qty: entry[1] / INVENTORY_QTY_SCALE};
  });
}

function inventoryGet_(ss) {
  ss = ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = inventoryProducts_(ss), receipts = inventoryReceipts_(ss), sales = inventoryCommittedSales_(ss);
  const unitsById = new Map();
  function rememberUnit(id, unit) {
    if (!unitsById.has(id)) unitsById.set(id, new Set());
    unitsById.get(id).add(String(unit || ""));
  }
  receipts.forEach(function (receipt) { receipt.items.forEach(function (item) { rememberUnit(item.productId, item.unit); }); });
  sales.forEach(function (row) { rememberUnit(String(row[6] || "").trim(), row[3]); });
  products.forEach(function (product) {
    const units = unitsById.get(product.id) || new Set();
    product.receivedUnits = Array.from(units);
    product.requiresLegacyUnit = units.has("") && !product.legacyUnit;
  });
  return {schemaVersion: 2, products: products, receipts: receipts, stock: inventoryStock_(ss, products, receipts, sales),
    lastReceiptId: receipts.length ? receipts[receipts.length - 1].id : ""};
}

function inventoryRequest_(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 160) throw new Error("Mã yêu cầu lưu không hợp lệ.");
  return value.trim();
}

function inventoryReplay_(rows, column, requestId, hash, legacyHash) {
  if (!requestId) return null;
  const match = rows.find(function (row) { return String(row[column] || "") === requestId; });
  if (match && String(match[column + 1] || "") !== hash && String(match[column + 1] || "") !== legacyHash) {
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

function inventoryPrepareItems_(items, products, allowName, receiving) {
  if (!Array.isArray(items) || !items.length) throw new Error("Chứng từ cần ít nhất một mặt hàng.");
  return items.map(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Mặt hàng không hợp lệ.");
    const id = String(item.productId || "").trim();
    const product = id ? products.find(function (p) { return p.id === id; }) : allowName
      ? products.find(function (p) { return inventoryName_(p.name) === inventoryName_(item.name); }) : null;
    if (!product) throw new Error("Mặt hàng " + (item.name || id || "đang chọn") + " chưa có trong danh mục. Hãy chọn đúng mặt hàng.");
    const qty = inventoryQuantity_(item.qty), price = invoiceNumber_(item.price, "Đơn giá");
    const unit = String(item.unit || "").trim() || (item.fromTemplate && product.units.length === 1 ? product.units[0].unit : "");
    if (!unit) throw new Error("Vui lòng nhập đơn vị tính cho " + product.name + ".");
    const configured = product.units.find(function (entry) { return inventoryName_(entry.unit) === inventoryName_(unit); });
    if (!receiving && product.status !== "active") throw new Error("Mặt hàng " + product.name + " chưa hoàn thiện danh mục. Cập nhật loại hàng, đơn vị và giá bán trước khi bán.");
    if (product.status === "active" && !configured) throw new Error("Đơn vị tính của " + product.name + " chưa được khai báo trong danh mục.");
    const subtotal = Math.round(qty * price);
    if (price <= 0 || !Number.isFinite(subtotal)) throw new Error("Đơn giá và thành tiền phải hợp lệ, đơn giá lớn hơn 0.");
    return {productId: product.id, name: product.name, qty: qty, unit: configured ? configured.unit : unit, price: price, subtotal: subtotal};
  });
}

function inventoryInputHash_(data, receiving) {
  const items = data.items.map(function (item) {
    return {productId: String(item.productId || "").trim(),
      name: item.productId ? "" : inventoryName_(item.name), qty: inventoryQuantity_(item.qty),
      unit: inventoryName_(item.unit), price: invoiceNumber_(item.price, "Đơn giá")};
  });
  const value = {date: inventoryDateKey_(data.date),
    party: String(receiving ? data.supplier || "" : data.customer || "").trim(),
    address: String(data.address || "").trim(), shipper: receiving ? "" : String(data.shipper || "").trim(),
    paid: invoiceNumber_(data.paid, "Số tiền đã trả"), items: items};
  if (!receiving && (data.customerId || data.phone)) {
    value.customerId = String(data.customerId || "").trim();
    value.phone = typeof customersPhone_ === "function" ? customersPhone_(data.phone) : String(data.phone || "").trim();
  }
  return JSON.stringify(value);
}

function inventoryLegacyHash_(data, receiving, products) {
  const items = data.items.map(function (item) {
    const product = item.productId ? products.find(function (p) { return p.id === item.productId; }) : products.find(function (p) { return inventoryName_(p.name) === inventoryName_(item.name); });
    return {productId: item.productId || product && product.id || "", qty: inventoryQuantity_(item.qty), unit: String(item.unit || "").trim(), price: invoiceNumber_(item.price, "Đơn giá")};
  });
  const canonical = receiving
    ? {date: inventoryDateKey_(data.date), supplier: String(data.supplier || "").trim(), address: String(data.address || "").trim(), paid: invoiceNumber_(data.paid, "Đã trả"), items: items}
    : {date: inventoryDateKey_(data.date), customer: String(data.customer || "").trim(), address: String(data.address || "").trim(), shipper: String(data.shipper || "").trim(), paid: invoiceNumber_(data.paid, "Đã trả"), items: items};
  return inventoryHash_(canonical);
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
      const type = String(data.type || "").trim(), units = inventoryProductUnits_(data.units);
      const baseUnitInput = String(data.baseUnit || "").trim();
      const base = units.find(function (entry) { return inventoryName_(entry.unit) === inventoryName_(baseUnitInput); });
      if (!base || base.factor !== 1) throw new Error("Chọn đơn vị gốc và đặt hệ số quy đổi bằng 1.");
      const baseUnit = base.unit;
      const productId = String(data.productId || "").trim();
      const current = productId ? products.find(function (product) { return product.id === productId; }) : null;
      if (!name || !type) throw new Error("Nhập tên, loại mặt hàng và giá lớn hơn 0 cho từng đơn vị.");
      if (productId && !current) throw new Error("Không tìm thấy mặt hàng cần cập nhật.");
      let legacyUnit = String(data.legacyUnit || current && current.legacyUnit || "").trim();
      const receipts = inventoryReceipts_(ss);
      const hasBlank = !!current && (receipts.some(function (receipt) { return receipt.items.some(function (item) { return item.productId === productId && !item.unit; }); }) ||
        (ss.getSheetByName(SHEET_CT) && invoiceRows_(ss.getSheetByName(SHEET_CT)).some(function (row) { return row[6] === productId && !row[3]; })));
      if (hasBlank && !legacyUnit && units.length === 1) legacyUnit = units[0].unit;
      if (hasBlank && !legacyUnit) throw new Error("Chọn đơn vị áp dụng cho dữ liệu tồn kho cũ chưa có ĐVT (legacyUnit).");
      if (legacyUnit && !units.some(function (entry) { return inventoryName_(entry.unit) === inventoryName_(legacyUnit); })) throw new Error("Đơn vị cho tồn kho cũ phải nằm trong danh sách đơn vị của mặt hàng.");
      const hash = JSON.stringify({productId: productId, name: name, type: type, units: units, legacyUnit: legacyUnit, baseUnit: baseUnit});
      const rows = inventoryRead_(ss, "products").rows;
      const replay = inventoryReplay_(rows, 4, requestId, hash);
      if (replay) return {status: "success", product: products.find(function (p) { return p.id === String(replay[0]); })};
      if (products.some(function (p) { return p.id !== productId && inventoryName_(p.name) === inventoryName_(name); })) throw new Error("Tên mặt hàng đã có trong danh mục.");
      if (current) {
        const history = receipts.reduce(function (all, receipt) { return all.concat(receipt.items); }, [])
          .filter(function (item) { return item.productId === productId; });
        if (ss.getSheetByName(SHEET_CT)) invoiceRows_(ss.getSheetByName(SHEET_CT)).forEach(function (row) {
          if (String(row[6] || "") === productId) history.push({unit: String(row[3] || ""), qty: row[2]});
        });
        history.forEach(function (item) {
          const unit = item.unit || legacyUnit;
          if (!units.some(function (entry) { return inventoryName_(entry.unit) === inventoryName_(unit); })) throw new Error("Cần khai báo đủ quy đổi cho các ĐVT đã nhập/xuất của mặt hàng.");
        });
        if (current.status === "active" && history.length) {
          if (inventoryName_(current.baseUnit) !== inventoryName_(baseUnit) || inventoryName_(current.legacyUnit) !== inventoryName_(legacyUnit)) throw new Error("Không đổi đơn vị gốc hoặc ĐVT dữ liệu cũ sau khi có nhập/xuất kho.");
          current.units.forEach(function (old) {
            const next = units.find(function (entry) { return inventoryName_(entry.unit) === inventoryName_(old.unit); });
            if (!next || next.factor !== old.factor) throw new Error("Không xóa hoặc đổi hệ số quy đổi đã sử dụng. Có thể thêm ĐVT mới hoặc đổi giá bán.");
          });
        }
      }
      const product = {id: current ? current.id : inventoryNextId_("SP", [rows]), name: name, type: type,
        price: units[0].price, units: units, status: "active", legacyUnit: legacyUnit, baseUnit: baseUnit};
      // Thử tính toàn bộ lượng lịch sử theo quy đổi mới trước khi cập nhật danh mục.
      inventoryStockUnits_(ss, products.filter(function (p) { return p.id !== product.id; }).concat([product]), receipts);
      const sheet = inventoryEnsure_(ss, "products");
      const values = [product.id, name, type, product.price, requestId, hash, JSON.stringify(units), "active", legacyUnit, baseUnit];
      if (current) {
        const index = sheet.getDataRange().getValues().findIndex(function (row) { return String(row[0]) === current.id; });
        sheet.getRange(index + 1, 1, 1, values.length).setValues([values]);
      } else sheet.appendRow(values);
      SpreadsheetApp.flush();
      return {status: "success", product: product};
    }
    if (data.action !== "receiveStock") throw new Error("Yêu cầu kho không được hỗ trợ.");
    const supplier = String(data.supplier || "").trim();
    if (!supplier) throw new Error("Vui lòng nhập tên nhà cung cấp.");
    const date = inventoryDateKey_(data.date);
    const address = String(data.address || "").trim();
    if (!Array.isArray(data.items) || !data.items.length) throw new Error("Chứng từ cần ít nhất một mặt hàng.");
    const hash = inventoryInputHash_(data, true);
    const headers = inventoryRead_(ss, "receipts").rows;
    const replay = inventoryReplay_(headers, 7, requestId, hash, inventoryLegacyHash_(data, true, products));
    if (replay) {
      const receipts = inventoryReceipts_(ss);
      return {status: "success", receipt: receipts.find(function (r) { return r.id === String(replay[0]); }), stock: inventoryStock_(ss, products, receipts), products: products};
    }
    const productRows = inventoryRead_(ss, "products").rows;
    const added = [];
    const preparedInput = data.items.map(function (item) {
      if (!item || typeof item !== "object") throw new Error("Mặt hàng không hợp lệ.");
      const name = String(item.name || "").trim().replace(/\s+/g, " ");
      let product = item.productId ? products.find(function (p) { return p.id === String(item.productId).trim(); }) :
        products.find(function (p) { return inventoryName_(p.name) === inventoryName_(name); });
      if (!product && !item.productId && name) {
        product = {id: inventoryNextId_("SP", [productRows, added.map(function (p) { return [p.id]; })]),
          name: name, type: "", price: 0, units: [], status: "pending", legacyUnit: "", baseUnit: ""};
        products.push(product); added.push(product);
      }
      return Object.assign({}, item, {productId: product ? product.id : item.productId});
    });
    const items = inventoryPrepareItems_(preparedInput, products, true, true);
    const amounts = inventoryTotals_(items, data.paid);
    const canonical = {date: date, supplier: supplier, address: address, paid: amounts.paid, items: items};
    // Kiểm tra giới hạn tổng tồn trước khi ghi bất kỳ dòng nào của phiếu mới.
    inventoryStockUnits_(ss, products, inventoryReceipts_(ss).concat([{items: items}]));
    const prefix = "NK" + date.split("-").reverse().join("");
    const id = inventoryNextId_(prefix, [headers, inventoryRead_(ss, "details").rows]);
    if (added.length) {
      const catalog = inventoryEnsure_(ss, "products");
      added.forEach(function (product) { catalog.appendRow([product.id, product.name, "", 0, "", "", "", "pending", "", ""]); });
    }
    const ct = inventoryEnsure_(ss, "details");
    const hd = inventoryEnsure_(ss, "receipts");
    // Chi tiết chưa có header tương ứng là bản ghi chưa hoàn tất, không cộng tồn kho.
    items.forEach(function (item) { ct.appendRow([id, item.productId, item.name, item.qty, item.unit, item.price, item.subtotal]); });
    SpreadsheetApp.flush();
    hd.appendRow([id, date, supplier, address, amounts.total, amounts.paid, amounts.debt, requestId, hash]);
    SpreadsheetApp.flush();
    const receipt = Object.assign({id: id, requestId: requestId}, canonical, amounts);
    const receipts = inventoryReceipts_(ss);
    return {status: "success", receipt: receipt, stock: inventoryStock_(ss, products, receipts), products: products};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

// Gọi khi đã giữ cùng script lock với thao tác lưu hóa đơn/phiếu nhập.
// Mọi hóa đơn mới phải dùng mặt hàng đã hoàn thiện trong danh mục.
function inventorySaveSale_(sheets, data, fixedId, requestId) {
  const ss = sheets.ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = inventoryProducts_(ss);
  if (!products.length) throw new Error("Danh mục mặt hàng đang trống. Tạo và hoàn thiện mặt hàng trước khi lưu hóa đơn bán.");
  const hash = inventoryInputHash_(data, false);
  requestId = inventoryRequest_(requestId);
  const invoiceRows = invoiceRows_(sheets.hd);
  const replay = inventoryReplay_(invoiceRows, 8, requestId, hash, data.customerId || data.phone ? "" : inventoryLegacyHash_(data, false, products));
  if (replay) return invoiceList_(sheets).find(function (order) { return order.id === String(replay[0]); });
  const items = inventoryPrepareItems_(data.items, products, true, false);
  const amounts = inventoryTotals_(items, data.paid);
  const canonical = {date: inventoryDateKey_(data.date), customer: String(data.customer || "").trim(),
    address: String(data.address || "").trim(), shipper: String(data.shipper || "").trim(), paid: amounts.paid, items: items};
  const balances = inventoryStockUnits_(ss, products, inventoryReceipts_(ss));
  const needed = new Map();
  items.forEach(function (item) {
    const product = products.find(function (p) { return p.id === item.productId; });
    const key = inventoryStockKey_(item.productId, product.baseUnit);
    needed.set(key, inventoryAddUnits_(needed.get(key) || 0, inventoryBaseQuantityUnits_(product, item.unit, item.qty)));
  });
  needed.forEach(function (units, key) {
    const parts = JSON.parse(key), id = parts[0];
    const balance = balances.get(key);
    if (balance === undefined || units > balance) {
      throw new Error("Không đủ tồn kho cho " + products.find(function (p) { return p.id === id; }).name + " (" + parts[1] + "). Còn " + (balance === undefined ? 0 : balance / INVENTORY_QTY_SCALE) + ".");
    }
  });
  const detailRows = invoiceRows_(sheets.ct);
  const id = fixedId || generateId(sheets.hd, undefined, sheets.ct);
  if (fixedId && invoiceRows.concat(detailRows).some(function (row) { return String(row[0] || "").trim() === id; })) {
    throw new Error("Số hóa đơn đã tồn tại hoặc có lần lưu chưa hoàn tất. Hãy tạo số hóa đơn mới.");
  }
  if (typeof customersResolve_ === "function") customersResolve_(ss, data, false);
  inventorySaleColumns_(sheets);
  if (typeof customersResolve_ === "function") {
    const customer = customersResolve_(ss, data, true);
    canonical.customerId = customer.id; canonical.phone = customer.phone;
    canonical.debtStatementId = typeof debtStatementForSale_ === "function" ? debtStatementForSale_(ss, customer.id, amounts.debt) : "";
  }
  items.forEach(function (item) {
    sheets.ct.appendRow([id, item.name, item.qty, item.unit, item.price, item.subtotal, item.productId]);
  });
  SpreadsheetApp.flush();
  sheets.hd.appendRow([id, canonical.date, canonical.customer, canonical.address, amounts.total, amounts.paid, amounts.debt, canonical.shipper, requestId, hash,
    canonical.customerId || "", canonical.debtStatementId || ""]);
  SpreadsheetApp.flush();
  return Object.assign({id: id, requestId: requestId}, canonical, amounts);
}

function inventorySaleColumns_(sheets) {
  // Chỉ thêm nhãn metadata khi dòng đầu là tiêu đề; không đè lên dữ liệu headerless.
  const updates = [];
  [[sheets.hd, 9, typeof customersResolve_ === "function" ? ["requestId", "requestHash", "customerId", "debtStatementId"] : ["requestId", "requestHash"]], [sheets.ct, 7, ["productId"]]].forEach(function (entry) {
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
