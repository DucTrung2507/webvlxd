# Hóa đơn, danh mục mặt hàng và nhập kho

Đã cập nhật dự án Google Apps Script và triển khai **phiên bản 11 ngày 03/11/2026** trên URL Web app đang dùng. Đã kiểm tra trực tiếp: lịch sử hóa đơn và API danh mục/nhập kho/tồn kho trả dữ liệu đúng cấu trúc. Kho mới chưa có mặt hàng hay phiếu nhập; tạo mặt hàng, nhập số lượng đầu kỳ rồi bắt đầu bán.

Mô tả đầy đủ luồng sử dụng, dữ liệu, API, cơ chế tính tồn, xử lý lỗi và giới hạn hiện tại: [Luồng web và kỹ thuật](../docs/LUONG-WEB-VA-KY-THUAT.md).

Giữ bốn file sau trong **cùng dự án Apps Script** đang kết nối với website. Thay nội dung ba file cũ, rồi thêm `inventory.gs`:

| File | Chức năng |
| --- | --- |
| [websang.gs](websang.gs) | Cấu hình dùng chung, API đọc/lưu hóa đơn và định tuyến nghiệp vụ kho |
| [luuin.gs](luuin.gs) | Nút lưu, lưu và in, tạo đơn trên tab `IN` |
| [soHD.gs](soHD.gs) | Tạo số hóa đơn dự kiến tại `IN!B5` |
| [inventory.gs](inventory.gs) | Danh mục, phiếu nhập, tính tồn kho và kiểm tra tồn khi bán |

Chỉ giữ một bộ cấu hình, một `doGet`, một `doPost` và một `generateId`. Nếu đã chép các mẫu `Code.gs` hoặc `ListOrders.gs` trước đây, bỏ phần mã mẫu trùng. Tên các hàm đang gán cho nút trên Sheet vẫn giữ nguyên: `luuHoaDon`, `luuVaInHoaDon`, `taoHD`, `taoSoHoaDonTuDong`.

## Các bảng dữ liệu

Mã dùng bảng tính `1TfROVVl8D3d3UpbwvNADxg7elcCUmbgQZMfTQi8IyQw`. Danh mục và nhập kho tạo ba tab riêng khi có thao tác lưu đầu tiên:

| Tab mới | Thứ tự cột từ A |
| --- | --- |
| `MATHANG` | `productId`, `name`, `type`, `price`, `requestId`, `requestHash` |
| `NHAPKHO` | `id`, `date`, `supplier`, `address`, `total`, `paid`, `debt`, `requestId`, `requestHash` |
| `CT_NHAPKHO` | `receiptId`, `productId`, `name`, `qty`, `unit`, `price`, `subtotal` |

Đọc danh sách không tự tạo tab hay ghi dữ liệu. Các tab mới có dữ liệu nhưng tiêu đề không đúng sẽ báo lỗi để kiểm tra; mã không ghi đè dữ liệu đó. Các tab cũ `NHAPHANG`, `KHO`, `TKNHAPHANG` được giữ nguyên và không dùng làm nguồn tồn kho mới.

Các tab hóa đơn hiện có tiếp tục dùng thứ tự cột cũ:

| Tab | Cột hiện có | Phần bổ sung cho đơn theo dõi tồn |
| --- | --- | --- |
| `HOADON` | A:H: số HD, ngày, khách, địa chỉ, tổng, trả, nợ, người giao | I: `requestId`, J: `requestHash` |
| `CHITIET_HD` | A:F: số HD, tên hàng, số lượng, ĐVT, đơn giá, thành tiền | G: `productId` |

Phần bổ sung chỉ ghi vào hóa đơn mới và nhãn cột còn trống của dòng tiêu đề. Không điền mã mặt hàng vào các dòng hóa đơn cũ.

Chi tiết lịch sử vẫn đọc được hai cấu trúc trong cùng tab `CHITIET_HD`: dòng 5 cột cũ từ `luuin.gs` có giá tại D, thành tiền tại E; dòng 6 cột từ web có ĐVT tại D, giá tại E, thành tiền tại F. Dòng F có giá trị (kể cả 0) là dạng 6 cột. Dòng F trống và D/E đều là số tiền được nhận dạng là dạng 5 cột. Dòng 6 cột thiếu thành tiền được tính từ số lượng × đơn giá. Dữ liệu lịch sử không được tự di chuyển hoặc ghi lại. Nếu ĐVT cũ là số và F trống, cần đối chiếu dòng mơ hồ đó trên Sheet.

## Quy tắc nghiệp vụ

- Mặt hàng gồm tên, loại, giá; mã tự sinh `SP000001`, `SP000002`… Tên được so sánh không phân biệt hoa thường và khoảng trắng thừa, để tránh danh mục trùng và nhận đúng tên hàng nhập từ tab `IN`.
- Phiếu nhập có mã `NKddMMyyyyNNNN`, ngày, nhà cung cấp, địa chỉ, danh sách hàng, tổng tiền, đã trả và công nợ. Số lượng/đơn giá phải dương và hữu hạn. Số lượng có tối đa 6 chữ số thập phân, nhỏ nhất `0,000001`; tổng lượng được tính bằng số nguyên vi đơn vị để không âm/dư tồn do số thực. Số lượng hoặc tổng tồn vượt giới hạn biểu diễn chính xác sẽ bị chặn trước khi ghi. Máy chủ tính thành tiền, tổng và công nợ từ các dòng hàng. Trả dư được giữ với công nợ âm, giống hóa đơn bán.
- **Tồn kho = tổng số lượng nhập đã lưu hoàn tất − số lượng bán mới có mã mặt hàng.** Hóa đơn lịch sử chưa có `productId` vẫn hiển thị bình thường, không tự đoán tên để trừ vào kho mới. Tồn ban đầu của danh mục mới là 0; cần lập phiếu nhập cho lượng hàng bắt đầu theo dõi.
- Khi đã có ít nhất một mặt hàng trong `MATHANG`, hóa đơn bán mới phải chọn đúng mã mặt hàng. Lưu từ `IN` được nối bằng tên duy nhất trong danh mục. Máy chủ cộng số lượng các dòng cùng mặt hàng rồi kiểm tra đủ tồn dưới khóa dùng chung, chặn bán vượt tồn từ cả hai nguồn.
- Chỉ khi chưa có danh mục và chưa từng có chứng từ kho/mã mặt hàng, ba file hóa đơn mới giữ luồng lưu cũ để tương thích. Nếu danh mục bị xóa trong khi dữ liệu nhập/xuất vẫn tồn tại, thao tác bán bị chặn để khôi phục danh mục, không tự bỏ qua kiểm tra tồn. Đơn vị tính của tab `IN` để trống vì mẫu hiện tại chưa có ô ĐVT được xác định; không tự đoán vị trí ô.

Các thao tác lưu dùng cùng `LockService.getScriptLock()`. Với phiếu nhập và đơn bán theo dõi tồn, chi tiết được ghi trước, dòng tổng được ghi cuối làm dấu hoàn tất. Chi tiết còn dang dở không cộng/trừ tồn; mã của chúng vẫn được bỏ qua khi cấp số tiếp theo để không ghép nhầm vào chứng từ khác. Những dòng này không bị tự xóa.

Website gửi `requestId` ổn định cho mỗi lần tạo mặt hàng/phiếu nhập/hóa đơn. Thử lại cùng mã yêu cầu và cùng nội dung trả chứng từ đã lưu, không nhân đôi tồn kho; dùng lại mã với nội dung khác sẽ báo lỗi. Việc đổi tên hoặc giá danh mục sau khi lưu không khiến yêu cầu cũ bị trừ/cộng kho lại. `requestHash` lưu nội dung đã chuẩn hóa để kiểm tra xung đột, không phải mã mặt hàng hay số chứng từ.

## API

| Yêu cầu | Dữ liệu trả về |
| --- | --- |
| `GET ?action=list` | `{orders: [...]}` toàn bộ hóa đơn và chi tiết |
| `GET ?action=inventory` | `{products: [...], receipts: [...], stock: [...], lastReceiptId: "..."}` |
| `GET` không có action | `{lastId: "..."}` để xem trước mã hóa đơn |
| `POST` với `action: "createProduct"` | `{status: "success", product: {...}}` |
| `POST` với `action: "receiveStock"` | `{status: "success", receipt: {...}, stock: [...]}` |
| `POST` hóa đơn hiện có | `{status: "success", id: "...", order: {...}}` khi theo dõi tồn; luồng cũ vẫn trả mã chính thức |

`stock` gồm `{productId, name, qty}`. Mặt hàng trên phiếu nhập gồm `{productId, name, qty, unit, price, subtotal}`. Ô ngày của Sheet được chuẩn hóa theo múi giờ Việt Nam; bộ lọc hóa đơn từ ngày/đến ngày chạy trên website và bao gồm cả hai mốc.

## Cập nhật deployment

1. Thay nội dung `websang.gs`, `luuin.gs`, `soHD.gs`, thêm `inventory.gs` rồi lưu trong cùng dự án Apps Script.
2. Chọn **Deploy → Manage deployments**, mở Web app có URL `/exec` đang dùng trên website, bấm sửa, chọn **New version**, rồi **Deploy**. Giữ cấu hình người thực thi và quyền truy cập hiện tại. Cách này giữ nguyên URL; chỉ lưu file mà chưa cập nhật deployment thì website vẫn dùng mã cũ.
3. Kiểm tra URL `/exec?action=list` trả `orders`, và `/exec?action=inventory` trả ba mảng `products`, `receipts`, `stock`. Kho mới chưa có dữ liệu thì các mảng rỗng; bước đọc không tạo tab.
4. Trở lại website và bấm **Làm mới**. Tạo mặt hàng, lập phiếu nhập rồi mới lập đơn bán theo dõi tồn. Để trống ngày hoặc bấm **Xem tất cả** để xem toàn bộ lịch sử hóa đơn.

Sau mỗi lần sửa mã cục bộ, cần cập nhật dự án và deployment để website sử dụng bản mới. Nếu phản hồi có `status: "error"`, xem `message` để kiểm tra đúng bảng tính, tên tab, tiêu đề hoặc dữ liệu nhập.

Tài liệu Google: [Web app và `doGet`/`doPost`](https://developers.google.com/apps-script/guides/web), [khóa dùng chung](https://developers.google.com/apps-script/reference/lock/lock-service), [cập nhật deployment](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
