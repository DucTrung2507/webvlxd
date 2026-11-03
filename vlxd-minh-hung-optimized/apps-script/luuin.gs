// Giữ tên hàm để các nút đã gán trên Google Sheet tiếp tục hoạt động.
function luuHoaDon() {
  var lock;
  var saved = false;
  var message;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("IN");
    var hd = ss.getSheetByName("HOADON");
    var ct = ss.getSheetByName("CHITIET_HD");
    if (!sh || !hd || !ct) throw new Error("Không tìm thấy tab IN, HOADON hoặc CHITIET_HD.");

    var soHD = String(sh.getRange("B5").getValue() || "").trim();
    var ngay = invoiceInDate_(sh.getRange("L1").getValue());
    var khach = String(sh.getRange("C8").getValue() || "").trim();
    var diachi = sh.getRange("C9").getValue();
    var tong = invoiceNumber_(sh.getRange("E28").getValue(), "Tổng tiền");
    var tra = invoiceNumber_(sh.getRange("E29").getValue(), "Khách trả");
    var no = invoiceNumber_(sh.getRange("E30").getValue(), "Công nợ");
    var giao = sh.getRange("E32").getValue();
    if (!soHD) throw new Error("Chưa có số hóa đơn!");
    if (!khach) throw new Error("Chưa nhập tên khách!");
    if (tong < 0 || tra < 0) throw new Error("Tổng tiền và khách trả phải lớn hơn hoặc bằng 0.");

    var ten = sh.getRange("B12:B27").getValues();
    var sl = sh.getRange("E12:E27").getValues();
    var gia = sh.getRange("F12:F27").getValues();
    var tt = sh.getRange("G12:G27").getValues();
    var rows = [];
    // Kiểm tra toàn bộ mặt hàng trước khi ghi bất kỳ dòng hóa đơn nào.
    for (var i = 0; i < ten.length; i++) {
      var tenHang = String(ten[i][0] == null ? "" : ten[i][0]).trim();
      if (!tenHang) continue;
      var rowLabel = " (dòng " + (i + 12) + ")";
      var soLuong = Number(String(sl[i][0] == null ? "" : sl[i][0]).trim().replace(",", "."));
      var donGia = invoiceNumber_(gia[i][0], "Giá" + rowLabel);
      var thanhTien = tt[i][0] === "" || tt[i][0] == null
        ? Math.round(soLuong * donGia) : invoiceNumber_(tt[i][0], "Thành tiền" + rowLabel);
      if (!Number.isFinite(soLuong) || soLuong <= 0) throw new Error("Số lượng phải > 0" + rowLabel);
      if (donGia <= 0) throw new Error("Giá phải > 0" + rowLabel);
      if (!Number.isFinite(thanhTien) || thanhTien < 0) throw new Error("Thành tiền phải lớn hơn hoặc bằng 0" + rowLabel);
      // Cùng 6 cột với đơn từ website; chưa xác định ô đơn vị tính trên mẫu IN.
      rows.push([soHD, tenHang, soLuong, "", donGia, thanhTien]);
    }
    if (!rows.length) throw new Error("Hóa đơn chưa có sản phẩm!");

    // Chung khóa với doPost trên website. Hộp thoại UI chỉ xuất hiện sau khi nhả khóa.
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var lastRow = hd.getLastRow();
    var ids = lastRow ? hd.getRange(1, 1, lastRow, 1).getValues() : [];
    var exists = ids.some(function (row) {
      return String(row[0] == null ? "" : row[0]).trim() === soHD;
    });
    if (exists) {
      throw new Error("Số hóa đơn đã tồn tại! Hãy tạo số hóa đơn mới rồi lưu lại.");
    }
    var tracked = typeof inventorySaveSale_ === "function" ? inventorySaveSale_({hd: hd, ct: ct, ss: ss}, {
      date: ngay, customer: khach, address: diachi, total: tong, paid: tra, debt: no, shipper: giao,
      items: rows.map(function (row) { return {name: row[1], qty: row[2], unit: row[3], price: row[4], subtotal: row[5]}; })
    }, soHD, "") : null;
    if (!tracked) {
      hd.appendRow([soHD, ngay, khach, diachi, tong, tra, no, giao]);
      ct.getRange(ct.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    }
    SpreadsheetApp.flush();
    saved = true;
    message = "Đã lưu hóa đơn!";
  } catch (error) {
    message = String(error.message || error);
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
  SpreadsheetApp.getUi().alert(message);
  return saved;
}

function luuVaInHoaDon() {
  if (!luuHoaDon()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("IN");
  var range = sheet.getRange("A1:G32");
  var url = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?" +
    "format=pdf" +
    "&size=A5" +
    "&portrait=true" +
    "&scale=2" +
    "&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5" +
    "&horizontal_alignment=CENTER&vertical_alignment=CENTER" +
    "&gridlines=false" +
    "&gid=" + sheet.getSheetId() +
    "&r1=" + (range.getRow() - 1) +
    "&c1=" + (range.getColumn() - 1) +
    "&r2=" + range.getLastRow() +
    "&c2=" + range.getLastColumn();
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '");google.script.host.close();</script>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, "Đang in...");
}

function taoHD() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("IN");
  // Giữ nguyên các vùng xóa của mẫu hiện có.
  sh.getRange("B6").clearContent();
  sh.getRange("B12:F27").clearContent();
  sh.getRange("E29:G29").clearContent();
  sh.getRange("E32:G32").clearContent();
  sh.getRange("C8:G9").clearContent();
  taoSoHoaDonTuDong();
}
