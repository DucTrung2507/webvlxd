# Hóa đơn, kho, khách hàng và công nợ tổng

Đã triển khai Apps Script **phiên bản 14 ngày 04/11/2026**, bổ sung hồ sơ khách hàng và phiếu công nợ tổng cộng dồn. API kho giữ `schemaVersion: 2`, API khách hàng dùng `schemaVersion: 1`. Đơn mới nối vào phiếu đang mở; thu đủ sẽ tất toán phiếu, các đơn phát sinh sau thuộc đợt công nợ tiếp theo.

Mô tả đầy đủ luồng sử dụng, dữ liệu, API, cơ chế tính tồn, xử lý lỗi và giới hạn hiện tại: [Luồng web và kỹ thuật](../docs/LUONG-WEB-VA-KY-THUAT.md).

Giữ sáu file sau trong **cùng dự án Apps Script** đang kết nối với website. Cập nhật các file hiện có, thêm `customers.gs` và `customer-debt.gs`:

| File | Chức năng |
| --- | --- |
| [websang.gs](websang.gs) | Cấu hình dùng chung, API đọc/lưu hóa đơn và định tuyến nghiệp vụ kho |
| [luuin.gs](luuin.gs) | Nút lưu, lưu và in, tạo đơn trên tab `IN` |
| [soHD.gs](soHD.gs) | Tạo số hóa đơn dự kiến tại `IN!B5` |
| [inventory.gs](inventory.gs) | Danh mục, phiếu nhập, tính tồn kho và kiểm tra tồn khi bán |
| [customers.gs](customers.gs) | Hồ sơ KH, nhận diện khách và liên kết hóa đơn cũ/mới |
| [customer-debt.gs](customer-debt.gs) | Phiếu công nợ cộng dồn, thu tiền, phân bổ và tất toán |

Chỉ giữ một bộ cấu hình, một `doGet`, một `doPost` và một `generateId`. Nếu đã chép các mẫu `Code.gs` hoặc `ListOrders.gs` trước đây, bỏ phần mã mẫu trùng. Tên các hàm đang gán cho nút trên Sheet vẫn giữ nguyên: `luuHoaDon`, `luuVaInHoaDon`, `taoHD`, `taoSoHoaDonTuDong`.

## Các bảng dữ liệu

Mã dùng bảng tính `1TfROVVl8D3d3UpbwvNADxg7elcCUmbgQZMfTQi8IyQw`. Các tab dưới đây được tạo khi thao tác lưu đầu tiên cần đến:

| Tab mới | Thứ tự cột từ A |
| --- | --- |
| `MATHANG` | `productId`, `name`, `type`, `price`, `requestId`, `requestHash`, `units`, `status`, `legacyUnit`, `baseUnit` |
| `NHAPKHO` | `id`, `date`, `supplier`, `address`, `total`, `paid`, `debt`, `requestId`, `requestHash` |
| `CT_NHAPKHO` | `receiptId`, `productId`, `name`, `qty`, `unit`, `price`, `subtotal` |
| `KHACHHANG` | `customerId`, `name`, `phone`, `address`, `createdAt`, `legacyKey` |
| `CONGNO_TONG` | `id`, `customerId`, `date`, `throughDate`, `customer`, `items`, `total`, `requestId`, `requestHash`, `requestAliases` |
| `THU_CONGNO` | `id`, `statementId`, `customerId`, `date`, `amount`, `note`, `allocations`, `requestId`, `requestHash`, `closingSnapshot` |

Đọc danh sách không tự tạo tab hay ghi dữ liệu. Các tab mới có dữ liệu nhưng tiêu đề không đúng sẽ báo lỗi để kiểm tra; mã không ghi đè dữ liệu đó. Các tab cũ `NHAPHANG`, `KHO`, `TKNHAPHANG` được giữ nguyên và không dùng làm nguồn tồn kho mới.

`MATHANG` cũ với sáu cột A:F vẫn đọc được. Khi lưu mặt hàng, mã bổ sung nhãn G:J còn trống: G `units` lưu JSON các `{unit, price, factor}`; H `status` là `pending` hoặc `active`; I `legacyUnit` chỉ rõ ĐVT của chứng từ cũ chưa ghi đơn vị; J `baseUnit` là ĐVT gốc. `factor` là số ĐVT gốc tương ứng với một ĐVT dòng hàng, ví dụ 1 bao = 50 kg thì factor của bao là 50. ĐVT gốc phải có giá bán và factor bằng 1. Cột D `price` được giữ để tương thích; giá bán từng ĐVT nằm trong `units`.

Các tab hóa đơn hiện có tiếp tục dùng thứ tự cột cũ:

| Tab | Cột hiện có | Phần bổ sung cho đơn theo dõi tồn |
| --- | --- | --- |
| `HOADON` | A:H: số HD, ngày, khách, địa chỉ, tổng, trả, nợ, người giao | I: `requestId`, J: `requestHash`, K: `customerId`, L: `debtStatementId` |
| `CHITIET_HD` | A:F: số HD, tên hàng, số lượng, ĐVT, đơn giá, thành tiền | G: `productId` |

Phần bổ sung chỉ ghi vào hóa đơn mới và nhãn cột còn trống của dòng tiêu đề. Không điền mã mặt hàng vào các dòng hóa đơn cũ.

Chi tiết lịch sử vẫn đọc được hai cấu trúc trong cùng tab `CHITIET_HD`: dòng 5 cột cũ từ `luuin.gs` có giá tại D, thành tiền tại E; dòng 6 cột từ web có ĐVT tại D, giá tại E, thành tiền tại F. Dòng F có giá trị (kể cả 0) là dạng 6 cột. Dòng F trống và D/E đều là số tiền được nhận dạng là dạng 5 cột. Dòng 6 cột thiếu thành tiền được tính từ số lượng × đơn giá. Dữ liệu lịch sử không được tự di chuyển hoặc ghi lại. Nếu ĐVT cũ là số và F trống, cần đối chiếu dòng mơ hồ đó trên Sheet.

## Quy tắc nghiệp vụ

- Mặt hàng hoàn thiện gồm tên, loại, ĐVT gốc và ít nhất một `{unit, price, factor}`; mã tự sinh `SP000001`, `SP000002`… Mỗi ĐVT có giá bán riêng và hệ số quy đổi dương. Giao diện hỗ trợ nhập phép nhân hoặc phép chia với ĐVT gốc; máy chủ lưu hệ số nhân tương ứng. Tên và đơn vị được chuẩn hóa để tránh trùng do hoa thường, Unicode hoặc khoảng trắng.
- Có thể cập nhật mặt hàng bằng `createProduct` kèm `productId`. Sau khi mặt hàng hoàn thiện đã có nhập/xuất, được sửa tên, loại, giá hoặc thêm ĐVT; không được đổi ĐVT gốc, ánh xạ ĐVT cũ, xóa ĐVT hoặc đổi hệ số làm sai lịch sử.
- Nhập kho nhận mặt hàng có sẵn hoặc tên tự nhập. Tên mới được cấp mã SP, lưu trạng thái `pending` và hiện ở khung **Chờ hoàn thiện mặt hàng** trên trang Kho. Không dùng giá nhập làm giá bán. Phải bổ sung loại, ĐVT gốc, giá và quy đổi cho các ĐVT đã nhập/xuất trước khi hàng chuyển sang `active` và được bán.
- Phiếu nhập có mã `NKddMMyyyyNNNN`, ngày, nhà cung cấp, địa chỉ, danh sách hàng, tổng tiền, đã trả và công nợ. ĐVT bắt buộc; số lượng/đơn giá phải dương và hữu hạn. Số lượng và lượng sau quy đổi có tối đa 6 chữ số thập phân, nhỏ nhất `0,000001`; máy chủ dùng số nguyên vi đơn vị, từ chối lượng không thể biểu diễn chính xác hoặc vượt giới hạn trước khi ghi. Máy chủ tính lại tiền và giữ công nợ âm khi trả dư.
- **Tồn mặt hàng hoàn thiện theo ĐVT gốc = tổng (số lượng nhập × factor) − tổng (số lượng bán × factor).** Hàng chờ giữ lượng riêng theo từng ĐVT nhập tới khi hoàn thiện. Hóa đơn lịch sử chưa có `productId` vẫn hiển thị, không tự đoán tên để trừ kho. Danh mục cũ chưa khai báo ĐVT được đưa vào chờ hoàn thiện; nếu chứng từ cũ không có ĐVT, chọn `legacyUnit` rõ ràng trước khi quy đổi, không ghi đè chứng từ cũ.
- Mọi hóa đơn bán mới phải dùng mặt hàng đã hoàn thiện và ĐVT đã cấu hình, kể cả khi danh mục đang trống. Máy chủ gộp nhu cầu cùng mặt hàng sau quy đổi rồi kiểm tra tồn dưới khóa. Mẫu `IN` nối theo tên duy nhất: mặt hàng chỉ có một ĐVT được dùng ĐVT đó; mặt hàng nhiều ĐVT bị chặn vì mẫu chưa xác định ô chọn ĐVT.
- Trong biểu mẫu bán, chọn ĐVT tự điền giá bán tương ứng; vẫn được sửa giá trên dòng. Mọi thay đổi tên hàng, ĐVT, số lượng, giá hoặc xóa dòng làm trống **Khách trả**. Số lượng cho nhập thập phân; nút/phím tăng giảm tới số nguyên liền kề, ví dụ 2,3 tăng thành 3, giảm thành 2; số 0 vẫn bị chặn khi lưu.

## Khách hàng và công nợ tổng

- Mục **Khách hàng** cùng cấp với Hóa đơn, Kho và Mặt hàng. Khi lưu hóa đơn cho khách mới, máy chủ cấp mã `KH000001` và liên kết các đơn bằng mã này; tên khách không phải khóa duy nhất.
- Chọn khách trong gợi ý để gửi đúng `customerId`, tự điền điện thoại/địa chỉ. Ô **Khách mới / khách trùng tên** bỏ việc tự chọn theo tên; cần điện thoại hoặc địa chỉ phân biệt. Máy chủ vẫn đối chiếu để tránh tạo trùng: mã KH là lựa chọn rõ ràng; sau đó đến số điện thoại chuẩn hóa; khi không có điện thoại thì dùng tên + địa chỉ đã chuẩn hóa. Cùng tên/địa chỉ nhưng điện thoại khác được tách KH; không có đủ thông tin để phân biệt thì yêu cầu chọn mã. Địa chỉ giao hàng mới khi đã chọn mã không làm sinh khách khác.
- Hóa đơn lịch sử chưa có K được nhóm chỉ đọc theo tên + địa chỉ, có mã tạm `LEGACY:...`. Khi lần đầu lập phiếu tổng hoặc lưu đơn cùng nhóm, máy chủ cấp KH thật và lưu `legacyKey`; các đơn cũ liên kết khi đọc, không ghi lại các dòng lịch sử.
- Bấm **Lập / In công nợ tổng** để gộp các đơn còn nợ chưa thuộc phiếu khác. Mỗi khách chỉ có một phiếu đang mở, mã `CNddMMyyyyNNNN`. Nếu đã có phiếu mở, thao tác trả lại phiếu đó; các đơn mới còn nợ được gắn mã phiếu tại L của HOADON và cộng vào cùng phiếu. Đơn đã trả đủ không làm tăng phiếu.
- **Thu tiền** cho phép thu một phần hoặc thu đủ, ghi mã `TTddMMyyyyNNNN`, ngày và ghi chú. Khoản thu phải dương và không vượt số nợ còn lại; máy chủ phân bổ vào đơn cũ trước (ngày rồi mã đơn). Lần thu lưu một dòng với `allocations` JSON, nên retry cùng requestId không thu trùng hoặc phân bổ dở dang.
- Khi thu đủ, cùng dòng thu tiền lưu `closingSnapshot` chốt danh sách và số tiền, phiếu chuyển `closed` và không nhận đơn mới. Đơn phát sinh sau đó chờ đợt tiếp theo; bấm lập công nợ lần sau tạo phiếu mới. Khách có nhiều phiếu theo các đợt, có thể xem/in lại phiếu cũ.
- F/G của hóa đơn gốc luôn là số trả/nợ lúc lập. API cộng khoản thu đã phân bổ để trả `paid`/`debt` hiện tại và giữ `originalPaid`, `originalDebt`, `debtPaid` khi cần. Tổng nợ khách là tổng các đơn còn nợ sau thu; phần trả dư được hiển thị riêng, không tự bù trừ.
- Phiếu công nợ dùng mẫu in riêng A4, gồm mã/tên/điện thoại/địa chỉ khách, các đơn thành phần, tổng nợ, đã thu, còn lại, lịch sử thu và trạng thái. Đây là bảng tổng công nợ, không tạo thêm hóa đơn bán hoặc trừ kho lần nữa. Hóa đơn bán/nhập vẫn dùng mẫu A5.

Các thao tác lưu dùng cùng `LockService.getScriptLock()`. Với phiếu nhập và đơn bán theo dõi tồn, chi tiết được ghi trước, dòng tổng được ghi cuối làm dấu hoàn tất. Chi tiết còn dang dở không cộng/trừ tồn; mã của chúng vẫn được bỏ qua khi cấp số tiếp theo để không ghép nhầm vào chứng từ khác. Những dòng này không bị tự xóa.

Website gửi `requestId` ổn định cho mỗi lần tạo/cập nhật mặt hàng, phiếu nhập và hóa đơn. Nhập/bán thử lại cùng mã và nội dung trả chứng từ đã lưu, không nhân đôi tồn; tên hàng tự nhập được giữ trong nội dung so sánh nên retry sau khi hoàn thiện/đổi tên vẫn nhận đúng phiếu. Cùng mã với nội dung khác báo lỗi. Mặt hàng giữ metadata của lần cập nhật gần nhất; retry yêu cầu tạo/cập nhật cũ hơn có thể báo lỗi an toàn sau một lần sửa tiếp theo. `requestHash` là nội dung JSON chuẩn hóa để kiểm tra xung đột.

## API

| Yêu cầu | Dữ liệu trả về |
| --- | --- |
| `GET ?action=list` | `{orders: [...]}` toàn bộ hóa đơn và chi tiết |
| `GET ?action=inventory` | `{schemaVersion: 2, products: [...], receipts: [...], stock: [...], lastReceiptId: "..."}` |
| `GET ?action=customers` | `{schemaVersion: 1, customers: [...], orders: [...], statements: [...], payments: [...]}` |
| `GET` không có action | `{lastId: "..."}` để xem trước mã hóa đơn |
| `POST` với `action: "createProduct"` | `{status: "success", product: {...}}`; gửi `productId` để sửa/hoàn thiện |
| `POST` với `action: "receiveStock"` | `{status: "success", receipt: {...}, stock: [...], products: [...]}` |
| `POST` hóa đơn hiện có | `{status: "success", id: "...", order: {...}}`; gửi `customerId`/`phone` để liên kết |
| `POST action: "createDebtStatement"` | Gửi `{customerId, requestId}`; trả `{status: "success", statement, customerId}` |
| `POST action: "payDebtStatement"` | Gửi `{statementId, amount, date, note, requestId}`; trả `{status: "success", payment, statement}` |

`product` gồm `{id, name, type, price, units, status, legacyUnit, baseUnit}`. GET kho bổ sung `receivedUnits` và `requiresLegacyUnit` phục vụ hoàn thiện. `stock` gồm `{productId, name, unit, qty}`, dùng ĐVT gốc cho hàng hoàn thiện hoặc ĐVT nhập cho hàng chờ. Dòng nhập gồm `{productId, name, qty, unit, price, subtotal}`; khi nhập tên mới, gửi `name` và để trống `productId`. Ô ngày theo múi giờ Việt Nam; lọc hóa đơn từ ngày/đến ngày chạy trên website và bao gồm cả hai mốc.

## Cập nhật deployment

1. Cập nhật cả sáu file `.gs` trong bảng trên, gồm `customers.gs` và `customer-debt.gs`, trong cùng dự án Apps Script.
2. Chọn **Deploy → Manage deployments**, mở Web app có URL `/exec` đang dùng trên website, bấm sửa, chọn **New version**, rồi **Deploy**. Giữ cấu hình người thực thi và quyền truy cập hiện tại. Cách này giữ nguyên URL; chỉ lưu file mà chưa cập nhật deployment thì website vẫn dùng mã cũ.
3. Kiểm tra `/exec?action=list` trả `orders`, `/exec?action=inventory` trả `schemaVersion: 2`, và `/exec?action=customers` trả `schemaVersion: 1` cùng `customers`, `orders`, `statements`, `payments`. Bước đọc không tạo tab hoặc tự sửa dữ liệu cũ; giao diện chặn API chưa đủ chức năng.
4. Trở lại website và bấm **Làm mới**. Hoàn thiện các mặt hàng cũ/chờ trong Kho, khai báo đầy đủ ĐVT/giá/quy đổi và ánh xạ ĐVT cũ nếu cần. Có thể tạo danh mục trước rồi nhập, hoặc nhập tên mới rồi hoàn thiện trước khi bán. Để trống ngày hoặc bấm **Xem tất cả** để xem toàn bộ lịch sử hóa đơn.

Sau mỗi lần sửa mã cục bộ, cần cập nhật dự án và deployment để website sử dụng bản mới. Nếu phản hồi có `status: "error"`, xem `message` để kiểm tra đúng bảng tính, tên tab, tiêu đề hoặc dữ liệu nhập.

Tài liệu Google: [Web app và `doGet`/`doPost`](https://developers.google.com/apps-script/guides/web), [khóa dùng chung](https://developers.google.com/apps-script/reference/lock/lock-service), [cập nhật deployment](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
