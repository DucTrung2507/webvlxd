function taoSoHoaDonTuDong() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shIN = ss.getSheetByName("IN");
    var shHD = ss.getSheetByName("HOADON");
    if (!shIN || !shHD) throw new Error("Không tìm thấy tab IN hoặc HOADON.");
    var ngay = invoiceInDate_(shIN.getRange("L1").getValue());
    // Dùng mã lớn nhất cùng ngày, kể cả hóa đơn cũ lưu ngày dưới dạng chuỗi.
    // Đây là mã xem trước; luuHoaDon kiểm tra trùng lại dưới khóa khi lưu thật.
    shIN.getRange("B5").setValue(generateId(shHD, ngay, ss.getSheetByName("CHITIET_HD")));
    return true;
  } catch (error) {
    SpreadsheetApp.getUi().alert(String(error.message || error));
    return false;
  }
}

function invoiceInDate_(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  var text = String(value == null ? "" : value).trim();
  var parts = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  var day;
  var month;
  var year;
  if (parts) {
    day = Number(parts[1]); month = Number(parts[2]); year = Number(parts[3]);
  } else {
    parts = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
      year = Number(parts[1]); month = Number(parts[2]); day = Number(parts[3]);
    }
  }
  // 05:00 UTC là 12:00 Việt Nam; không phụ thuộc múi giờ cài trên dự án Apps Script.
  var date = parts ? new Date(Date.UTC(year, month - 1, day, 5)) : null;
  if (!date || year < 1000 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Ngày tại IN!L1 không hợp lệ. Nhập ô ngày, dd/MM/yyyy hoặc yyyy-MM-dd.");
  }
  return date;
}
