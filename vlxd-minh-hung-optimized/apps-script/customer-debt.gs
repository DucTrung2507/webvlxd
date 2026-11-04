// Phiếu công nợ và lần thu tiền là các bản ghi một dòng, không sửa số tiền hóa đơn gốc.
const debtTables_ = {
  statements: {name: "CONGNO_TONG", headers: ["id", "customerId", "date", "throughDate", "customer", "items", "total", "requestId", "requestHash", "requestAliases"]},
  payments: {name: "THU_CONGNO", headers: ["id", "statementId", "customerId", "date", "amount", "note", "allocations", "requestId", "requestHash", "closingSnapshot"]}
};

function debtReadTable_(ss, kind) {
  const schema = debtTables_[kind], sheet = ss.getSheetByName(schema.name);
  if (!sheet) return {sheet: null, rows: []};
  const values = sheet.getDataRange().getValues();
  if (values.every(function (row) { return row.every(function (cell) { return cell === "" || cell == null; }); })) return {sheet: sheet, rows: []};
  schema.headers.forEach(function (header, index) {
    if (String(values[0][index] || "").trim() !== header) throw new Error("Tab " + schema.name + " sai cấu trúc cột " + (index + 1) + ". Không ghi đè dữ liệu công nợ.");
  });
  return {sheet: sheet, rows: values.slice(1).filter(function (row) { return row.some(function (cell) { return cell !== "" && cell != null; }); })};
}

function debtEnsureTable_(ss, kind) {
  const table = debtReadTable_(ss, kind), schema = debtTables_[kind];
  const sheet = table.sheet || ss.insertSheet(schema.name);
  if (!sheet.getLastRow()) sheet.appendRow(schema.headers.slice());
  return sheet;
}

// Dùng số nguyên phần trăm đồng để giữ chính xác khoản trả lẻ của dữ liệu cũ.
function debtMoneyUnits_(value, label, negative) {
  const number = invoiceNumber_(value, label || "Số tiền"), units = Math.round(number * 100);
  const tolerance = Math.min(0.000001, Number.EPSILON * Math.max(1, Math.abs(number * 100)) * 4);
  if (!Number.isSafeInteger(units) || Math.abs(number * 100 - units) > tolerance || (!negative && units < 0)) {
    throw new Error((label || "Số tiền") + " phải hợp lệ, không âm và có tối đa hai chữ số thập phân.");
  }
  return units;
}

function debtAdd_(left, right) {
  const sum = left + right;
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || !Number.isSafeInteger(sum)) throw new Error("Tổng công nợ vượt giới hạn số tiền chính xác.");
  return sum;
}

function debtDate_(value) {
  if (value === undefined || value === null || value === "") return Utilities.formatDate(new Date(), INVOICE_TIME_ZONE, "yyyy-MM-dd");
  return Utilities.formatDate(invoiceInDate_(value), INVOICE_TIME_ZONE, "yyyy-MM-dd");
}

function debtRequest_(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error("Cần mã yêu cầu hợp lệ để tránh lưu trùng công nợ.");
  return value.trim();
}

function debtOrderDate_(value, orderId) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    try { return debtDate_(value); } catch (error) { /* Dữ liệu cũ có thể chưa xác định ngày. */ }
  }
  const match = String(orderId || "").match(/^HD(\d{2})(\d{2})(\d{4})\d+$/i);
  if (match) {
    try { return debtDate_(match[3] + "-" + match[2] + "-" + match[1]); } catch (error) { /* Không đoán ngày từ mã không hợp lệ. */ }
  }
  return "";
}

function debtJson_(value, label) {
  try { return JSON.parse(String(value)); }
  catch (error) { throw new Error(label + " chứa dữ liệu JSON không hợp lệ."); }
}

function debtItem_(item) {
  if (!item || typeof item !== "object" || !String(item.orderId || "").trim()) throw new Error("Phiếu công nợ có dòng thiếu mã hóa đơn.");
  const debt = debtMoneyUnits_(item.debt, "Nợ của hóa đơn");
  if (debt <= 0) throw new Error("Phiếu công nợ chỉ gồm các hóa đơn còn nợ.");
  return {orderId: String(item.orderId).trim(), date: debtOrderDate_(item.date, item.orderId), total: debtMoneyUnits_(item.total, "Tổng hóa đơn") / 100,
    paid: debtMoneyUnits_(item.paid, "Đã trả của hóa đơn") / 100, debt: debt / 100};
}

function debtOriginal_(order) {
  return {
    paid: debtMoneyUnits_(order.originalPaid === undefined ? order.paid : order.originalPaid, "Khách trả của " + order.id),
    debt: debtMoneyUnits_(order.originalDebt === undefined ? order.debt : order.originalDebt, "Công nợ của " + order.id, true)
  };
}

function debtNextId_(prefix, rows) {
  let sequence = 0;
  rows.forEach(function (row) {
    const id = String(row[0] || ""), tail = id.indexOf(prefix) === 0 ? id.slice(prefix.length) : "";
    if (/^\d+$/.test(tail)) sequence = Math.max(sequence, Number(tail));
  });
  if (!Number.isSafeInteger(sequence + 1)) throw new Error("Không thể cấp thêm mã công nợ.");
  return prefix + String(sequence + 1).padStart(4, "0");
}

function debtState_(ss, orders) {
  const statementTable = debtReadTable_(ss, "statements"), paymentTable = debtReadTable_(ss, "payments");
  const byOrder = new Map(), byStatement = new Map(), owner = new Map(), requestIds = new Set(), aliases = new Map();
  orders.forEach(function (order) {
    const id = String(order.id || "").trim();
    if (!id || byOrder.has(id)) throw new Error("Hóa đơn thiếu mã hoặc trùng mã; cần kiểm tra trước khi tính công nợ.");
    byOrder.set(id, order);
  });
  const statements = statementTable.rows.map(function (row) {
    const id = String(row[0] || "").trim(), customerId = String(row[1] || "").trim();
    const customer = debtJson_(row[4], "Khách hàng trên phiếu công nợ"), rawItems = debtJson_(row[5], "Chi tiết công nợ");
    if (!id || !customerId || byStatement.has(id) || !customer || customer.id !== customerId || !customer.name || !Array.isArray(rawItems) || !rawItems.length) {
      throw new Error("Phiếu công nợ thiếu thông tin hoặc trùng mã.");
    }
    const items = rawItems.map(debtItem_), seen = new Set();
    items.forEach(function (item) {
      const order = byOrder.get(item.orderId);
      if (!order || order.customerId !== customerId || seen.has(item.orderId) || owner.has(item.orderId)) throw new Error("Hóa đơn trên phiếu công nợ bị mất, khác khách hoặc đã thuộc phiếu khác.");
      seen.add(item.orderId); owner.set(item.orderId, id);
    });
    const total = items.reduce(function (sum, item) { return debtAdd_(sum, debtMoneyUnits_(item.debt)); }, 0);
    if (total !== debtMoneyUnits_(row[6], "Tổng phiếu công nợ")) throw new Error("Tổng phiếu công nợ không khớp chi tiết.");
    const requestId = String(row[7] || "");
    if (!requestId || requestIds.has(requestId)) throw new Error("Mã yêu cầu công nợ bị thiếu hoặc trùng.");
    requestIds.add(requestId);
    const requestAliases = row[9] ? debtJson_(row[9], "Mã yêu cầu xuất lại công nợ") : [];
    if (!Array.isArray(requestAliases)) throw new Error("Mã yêu cầu xuất lại công nợ không hợp lệ.");
    requestAliases.forEach(function (alias) {
      if (!alias || !alias.requestId || typeof alias.requestHash !== "string" || requestIds.has(alias.requestId)) throw new Error("Mã yêu cầu xuất lại công nợ bị thiếu hoặc trùng.");
      requestIds.add(alias.requestId); aliases.set(alias.requestId, {statementId: id, requestHash: alias.requestHash});
    });
    const result = {id: id, customerId: customerId, date: debtDate_(row[2]), throughDate: debtDate_(row[3]),
      customer: customer, items: items, total: total / 100, paid: 0, debt: total / 100, status: "open", payments: [],
      requestId: requestId, requestHash: String(row[8] || ""), requestAliases: requestAliases, _paidUnits: 0, _closed: false};
    byStatement.set(id, result);
    return result;
  });
  // L trên HOADON được ghi cùng dòng tổng: đơn mới tự nối vào phiếu đang mở.
  orders.forEach(function (order) {
    const statementId = String(order.debtStatementId || "").trim();
    if (!statementId) return;
    const statement = byStatement.get(statementId);
    if (!statement || statement.customerId !== order.customerId || (owner.has(order.id) && owner.get(order.id) !== statementId)) throw new Error("Liên kết hóa đơn với phiếu công nợ không hợp lệ.");
    if (!owner.has(order.id)) {
      const original = debtOriginal_(order);
      const item = debtItem_({orderId: order.id, date: order.date, total: order.total, paid: original.paid / 100, debt: original.debt / 100});
      statement.items.push(item); owner.set(order.id, statementId);
    }
  });
  statements.forEach(function (statement) {
    statement.items.sort(function (a, b) { return a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId); });
    statement.total = statement.items.reduce(function (sum, item) { return debtAdd_(sum, debtMoneyUnits_(item.debt)); }, 0) / 100;
  });
  const paymentIds = new Set(), allocationsByOrder = new Map();
  const payments = paymentTable.rows.map(function (row) {
    const id = String(row[0] || "").trim(), statementId = String(row[1] || "").trim(), customerId = String(row[2] || "").trim();
    const statement = byStatement.get(statementId), amount = debtMoneyUnits_(row[4], "Tiền thu công nợ");
    const allocations = debtJson_(row[6], "Phân bổ thu công nợ"), requestId = String(row[7] || "");
    if (!id || paymentIds.has(id) || !statement || statement.customerId !== customerId || amount <= 0 || !requestId || requestIds.has(requestId) || !Array.isArray(allocations) || !allocations.length || statement._closed) {
      throw new Error("Lần thu công nợ thiếu thông tin, trùng hoặc phiếu đã tất toán.");
    }
    const allocationIds = new Set();
    const allocated = allocations.reduce(function (sum, allocation) {
      const orderId = String(allocation && allocation.orderId || ""), units = debtMoneyUnits_(allocation && allocation.amount, "Tiền phân bổ");
      const item = statement.items.find(function (entry) { return entry.orderId === orderId; });
      if (!item || units <= 0 || allocationIds.has(orderId) || owner.get(orderId) !== statementId) throw new Error("Phân bổ công nợ không thuộc hóa đơn của phiếu.");
      allocationIds.add(orderId);
      const totalPaid = debtAdd_(allocationsByOrder.get(orderId) || 0, units);
      if (totalPaid > debtMoneyUnits_(item.debt) || totalPaid > Math.max(0, debtOriginal_(byOrder.get(orderId)).debt)) throw new Error("Tiền thu vượt số nợ của hóa đơn.");
      allocationsByOrder.set(orderId, totalPaid);
      return debtAdd_(sum, units);
    }, 0);
    if (allocated !== amount) throw new Error("Tổng tiền thu không khớp phân bổ hóa đơn.");
    statement._paidUnits = debtAdd_(statement._paidUnits, amount);
    if (statement._paidUnits > debtMoneyUnits_(statement.total)) throw new Error("Tiền thu vượt tổng công nợ.");
    const payment = {id: id, statementId: statementId, customerId: customerId, date: debtDate_(row[3]), amount: amount / 100,
      note: String(row[5] || ""), allocations: allocations.map(function (allocation) { return {orderId: String(allocation.orderId), amount: debtMoneyUnits_(allocation.amount) / 100}; }),
      requestId: requestId, requestHash: String(row[8] || "")};
    if (row[9]) {
      const closed = debtJson_(row[9], "Chốt phiếu công nợ"), closedItems = Array.isArray(closed.items) ? closed.items.map(debtItem_) : [];
      const closedIds = new Set(closedItems.map(function (item) { return item.orderId; }));
      const closedTotal = closedItems.reduce(function (sum, item) { return debtAdd_(sum, debtMoneyUnits_(item.debt)); }, 0);
      if (!closedItems.length || closedIds.size !== statement.items.length || closedItems.length !== statement.items.length ||
          statement.items.some(function (item) { return !closedIds.has(item.orderId); }) || closedTotal !== debtMoneyUnits_(closed.total) || closedTotal !== statement._paidUnits) {
        throw new Error("Bản chốt công nợ không khớp các hóa đơn hoặc số tiền tất toán.");
      }
      statement.items = closedItems;
      statement.total = closedTotal / 100;
      statement._closed = true;
      statement.closedAt = payment.date;
    }
    paymentIds.add(id); requestIds.add(requestId); statement.payments.push(payment);
    return payment;
  });
  const activeCustomers = new Set();
  statements.forEach(function (statement) {
    const units = debtMoneyUnits_(statement.total), remaining = units - statement._paidUnits;
    if (remaining === 0 && !statement._closed) throw new Error("Phiếu công nợ thiếu bản chốt tất toán.");
    statement.paid = statement._paidUnits / 100; statement.debt = remaining / 100; statement.status = statement._closed ? "closed" : "open";
    statement.throughDate = [statement.date].concat(statement.items.map(function (item) { return item.date; }),
      statement.payments.map(function (payment) { return payment.date; }), statement.status === "open" ? [debtDate_()] : []).sort().pop();
    if (statement.status === "open") {
      if (activeCustomers.has(statement.customerId)) throw new Error("Khách hàng có nhiều phiếu công nợ đang mở. Cần kiểm tra dữ liệu.");
      activeCustomers.add(statement.customerId);
    }
    delete statement._paidUnits; delete statement._closed;
  });
  return {orders: orders, statements: statements, payments: payments, owner: owner, allocationsByOrder: allocationsByOrder,
    statementTable: statementTable, paymentTable: paymentTable, aliases: aliases};
}

function debtApplyPayments_(ss, orders) {
  const state = debtState_(ss, orders);
  return orders.map(function (order) {
    const paid = state.allocationsByOrder.get(order.id) || 0;
    if (!paid && order.originalPaid === undefined) return order;
    const original = debtOriginal_(order);
    return Object.assign({}, order, {originalPaid: original.paid / 100, originalDebt: original.debt / 100,
      debtPaid: paid / 100, paid: debtAdd_(original.paid, paid) / 100, debt: (original.debt - paid) / 100});
  });
}

function debtGet_(ss, orders) {
  const state = debtState_(ss, orders);
  return {statements: state.statements, payments: state.payments};
}

function debtStatementForSale_(ss, customerId, amount) {
  if (debtMoneyUnits_(amount, "Nợ hóa đơn", true) <= 0) return "";
  const context = customersContext_(ss), state = debtState_(ss, context.orders);
  const current = state.statements.find(function (statement) { return statement.customerId === customerId && statement.status === "open"; });
  return current ? current.id : "";
}

function debtMutate_(data) {
  let lock;
  try {
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID), requestId = debtRequest_(data.requestId);
    let context = customersContext_(ss), state = debtState_(ss, context.orders);
    if (data.action === "createDebtStatement") {
      const inputCustomerId = String(data.customerId || "").trim();
      const alias = state.aliases.get(requestId);
      if (alias) {
        if (alias.requestHash !== JSON.stringify({customerId: inputCustomerId})) throw new Error("Mã yêu cầu đã dùng cho khách hàng khác.");
        const statement = state.statements.find(function (entry) { return entry.id === alias.statementId; });
        return {status: "success", statement: statement, customerId: statement.customerId};
      }
      const replay = state.statements.find(function (statement) { return statement.requestId === requestId; });
      if (replay) {
        if (replay.requestHash !== JSON.stringify({customerId: inputCustomerId})) throw new Error("Mã yêu cầu đã dùng cho khách hàng khác.");
        return {status: "success", statement: replay, customerId: replay.customerId};
      }
      if (state.payments.some(function (payment) { return payment.requestId === requestId; })) throw new Error("Mã yêu cầu đã dùng cho lần thu tiền.");
      const selected = context.customers.find(function (customer) { return customer.id === inputCustomerId; });
      if (!selected) throw new Error("Không tìm thấy khách hàng cần lập công nợ.");
      const active = state.statements.find(function (statement) { return statement.customerId === selected.id && statement.status === "open"; });
      if (active) {
        const requestAliases = active.requestAliases.concat([{requestId: requestId, requestHash: JSON.stringify({customerId: inputCustomerId})}]);
        const sheet = debtEnsureTable_(ss, "statements");
        const row = sheet.getDataRange().getValues().findIndex(function (values) { return String(values[0]) === active.id; });
        sheet.getRange(row + 1, 10).setValue(JSON.stringify(requestAliases));
        SpreadsheetApp.flush();
        active.requestAliases = requestAliases;
        return {status: "success", statement: active, customerId: active.customerId};
      }
      const outstanding = context.orders.filter(function (order) {
        return order.customerId === selected.id && !state.owner.has(order.id) && debtMoneyUnits_(order.debt, "Nợ hóa đơn", true) > 0;
      });
      if (!outstanding.length) throw new Error("Khách hàng không có hóa đơn còn nợ chưa được gộp.");
      // Chỉ cấp KH thật sau khi kiểm tra đã có công nợ cần lập phiếu.
      const customer = customersResolve_(ss, {customerId: inputCustomerId}, true);
      context = customersContext_(ss); state = debtState_(ss, context.orders);
      const items = context.orders.filter(function (order) {
        return order.customerId === customer.id && !state.owner.has(order.id) && debtMoneyUnits_(order.debt, "Nợ hóa đơn", true) > 0;
      }).map(function (order) { return debtItem_({orderId: order.id, date: order.date, total: order.total, paid: order.paid, debt: order.debt}); });
      items.sort(function (a, b) { return a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId); });
      if (!items.length) throw new Error("Không có hóa đơn nợ để lập phiếu.");
      const date = debtDate_(), total = items.reduce(function (sum, item) { return debtAdd_(sum, debtMoneyUnits_(item.debt)); }, 0) / 100;
      const id = debtNextId_("CN" + date.split("-").reverse().join(""), state.statementTable.rows);
      const snapshot = {id: customer.id, name: customer.name, phone: customer.phone || "", address: customer.address || ""};
      const hash = JSON.stringify({customerId: inputCustomerId});
      debtEnsureTable_(ss, "statements").appendRow([id, customer.id, date, date, JSON.stringify(snapshot), JSON.stringify(items), total, requestId, hash, "[]"]);
      SpreadsheetApp.flush();
      const statement = debtState_(ss, context.orders).statements.find(function (entry) { return entry.id === id; });
      return {status: "success", statement: statement, customerId: customer.id};
    }
    if (data.action !== "payDebtStatement") throw new Error("Yêu cầu công nợ không được hỗ trợ.");
    const statementId = String(data.statementId || "").trim(), amount = debtMoneyUnits_(data.amount, "Số tiền thu");
    const date = debtDate_(data.date), note = String(data.note || "").trim();
    const hash = JSON.stringify({statementId: statementId, amount: amount / 100, date: data.date ? date : "", note: note});
    const replay = state.payments.find(function (payment) { return payment.requestId === requestId; });
    if (replay) {
      if (replay.requestHash !== hash) throw new Error("Mã yêu cầu đã dùng với nội dung thu tiền khác.");
      return {status: "success", payment: replay, statement: state.statements.find(function (statement) { return statement.id === replay.statementId; })};
    }
    if (state.aliases.has(requestId) || state.statements.some(function (statement) { return statement.requestId === requestId; })) throw new Error("Mã yêu cầu đã dùng để lập phiếu công nợ.");
    const statement = state.statements.find(function (entry) { return entry.id === statementId; });
    if (!statement || statement.status !== "open") throw new Error("Không tìm thấy phiếu công nợ đang mở; phiếu có thể đã tất toán.");
    if (amount <= 0 || amount > debtMoneyUnits_(statement.debt)) throw new Error("Số tiền thu phải lớn hơn 0 và không vượt công nợ còn lại.");
    let remaining = amount;
    const allocations = [];
    statement.items.forEach(function (item) {
      if (!remaining) return;
      const balance = debtMoneyUnits_(item.debt) - (state.allocationsByOrder.get(item.orderId) || 0), allocated = Math.min(balance, remaining);
      if (allocated > 0) allocations.push({orderId: item.orderId, amount: allocated / 100});
      remaining -= allocated;
    });
    if (remaining) throw new Error("Không phân bổ được tiền thu vào các hóa đơn của khách.");
    const id = debtNextId_("TT" + debtDate_().split("-").reverse().join(""), state.paymentTable.rows);
    const closing = amount === debtMoneyUnits_(statement.debt) ? JSON.stringify({total: statement.total, items: statement.items}) : "";
    debtEnsureTable_(ss, "payments").appendRow([id, statementId, statement.customerId, date, amount / 100, note,
      JSON.stringify(allocations), requestId, hash, closing]);
    SpreadsheetApp.flush();
    const next = debtState_(ss, context.orders);
    return {status: "success", payment: next.payments.find(function (payment) { return payment.id === id; }),
      statement: next.statements.find(function (entry) { return entry.id === statementId; })};
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
