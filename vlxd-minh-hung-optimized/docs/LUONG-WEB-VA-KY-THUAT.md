**Luồng sử dụng và cách hoạt động kỹ thuật của website VLXD Minh Hùng**

Tài liệu theo mã nguồn và Apps Script phiên bản 15 đã triển khai ngày 04/11/2026: cửa sổ công nợ riêng, xem/sửa/in lại hóa đơn, tìm kiếm và số tồn dưới tên hàng. Bản in công nợ có từng mặt hàng gộp theo ngày. Các giới hạn và trường hợp lỗi được ghi cùng luồng sử dụng.

**1. Kiến trúc tổng thể.** Hệ thống gồm giao diện HTML/CSS/JavaScript chạy trong trình duyệt, Google Apps Script xử lý nghiệp vụ và Google Sheets lưu dữ liệu. Live Server tại cổng 5500 chỉ phục vụ các tệp giao diện trên máy; việc lưu hóa đơn thực hiện trên Google.

~~~mermaid
flowchart LR
    U["Người sử dụng"] --> W["index.html và JavaScript"]
    W -->|"GET / POST, JSON"| A["Google Apps Script: doGet / doPost"]
    A --> S["Google Sheets"]
    S --> A
    A -->|"Kết quả hoặc lỗi"| W
    W --> P["Hộp thoại in của trình duyệt"]
    IN["Mẫu IN trên Google Sheet"] -->|"Hàm của các nút"| A
~~~

Website chưa dùng React, Vue, hệ thống router, máy chủ Node.js riêng hoặc cơ sở dữ liệu SQL. Node.js và clasp được dùng để đưa mã lên Apps Script, không phải máy chủ phục vụ nghiệp vụ của website. URL Apps Script kết thúc bằng /exec là API trả JSON; nó không phải trang HTML quản lý mà người dùng đang mở.

**2. Bản đồ mã nguồn.** Các tệp có trách nhiệm như sau:

| Tệp | Trách nhiệm |
| --- | --- |
| [index.html](../index.html) | Bốn màn hình, các biểu mẫu dạng dialog, mẫu in bán/nhập và công nợ, nhãn và ID giao diện |
| [css/trangchu.css](../css/trangchu.css) | Màu sắc, bố cục, màn hình nhỏ, trạng thái nhập liệu; in A5 bán/nhập và A4 công nợ |
| [js/order-data.js](../js/order-data.js) | Chuẩn hóa tiền, ngày, hóa đơn; lọc, sắp xếp, escape HTML và tạo requestId |
| [js/order-api.js](../js/order-api.js) | URL API, fetch, timeout, kiểm tra phản hồi, các hàm đọc và lưu |
| [js/order-list.js](../js/order-list.js) | Danh sách hóa đơn bán, bộ lọc, bốn thống kê và trạng thái tải |
| [js/order.js](../js/order.js) | Biểu mẫu bán hàng, chọn sản phẩm, dòng tự động, tính tiền, lưu và gọi in |
| [js/inventory.js](../js/inventory.js) | Chuyển màn hình, danh mục, nhập kho, lịch sử nhập và hiển thị tồn |
| [js/customers.js](../js/customers.js) | Danh sách/tìm khách, đơn theo khách, phiếu tổng, các lần thu và tất toán |
| [js/printorder.js](../js/printorder.js) | Đưa hóa đơn đã lưu vào mẫu in dùng chung và gọi window.print |
| [apps-script/websang.gs](../apps-script/websang.gs) | Cấu hình bảng tính, API, lịch sử hóa đơn, kiểm tra dữ liệu và mã HD |
| [apps-script/inventory.gs](../apps-script/inventory.gs) | Mặt hàng, phiếu nhập, tính tồn, chống vượt tồn, chống lưu trùng |
| [apps-script/customers.gs](../apps-script/customers.gs) | Cấp KH, nhận diện khách, liên kết lịch sử và dữ liệu khách hàng |
| [apps-script/customer-debt.gs](../apps-script/customer-debt.gs) | Phiếu công nợ cộng dồn, thu tiền, phân bổ, bản chốt tất toán và chống trùng |
| [apps-script/invoice-edit.gs](../apps-script/invoice-edit.gs) | Revision hóa đơn, phiên bản, kiểm tra tồn và bản hiệu lực khi đọc/tính kho |
| [apps-script/luuin.gs](../apps-script/luuin.gs) | Các nút lưu, lưu và in, tạo hóa đơn mới trên mẫu IN |
| [apps-script/soHD.gs](../apps-script/soHD.gs) | Tạo số dự kiến trong IN!B5 và kiểm tra ngày IN!L1 |
| images/logo.png | Logo hiển thị trên thanh đầu trang |
| tests/ | Kiểm thử bằng dữ liệu/Google Sheets/DOM giả lập |

Các mô-đun JavaScript đặt chức năng trong window.InvoiceApp: Data, API, Inventory, Customers, List, Order, Print và notify. Chúng dùng hàm bao để hạn chế biến toàn cục; giao tiếp qua đối tượng chung này.

**3. Trình tự khi mở website.** Trình duyệt đọc index.html, CSS và logo. Bảy script có thuộc tính defer, chạy theo thứ tự: order-data → order-api → customers → inventory → order-list → order → printorder. Việc đăng ký các sự kiện diễn ra khi DOMContentLoaded.

Màn hình Hóa đơn được hiện sẵn; Kho, Mặt hàng và Khách hàng có hidden. order.js gọi List.init(), từ đó gọi API lấy toàn bộ lịch sử hóa đơn. Danh mục và kho chưa được tải riêng ngay ở bước đầu; chúng được tải khi mở Kho/Mặt hàng, khi biểu mẫu cần danh mục hoặc khi làm mới sau một thao tác lưu.

Không có localStorage, IndexedDB, service worker hoặc hàng đợi lưu ngoại tuyến. Dữ liệu giao diện và bản nháp nằm trong RAM của tab. Tải lại trang mất bản nháp chưa lưu; dữ liệu đã lưu trên Sheet sẽ được tải lại.

**4. Điều hướng giữa bốn màn hình.** Nút Hóa đơn, Kho, Mặt hàng và Khách hàng có data-view. Hàm showView() so khớp với data-page của từng section, bật/tắt hidden, đổi lớp active và aria-current.

Đây là bốn giao diện trong cùng index.html, không phải bốn URL độc lập. Đổi màn hình không tải lại toàn bộ trang và không thêm lịch sử router cho nút Back. Logo là liên kết index.html, có thể tải lại trang. Khi vào Kho/Mặt hàng, hệ thống gọi tải dữ liệu kho; khi vào Khách hàng gọi API khách hàng/công nợ. Khi quay về Hóa đơn, hệ thống không tự tải lại lịch sử bán chỉ vì đổi màn hình; thu công nợ thành công có gọi làm mới lịch sử để cập nhật số đã trả/còn nợ.

**5. Màn hình Hóa đơn.** Phần này gồm:

- Nút Tạo hóa đơn.
- Bốn ô thống kê: số hóa đơn, tổng tiền hàng, khách đã trả, công nợ.
- Bộ lọc Từ ngày / Đến ngày, Tìm kiếm, Xem tất cả.
- Nút Làm mới.
- Bảng chín cột: mã hóa đơn, ngày, khách hàng, địa chỉ, mặt hàng, tổng tiền, khách trả, công nợ, nhân viên giao.

Mỗi ô Mặt hàng dùng details/summary để mở danh sách dòng hàng, số lượng, đơn vị, giá và thành tiền. Mã hóa đơn bán là nút mở biểu mẫu xem chỉ đọc với dữ liệu đã lưu, có In lại và Chỉnh sửa. Chỉnh sửa dùng cùng giao diện lập hóa đơn; Hủy chỉnh sửa trả về bản đã lưu. Phiếu đã tất toán khóa sửa và nêu lý do, vẫn xem/in được. Chưa có chức năng xóa hóa đơn.

Hóa đơn xếp ngày mới nhất trước; cùng ngày thì so mã theo thứ tự số. Hóa đơn chưa xác định được ngày được xếp cuối. Dòng tiêu đề Sheet được nhận dạng và bỏ khỏi danh sách.

**6. Lọc ngày và thống kê.** API trả toàn bộ lịch sử; bộ lọc chạy trong trình duyệt trên dữ liệu đã tải. Điều kiện là ngày hóa đơn lớn hơn hoặc bằng Từ ngày và nhỏ hơn hoặc bằng Đến ngày.

| Cách nhập | Kết quả |
| --- | --- |
| Bỏ trống cả hai ngày | Xem toàn bộ, gồm hóa đơn chưa rõ ngày |
| Chỉ Từ ngày | Xem từ ngày đó trở đi |
| Chỉ Đến ngày | Xem đến hết ngày đó |
| Hai ngày bằng nhau | Xem đúng một ngày |
| Từ ngày sau Đến ngày | Báo lỗi, giữ kết quả lọc hợp lệ trước đó |
| Bấm Xem tất cả | Xóa hai mốc và từ tìm kiếm, hiện toàn bộ trở lại |

Đổi giá trị ô ngày chưa lọc ngay; phải bấm Tìm kiếm. Khi có bất kỳ mốc ngày nào, hóa đơn chưa rõ ngày bị loại khỏi kết quả và có thông báo số lượng.

Ô tìm kiếm lọc theo mã, khách/mã KH, điện thoại, địa chỉ, người giao và tên hàng ngay khi nhập, không phân biệt dấu/hoa thường. Tìm kiếm kết hợp khoảng ngày; thông báo trống phản ánh cả hai điều kiện. Bốn thống kê được tính lại từ các hóa đơn đang hiện, không phải luôn từ toàn bộ dữ liệu. Công nợ âm được cộng đúng dấu. Lọc lịch sử bán không thay đổi tồn kho và không lọc bảng phiếu nhập.

**7. Tạo và cập nhật mặt hàng.** Vào Mặt hàng → Thêm mặt hàng. Biểu mẫu cần tên, loại, đơn vị tính gốc và bảng các ĐVT. Mỗi ĐVT có giá bán lớn hơn 0 và hệ số quy đổi dương; ĐVT gốc cũng phải có giá và hệ số bằng 1. Loại và đơn vị là văn bản tự nhập; chưa có danh mục loại/đơn vị dùng chung.

Mã sản phẩm do máy chủ cấp, ví dụ SP000001. Người dùng không nhập mã. Tên được bỏ khoảng trắng thừa, chuẩn hóa Unicode NFC và so sánh không phân biệt hoa/thường; tên trùng bị từ chối dù loại khác. Việc so sánh này không bỏ dấu tiếng Việt.

Ví dụ ĐVT gốc là kg, khai báo kg giá 2.500, hệ số 1; bao giá 100.000, hệ số 50. Giao diện hỗ trợ nhân hoặc chia với đơn vị gốc: “bao, Nhân, 50” là 1 bao = 50 kg; “g, Chia, 1.000” là 1 g = 0,001 kg. API lưu `factor` là hệ số nhân cuối cùng.

Sau khi lưu, máy chủ trả mặt hàng chính thức, giao diện cập nhật theo mã, đóng biểu mẫu và tải lại Google. Tạo danh mục chưa làm phát sinh tồn. Nút Cập nhật cho phép sửa tên, loại, giá hoặc thêm ĐVT. Sau khi hàng hoàn thiện đã có nhập/xuất, máy chủ chặn đổi ĐVT gốc, ánh xạ ĐVT cũ, xóa ĐVT và đổi hệ số để bảo toàn lịch sử. Giá danh mục theo từng ĐVT là gợi ý; giá trên chứng từ vẫn sửa được.

**8. Màn hình Kho.** Có nút Làm mới và Nhập kho, với khung hóa đơn lớn và hai khung nhỏ bên cạnh:

| Khung | Nội dung |
| --- | --- |
| Hóa đơn nhập, khung lớn | Mã NK, ngày, nhà cung cấp, địa chỉ, mặt hàng, tổng tiền, đã trả, còn nợ |
| Chờ hoàn thiện mặt hàng | Các tên hàng mới nhập/cũ thiếu thông tin, mã SP và nút Hoàn thiện |
| Số lượng hàng trong kho | Mã sản phẩm, tên sản phẩm, ĐVT và số lượng còn lại |

Ô tìm kiếm Kho lọc đồng thời phiếu nhập theo mã/nhà cung cấp/địa chỉ/tên hàng, bảng tồn và danh sách chờ theo mã/tên/ĐVT; không thay đổi tồn thực. Mặt hàng có ô tìm mã/tên/loại/ĐVT. Cả hai bỏ dấu và không phân biệt hoa thường khi tìm.

Phiếu nhập xếp mới nhất trước; bấm mở chi tiết để xem hàng. Mã NK bấm được để in lại. Bảng tồn có cả hàng bằng 0; số đếm là số mã sản phẩm riêng biệt, không phải tổng số lượng hoặc số dòng ĐVT. Hàng hoàn thiện có một dòng tồn theo ĐVT gốc; hàng chờ có thể có nhiều dòng theo ĐVT nhập.

Hàng chờ chưa xuất hiện trong danh sách mặt hàng bán được. Bấm Hoàn thiện để bổ sung loại, đơn vị gốc, giá bán và quy đổi cho mọi ĐVT đã nhập/xuất. Hoàn thiện giữ nguyên mã SP và phiếu cũ, rồi tính tồn theo quy đổi. Danh mục cũ chưa có ĐVT cũng vào khung này. Nếu lịch sử có dòng không ghi ĐVT, phải chỉ rõ ĐVT áp dụng qua `legacyUnit`, không tự ghi sửa chứng từ cũ.

Kho mới không lấy số dư từ các tab cũ KHO, NHAPHANG, TKNHAPHANG. Nguồn tồn mới là chứng từ ở NHAPKHO/CT_NHAPKHO và hóa đơn bán có productId.

**9. Lập phiếu nhập.** Có thể nhập cả khi danh mục rỗng. Biểu mẫu có mã dự kiến, nhà cung cấp bắt buộc, địa chỉ tùy chọn, các dòng hàng, tổng tiền, đã trả và công nợ.

Mỗi dòng gồm tên/mã sản phẩm, số lượng, ĐVT bắt buộc, đơn giá nhập và thành tiền. Ô sản phẩm dùng datalist, nhận hàng có sẵn hoặc tên tự nhập. Hàng có sẵn được gợi ý ĐVT/giá, có thể sửa thành giá nhập thực tế. Với hàng đã hoàn thiện, ĐVT phải nằm trong danh mục; muốn nhập theo ĐVT mới phải khai báo quy đổi trước. Số lượng ban đầu là 1; ĐVT nhập là văn bản.

Tên mới được chuẩn hóa, cấp mã SP và ghi `pending`; cùng tên trong nhiều dòng chỉ tạo một mã. Giá nhập không được dùng làm giá bán. Lưu phiếu vẫn ghi nhận lượng hàng và đưa tên mới vào khung chờ để hoàn thiện trước khi bán.

Ngày và requestId được ghi nhận lúc mở biểu mẫu. Nút Trả đủ lấy tổng hiện tại điền vào ô đã trả. Lưu nhập kho chỉ lưu; Lưu và in lưu thành công rồi mới gọi in.

Máy chủ kiểm tra danh mục, nhà cung cấp, ngày, số lượng, giá, số tiền trả và giới hạn tính tồn trước khi ghi. Sau khi thành công, giao diện dùng mã NK chính thức, cập nhật lịch sử nhập/tồn bằng phản hồi, rồi gọi tải lại để đối chiếu dữ liệu mới nhất.

**10. Tạo hóa đơn bán.** Bấm Tạo hóa đơn tại màn hình Hóa đơn. Biểu mẫu gồm:

| Trường | Tính chất |
| --- | --- |
| Mã hóa đơn | Mã dự kiến, máy chủ quyết định mã chính thức |
| Tên khách hàng | Bắt buộc; chọn mã KH/gợi ý hoặc nhập khách mới |
| Điện thoại | Tùy chọn, dùng phân biệt/nhận diện khách |
| Địa chỉ | Tùy chọn |
| Các dòng hàng | Ít nhất một dòng hợp lệ |
| Nhân viên giao hàng | Tùy chọn |
| ĐVT từng dòng | Bắt buộc, chọn trong các ĐVT của mặt hàng |
| Khách trả | Bỏ trống được tính là 0; tự trống lại khi sửa chi tiết hàng hóa |
| Tổng và còn nợ | Tự tính |

Ngày hóa đơn được lấy theo ngày Việt Nam lúc mở biểu mẫu; giao diện chưa có ô chọn ngày bán. Khi mở, biểu mẫu reset, tạo requestId mới, để một dòng trống và khóa hai nút lưu cho tới khi tải được danh mục và mã dự kiến.

Ô tên hàng dùng datalist. Nó nhận mã sản phẩm, tên chính xác hoặc dạng “SP000001 — Tên hàng”, không phân biệt hoa/thường ở bước tìm trong danh mục giao diện. Đây không phải tìm kiếm mờ.

Dưới tên sản phẩm trong cả biểu mẫu bán và nhập có Số lượng hiện có. Hàng hoàn thiện hiển thị theo ĐVT chọn bằng tồn gốc chia hệ số; hàng chờ theo từng ĐVT nhập. Dòng trống ẩn số tồn; chưa có quy đổi thì báo rõ. Số đang hiển thị là tồn của dữ liệu đã tải, chưa giữ chỗ/trừ bản nháp, máy chủ kiểm tra lại khi lưu.

Chọn sản phẩm đã hoàn thiện tự điền ĐVT đầu tiên và giá tương ứng. Đổi ĐVT lấy giá bán của ĐVT vừa chọn. Nếu vẫn cùng mã đã nhận diện thì sửa lại tên không tự ghi đè giá người dùng đã sửa. Hàng ngoài danh mục hoặc đang chờ hoàn thiện bị chặn cả trên giao diện và máy chủ, kể cả đã có lượng nhập.

Mỗi thay đổi tên hàng, số lượng, ĐVT, giá hoặc xóa dòng đều làm trống Khách trả và tính lại công nợ. Sửa tên khách/địa chỉ/người giao không làm trống ô này. Có thể bấm Trả đủ lại sau khi đã chốt chi tiết.

Khách cũ được chọn bằng gợi ý có mã và thông tin liên hệ, tự điền điện thoại/địa chỉ. Tên trùng nhiều hồ sơ phải chọn đúng mã. Ô “Khách mới / khách trùng tên” bỏ việc tự chọn theo tên, cho nhập số điện thoại/địa chỉ phân biệt; máy chủ vẫn kiểm tra tránh gộp nhầm hoặc tạo trùng. Sau khi chọn mã, đổi địa chỉ giao không tạo khách mới.

Khi lưu, website gửi tên chuẩn và productId cùng số lượng/đơn vị/giá. Máy chủ kiểm tra tồn hiện tại, tính lại tiền, cấp mã HD rồi lưu. Sau đó giao diện đóng biểu mẫu, hiện hóa đơn vừa lưu, làm mới lịch sử và kho, rồi in nếu đã chọn Lưu và in.

**10a. Xem và chỉnh sửa hóa đơn đã lưu.** Bấm mã HD tại bảng Hóa đơn để mở cùng biểu mẫu ở chế độ chỉ đọc. Dữ liệu xem giữ subtotal/total/paid/debt đã lưu hoặc hiệu lực sau thu, không tính lại để làm mất giá trị lịch sử. Lỗi tải danh mục/khách vẫn cho xem/in nhưng không sửa.

Bấm Chỉnh sửa dùng giá trị hàng đã lưu và Khách trả ban đầu, hiển thị riêng số đã thu qua phiếu tổng. Dòng trống cuối chỉ thêm trong chế độ sửa. Thay chi tiết tiếp tục làm trống Khách trả; Trả đủ trừ số đã thu qua phiếu trước khi điền để không trả trùng. Hủy chỉnh sửa khôi phục toàn bộ bản đã lưu. Lưu thành công vẫn mở chế độ xem để đối chiếu/in lại.

API updateOrder giữ mã/ngày và gửi baseVersion + requestId. Máy chủ xét lượng nhập trừ tất cả đơn khác, rồi so lượng của bản mới, tương đương trả lượng cũ vào phép tính. Nó ghi duy nhất một dòng bản sửa hoàn chỉnh vào SUAHOADON; dòng tổng/chi tiết ban đầu không bị sửa/xóa. Phiên bản cũ báo xung đột, retry không ghi/thay kho lần nữa. Bản hiệu lực thay thế bản cũ khi đọc danh sách, tính kho và công nợ.

Đơn trong phiếu công nợ đang mở giữ nguyên khách, các khoản thu/phân bổ không đổi; sửa không được giảm nợ dưới tiền đã thu hoặc tự tất toán phiếu. Đơn thuộc phiếu đã tất toán không sửa để giữ bản chốt và nội dung in lại. Hóa đơn cũ thiếu liên kết mặt hàng có thể xem/in, nhưng khi sửa phải chọn lại danh mục/ĐVT hợp lệ.

**11. Quy tắc thêm và xóa dòng.** Cả nhập và bán đều giữ một dòng trống cuối danh sách:

| Thao tác | Dòng hiện ra |
| --- | --- |
| Mở biểu mẫu | Dòng 1 |
| Điền sản phẩm/tên ở dòng 1 | Dòng 1 và dòng 2 trống |
| Điền dòng 2 | Thêm dòng 3 trống |
| Xóa giá trị sản phẩm/tên dòng 2 | Giữ dòng 2 trống, xóa tất cả dòng sau |
| Bấm nút xóa một dòng | Bỏ dòng đó, dồn các dòng sau lên và đánh lại số thứ tự |
| Xóa dòng duy nhất | Tạo lại một dòng 1 trống |
| Bấm Thêm mặt hàng | Đưa con trỏ tới dòng trống cuối, không thêm nhiều dòng rỗng |

Với nhập và bán, điều kiện mở dòng sau là tên/mã không rỗng sau trim. Tên bán chưa khớp danh mục vẫn mở dòng sau, nhưng bị chặn khi lưu; tên nhập mới được phép tạo hàng chờ.

Chỉ xóa số lượng/giá mà còn tên/sản phẩm sẽ không làm mất các dòng sau. Xóa nội dung tên/sản phẩm ở giữa xóa luôn dữ liệu phía sau; các dòng bị xóa không được khôi phục tự động. Tổng và công nợ được tính lại ngay, dòng trống không gửi lên máy chủ.

**12. Cách tính tiền.** Với chứng từ theo dõi kho:

~~~text
Thành tiền dòng = Math.round(số lượng × đơn giá)
Tổng chứng từ  = tổng thành tiền từng dòng
Công nợ        = tổng chứng từ − số tiền đã trả
~~~

Làm tròn diễn ra trên từng dòng, không đợi cộng hết rồi mới làm tròn. Ví dụ 0,125 × 100.001 = 12.500,125 được lưu thành 12.500 đồng.

Tổng tính trên giao diện phục vụ xem trước. Máy chủ tính lại subtotal, total, debt từ số lượng/giá khi lưu theo dõi kho; không dùng tổng trình duyệt làm kết quả cuối. Bước kiểm tra đầu vào hóa đơn vẫn yêu cầu các trường tiền gửi lên có định dạng hợp lệ.

Số tiền trả lúc lập đơn phải không âm. Trả dư được chấp nhận và công nợ âm phản ánh phần dư. Khách có thể trả tiếp qua phiếu công nợ tổng; lần thu phải dương, không vượt nợ còn lại và được ghi vào sổ THU_CONGNO. Công nợ nhà cung cấp chưa có sổ trả tiếp tương ứng.

Tiền dùng kiểu Number của JavaScript; hóa đơn bán/nhập hiển thị theo vi-VN và thường làm tròn đến đồng. Sổ công nợ tính bằng số nguyên phần trăm đồng, kiểm tra tối đa hai chữ số thập phân và giới hạn số nguyên an toàn trước phân bổ/thu tiền. Dữ liệu tiền không biểu diễn chính xác hoặc vượt giới hạn bị chặn; giao diện công nợ hiển thị tới hai chữ số thập phân.

Ô nhập tiền khi gõ loại ký tự không phải chữ số rồi chèn dấu phân cách hàng nghìn; do đó không phải ô nhập giá âm hoặc tiền lẻ. Hàm đọc dữ liệu cũ hỗ trợ số, “1.200.000 đ”, “120.000”, các dấu tiền đ/₫/VND và phần thập phân một hoặc hai chữ số. Phần đuôi ba chữ số được hiểu theo cách phân cách hàng nghìn. Bộ đọc trình duyệt mềm hơn; bộ kiểm tra máy chủ chặn chuỗi tiền không đúng mẫu.

**13. Tính tồn kho.** Mã sản phẩm là khóa liên kết:

~~~text
Lượng theo ĐVT gốc = số lượng dòng × factor của ĐVT dòng
Tồn của SP = tổng lượng nhập đã hoàn tất theo ĐVT gốc
            − tổng lượng bán có productId và hóa đơn tổng theo ĐVT gốc
~~~

Máy chủ khởi tạo mỗi sản phẩm bằng 0, cộng các dòng phiếu nhập có phiếu tổng, rồi trừ các dòng bán có mã và hóa đơn tổng. Nó tính lại từ lịch sử khi đọc kho, kiểm tra bán hoặc xử lý nhập; không chỉ cập nhật một ô “tồn hiện tại”.

Ví dụ 1 bao = 50 kg: nhập 2 bao tạo tồn 100 kg; bán 2,3 kg còn 97,7 kg; bán thêm 1 bao còn 47,7 kg. Bộ lọc ngày trên trang bán không tác động tồn. Đây là tồn cộng dồn, chưa có báo cáo tại một ngày hoặc nhiều địa điểm kho.

Nếu một hóa đơn có nhiều dòng cùng sản phẩm, máy chủ quy đổi rồi cộng nhu cầu trước khi kiểm tra tồn. Tồn 100 kg, bán 1 bao (50 kg) và 60 kg bị chặn vì tổng 110 kg. Kiểm tra riêng từng dòng không được dùng.

Hàng chờ chưa có quy đổi giữ lượng riêng theo ĐVT nhập và chưa được bán. Hoàn thiện phải bao gồm các ĐVT đã dùng, kể cả lượng còn bằng 0; máy chủ thử tính lại toàn bộ lịch sử trước khi ghi danh mục mới. Chứng từ giữ nguyên số lượng/ĐVT thực tế; quy đổi dùng khi tính tồn.

**14. Độ chính xác số lượng.** Số lượng kho tối đa sáu chữ số thập phân có ý nghĩa, nhỏ nhất 0,000001; các số 0 thừa ở cuối không tạo thêm độ chính xác. Bên trong máy chủ:

~~~text
1 đơn vị hàng = 1.000.000 vi đơn vị
0,125         =   125.000 vi đơn vị
0,1 + 0,1 + 0,1 = 300.000 vi đơn vị = 0,3
~~~

Máy chủ phân tích phần nguyên, phần thập phân và số mũ, kiểm tra số dương/hữu hạn, chuyển thành số nguyên an toàn rồi cộng/trừ/so sánh. Cả số lượng nhập vào và lượng theo ĐVT gốc sau quy đổi phải biểu diễn được với tối đa sáu chữ số thập phân. Số quá nhỏ, quá nhiều chữ số hữu ích hoặc vượt giới hạn an toàn bị từ chối thay vì làm tròn mất hàng. Nhiễu Number rất nhỏ có thể được chuẩn hóa; không cấp thêm tồn ảo cho kho 0.

Number.MAX_SAFE_INTEGER là giới hạn số nguyên dùng để kiểm tra cả lượng từng dòng và lượng cộng dồn. Do thuật toán cộng tất cả nhập trước rồi trừ bán, giới hạn còn áp dụng vào tổng nhập lịch sử dù tồn ròng thấp. Phiếu nhập mới được tính thử bằng cùng thuật toán trước khi ghi.

Giao diện hiển thị tối đa sáu chữ số thập phân. Ô số lượng dùng min=0, step=1 và form novalidate để vẫn nhập được số thập phân, trong khi nút tăng/giảm và phím mũi tên chuyển đến số nguyên liền kề: 2,3 tăng thành 3, giảm thành 2; số nguyên tăng/giảm 1. Giảm có thể tới 0 nhưng lưu vẫn yêu cầu số lượng dương. Ràng buộc độ chính xác cuối cùng do máy chủ thực thi.

**15. Mã tự động.** Các nhóm chính:

| Nhóm | Cấu trúc, ví dụ ngày 03/11/2026 |
| --- | --- |
| Mặt hàng | SP000001, tăng dần toàn danh mục |
| Khách hàng | KH000001, tăng dần toàn danh mục |
| Phiếu công nợ tổng | CNddMMyyyyNNNN |
| Thu công nợ | TTddMMyyyyNNNN |
| Hóa đơn bán | HD031120260001 |
| Phiếu nhập | NK031120260001 |

Máy chủ tìm hậu tố lớn nhất hợp lệ cùng tiền tố rồi cộng 1; không dựa vào đếm dòng hay luôn lấy mã dòng cuối. SP đệm tối thiểu sáu chữ số, HD/NK tối thiểu bốn chữ số thứ tự; vượt số chữ số này mã được mở rộng.

HD quét cả HOADON và CHITIET_HD; NK quét NHAPKHO và CT_NHAPKHO. Mã đã có ở chi tiết dang dở cũng được coi là đã dùng. Hai nhóm HD/NK có bộ đếm riêng theo ngày.

Mã trên biểu mẫu chỉ là dự kiến vì có thể có người khác lưu trước hoặc có chi tiết dang dở chưa hiển thị. Phản hồi máy chủ luôn thay bằng mã chính thức khi lưu/in.

Một khác biệt cần biết: HD lưu từ web lấy phần ngày của mã theo thời điểm lưu ở máy chủ, còn trường ngày chứng từ đã được ghi nhận lúc mở form. Form để qua nửa đêm có thể có ngày chứng từ khác phần ngày trong mã. NK lấy ngày chứng từ gửi lên; mã dự kiến vẫn có thể khác trong lúc chờ tải qua nửa đêm. Mẫu IN dùng ngày tại L1 để sinh mã dự kiến.

**16. Xử lý ngày.** Nội bộ giao diện dùng YYYY-MM-DD để so sánh, hiển thị dd/MM/yyyy. Múi giờ chuẩn là Asia/Ho_Chi_Minh.

Hàm parseDate nhận ngày ISO, chuỗi d/M/yyyy và timestamp có múi giờ. Timestamp có Z hoặc độ lệch được quy về ngày Việt Nam. Nếu dữ liệu ngày không dùng được, có thể suy từ mã HD/NK đúng cấu trúc. Ngày không tồn tại như 31/02 không được tự đổi thành ngày tháng sau.

Apps Script chuyển ô Date của Sheet sang chuỗi ngày theo múi giờ Việt Nam; chuỗi lịch sử được trả để giao diện chuẩn hóa. Hàm dùng cho IN nhận Date hoặc chuỗi dd/MM/yyyy / yyyy-MM-dd, kiểm tra ngày thực, dùng mốc 05:00 UTC cho chuỗi để có ngày Việt Nam ổn định.

Ngày trong hai biểu mẫu web được giữ ổn định qua các lần bấm lưu lại, vì được ghi nhận lúc mở form cùng requestId.

**17. Dữ liệu được chia thành bảng tổng và bảng chi tiết.** Một chứng từ có một dòng tổng và nhiều dòng chi tiết, nối bằng mã hóa đơn. Tên cột/vị trí là hợp đồng dữ liệu của mã hiện tại.

| Tab | Thứ tự cột |
| --- | --- |
| MATHANG | A productId; B name; C type; D price; E requestId; F requestHash; G units; H status; I legacyUnit; J baseUnit |
| NHAPKHO | A id; B date; C supplier; D address; E total; F paid; G debt; H requestId; I requestHash |
| CT_NHAPKHO | A receiptId; B productId; C name; D qty; E unit; F price; G subtotal |
| HOADON | A id; B date; C customer; D address; E total; F paid; G debt; H shipper; I requestId; J requestHash; K customerId; L debtStatementId |
| KHACHHANG | A customerId; B name; C phone; D address; E createdAt; F legacyKey |
| CONGNO_TONG | A id; B customerId; C date; D throughDate; E customer; F items; G total; H requestId; I requestHash; J requestAliases |
| THU_CONGNO | A id; B statementId; C customerId; D date; E amount; F note; G allocations; H requestId; I requestHash; J closingSnapshot |
| CHITIET_HD, dòng mới theo dõi kho | A id; B name; C qty; D unit; E price; F subtotal; G productId |
| IN | Mẫu nhập/in trực tiếp trên Google Sheet |

MATHANG lưu mã tại productId trong Sheet nhưng API trả thuộc tính id; stock dùng productId. G `units` là JSON các `{unit, price, factor}`. H là `pending` hoặc `active`; I `legacyUnit` ánh xạ đơn vị cho dòng cũ thiếu ĐVT; J `baseUnit` là ĐVT gốc. D `price` giữ giá tương thích, giá bán từng ĐVT nằm trong G. Các bảng không có khóa ngoại SQL; Apps Script kiểm tra liên kết.

Tên, đơn giá, số lượng và thành tiền tại chi tiết là dữ liệu của chứng từ đã lập. Giá danh mục không tự thay lại giá chứng từ cũ; giá nhập không tự cập nhật giá bán danh mục. Tên tồn kho lấy tên hiện tại của danh mục; tên trong chứng từ có thể là tên đã lưu trước đó.

Các tab mới được tạo khi thao tác lưu đầu tiên cần đến. Nhập tên chưa có có thể tạo MATHANG cùng hai tab nhập. GET không tự tạo tab hoặc sửa cấu trúc. MATHANG sáu cột cũ vẫn đọc được; các nhãn G:J còn trống được bổ sung lúc lưu. Tiêu đề khác dự kiến báo lỗi; cột dư sau schema được bỏ qua. HOADON/CHITIET_HD có thể không có tiêu đề; chỉ dòng đầu được nhận dạng mới bị bỏ, không tự bỏ dòng tiêu đề lặp giữa bảng.

KHACHHANG dùng legacyKey để liên kết hóa đơn cũ không có K, không sửa lại các dòng cũ. SUAHOADON có cột orderId, version, order JSON, requestId, requestHash, baseVersion, createdAt; version bắt đầu từ 1 trên lần sửa đầu và tăng liên tục. Bản chưa sửa có version 0. CONGNO_TONG giữ ảnh chụp khách và các khoản nợ ban đầu dạng JSON; HOADON L nối các đơn nợ phát sinh vào phiếu đang mở. THU_CONGNO giữ allocations và closingSnapshot dạng JSON. F/G của HOADON luôn giữ số gốc lúc lập; API dùng bản sửa mới nhất nếu có, rồi dẫn xuất paid/debt hiện tại bằng các lần thu đã phân bổ.

Danh mục trùng mã/tên hoặc cấu hình đơn vị không hợp lệ bị chặn. Hàng chờ được thiếu loại, giá bán và units; danh mục cũ thiếu units được đọc thành chờ hoàn thiện. Phiếu nhập trùng/thiếu mã báo lỗi. Trình đọc hóa đơn bán cũ chưa phát hiện hết mã tổng trùng; sửa tay sai có thể ảnh hưởng kết quả.

**18. Các API hiện có.** Địa chỉ cơ sở nằm ở API_URL trong order-api.js; cùng một /exec xử lý tất cả.

| Phương thức | Tham số | Kết quả |
| --- | --- | --- |
| GET | Không có action | lastId của dòng hóa đơn tổng cuối, dùng hỗ trợ xem trước |
| GET | action=list | orders: toàn bộ hóa đơn bán đã ghép chi tiết |
| GET | action=inventory | schemaVersion: 2, products, receipts, stock, lastReceiptId |
| GET | action=customers | schemaVersion: 1, customers, orders, statements, payments |
| POST | action=updateOrder | id/baseVersion/requestId và nội dung mới; trả order chuẩn + phiên bản |
| POST | action=createProduct | status success và product; kèm productId để sửa/hoàn thiện |
| POST | action=receiveStock | status success, receipt, stock và products hiện tại |
| POST | Không có action hoặc action=saveOrder | status success, id và order với customerId/phone/debtStatementId |
| POST | action=createDebtStatement, customerId, requestId | status success, statement và customerId thật; tạo mới hoặc trả phiếu đang mở |
| POST | action=payDebtStatement, statementId, amount, date, note, requestId | status success, payment và statement mới nhất |

Ví dụ tạo mặt hàng:

~~~json
{"action":"createProduct","requestId":"yeu-cau-01","name":"Xi măng Hà Tiên","type":"Xi măng","baseUnit":"kg","units":[{"unit":"kg","price":2500,"factor":1},{"unit":"bao","price":100000,"factor":50}]}
~~~

Ví dụ nhập:

~~~json
{
  "action":"receiveStock",
  "requestId":"yeu-cau-02",
  "date":"2026-11-03",
  "supplier":"Nhà cung cấp A",
  "address":"Địa chỉ nhà cung cấp",
  "paid":500000,
  "items":[{"productId":"SP000001","qty":10,"unit":"bao","price":90000}]
}
~~~

Ví dụ bán, tương tự dữ liệu biểu mẫu gửi:

~~~json
{
  "requestId":"yeu-cau-03",
  "id":"HD031120260001",
  "date":"03/11/2026",
  "customer":"Khách A",
  "customerId":"KH000001",
  "phone":"0901234567",
  "address":"Công trình A",
  "shipper":"Anh giao hàng",
  "total":"200.000 đ",
  "paid":"150.000",
  "debt":"50.000 đ",
  "items":[{"productId":"SP000001","name":"Xi măng Hà Tiên","qty":"2","unit":"bao","price":"100.000","subtotal":"200.000 đ"}]
}
~~~

Ví dụ lỗi:

~~~json
{"status":"error","message":"Không đủ tồn kho cho Xi măng Hà Tiên. Còn 1."}
~~~

Các ví dụ là mô tả hợp đồng, không phải dữ liệu đã gửi lên Sheet. Action không hỗ trợ, thiếu payload hoặc JSON lỗi đều được trả lỗi. Ngày bỏ trống được mặc định theo ngày hiện tại khi máy chủ chuẩn hóa; tiền trả bỏ trống được đọc là 0. Không có tham số lọc ngày/phân trang được thực thi trên máy chủ; thứ tự API là thứ tự dòng Sheet. lastId/lastReceiptId lấy dòng tổng vật lý cuối chứ không bảo đảm là mã lớn nhất.

`products` có `{id, name, type, price, units, status, legacyUnit, baseUnit, receivedUnits, requiresLegacyUnit}`. `stock` có `{productId, name, unit, qty}`; unit là ĐVT gốc cho hàng hoàn thiện hoặc ĐVT nhập cho hàng chờ. Nhập tên mới gửi `name`, để trống productId. Hoàn thiện gửi lại productId với cấu hình đầy đủ, thêm legacyUnit nếu lịch sử có dòng thiếu ĐVT.

**19. Chuỗi xử lý khi lưu bán.** Mọi hóa đơn bán mới dùng danh mục và theo dõi kho:

~~~mermaid
sequenceDiagram
    actor N as Người dùng
    participant W as JavaScript
    participant A as Apps Script
    participant S as Google Sheets
    N->>W: Bấm Lưu / Lưu và in
    W->>W: Kiểm tra biểu mẫu, khóa nút
    W->>A: POST JSON kèm requestId
    A->>A: Kiểm tra đầu vào, lấy script lock
    A->>S: Đọc danh mục, yêu cầu cũ và chứng từ
    alt Yêu cầu đã lưu cùng nội dung
        A-->>W: Trả hóa đơn đã lưu
    else Yêu cầu mới
        A->>A: Chuẩn hóa, tính tiền, gộp nhu cầu, kiểm tra tồn
        A->>A: Nhận diện/cấp KH, tìm phiếu công nợ đang mở
        A->>S: Ghi chi tiết, flush
        A->>S: Ghi dòng tổng kèm customerId và debtStatementId, flush
        A-->>W: Mã và dữ liệu chính thức
    end
    A->>A: Nhả khóa trong finally
    W->>W: Cập nhật bảng, làm mới lịch sử/kho/khách hàng
    opt Chọn Lưu và in
        W-->>N: Mở hộp thoại in
    end
~~~

Trên thực tế Apps Script tạo đối tượng phản hồi rồi nhả khóa trong finally trước khi kết thúc hàm. Sơ đồ mô tả thứ tự nghiệp vụ, không phải một giao dịch SQL.

**20. Lớp fetch và lỗi mạng.** order-api.js gom giao tiếp mạng vào request():

- fetch dùng cache no-store, AbortController và timeout 25 giây.
- POST dùng Content-Type text/plain;charset=utf-8, nhưng nội dung vẫn là JSON.stringify của đối tượng. Loại nội dung này phù hợp cách gọi Apps Script từ trang khác nguồn.
- Kiểm tra HTTP thành công rồi vẫn kiểm tra JSON status/error/success; HTTP 200 không tự có nghĩa đã lưu.
- Lỗi máy chủ có message được đưa về biểu mẫu bằng textContent.
- Phản hồi POST kiểu cũ “Success”, “OK”, “đã lưu” được nhận theo mẫu hẹp; phản hồi mơ hồ như đối tượng rỗng không được coi đã lưu.
- GET trả “API OK” hoặc chỉ lastId không được giả thành lịch sử/kho rỗng.
- Nếu API kho chưa có schemaVersion từ 2 trở lên và các mảng đúng cấu trúc, giao diện báo cần cập nhật deployment.
- Không có tự động gửi lại POST trong vòng lặp; người dùng chủ động thử lại trên biểu mẫu.

Timeout của trình duyệt không bảo đảm Apps Script đã dừng. Máy chủ có thể đã ghi thành công khi trình duyệt không nhận được kết quả; đây là lý do cần requestId và thông báo chưa xác nhận kết quả lưu.

**21. Chống lưu trùng bằng requestId.** Mỗi lần mở biểu mẫu tạo một requestId. Ưu tiên crypto.randomUUID; nếu không có dùng thời gian và số ngẫu nhiên. Mã này không phải khóa đăng nhập hoặc chữ ký bảo mật.

Trong cùng lần mở form, lỗi mạng và bấm lưu lại giữ nguyên mã. API nhận requestId là chuỗi không quá 160 ký tự trước khi trim, không bắt buộc đúng dạng UUID. Lập phiếu tổng và thu tiền bắt buộc mã không rỗng; bán/nhập vẫn tương thích trường hợp bỏ trống theo mô tả dưới. Mã được đối chiếu trong từng bảng riêng; cùng chuỗi ở tạo mặt hàng và nhập kho không phải một yêu cầu duy nhất chung hai loại. Máy chủ lưu mã cùng requestHash:

| Trường hợp | Xử lý |
| --- | --- |
| Chưa có mã yêu cầu | Lưu chứng từ mới |
| Cùng mã, cùng dữ liệu chuẩn hóa | Trả bản đã lưu, không cộng/trừ thêm |
| Cùng mã, dữ liệu khác sau khi đã lưu | Báo xung đột |
| Không gửi requestId qua API | Cơ chế nhận diện gửi lại bị bỏ qua |

requestHash là chuỗi JSON chuẩn hóa, không phải hash mật mã. Bán hàng có thêm mã KH/điện thoại trong nội dung so sánh khi được gửi, nên không được thử lại cùng mã để đổi khách. Lập/xuất lại phiếu tổng giữ requestId và requestAliases để retry sau tất toán vẫn trả đúng đợt cũ, không mở nhầm phiếu mới. Thu tiền so sánh phiếu, số tiền, ngày, ghi chú; cùng mã không làm phát sinh lần thu thứ hai. Với nhập/bán, nó giữ ngày, đối tác, địa chỉ, số trả và các dòng productId/qty/unit/price. Dòng nhập không có productId giữ tên chuẩn hóa ban đầu để retry sau khi hàng được hoàn thiện/đổi tên vẫn nhận đúng phiếu. Tên do danh mục cung cấp và subtotal suy ra không gây xung đột. Máy chủ nhận cả dạng hash chứng từ của bản trước khi cập nhật khi có thể đối chiếu.

MATHANG giữ requestId/hash của lần tạo/cập nhật gần nhất. Sau một lần sửa tiếp theo, thử lại yêu cầu tạo/cập nhật cũ hơn có thể nhận lỗi trùng/xung đột an toàn; chưa có sổ yêu cầu riêng lưu toàn bộ lịch sử chỉnh sửa sản phẩm.

Thứ tự dòng vẫn là một phần nội dung so sánh. Nhập lại cả form mới hoặc tải lại trang tạo requestId mới; dữ liệu giống nhau ở form mới vẫn có thể thành chứng từ mới.

Phiếu nhập gửi lại trả phiếu ban đầu cùng tồn hiện tại; hóa đơn bán gửi lại trả hóa đơn đã lưu; tạo mặt hàng gửi lại trả mặt hàng tương ứng hiện trong danh mục. Danh mục bị xóa/hỏng có thể làm kiểm tra thất bại trước khi tới bước trả yêu cầu cũ.

**22. Khóa khi nhiều người cùng thao tác.** Các lần đọc API và các đường ghi web/IN dùng cùng LockService.getScriptLock(), chờ tối đa 20 giây.

Ví dụ tồn 10, hai người cùng bán 7: người thứ nhất giữ khóa, kiểm tra và lưu; người thứ hai chờ, sau đó đọc tồn còn 3 và bị chặn. Mã chính thức cũng được cấp dưới khóa, giúp tránh cấp trùng.

Khóa chỉ phối hợp các hàm trong cùng dự án Apps Script. Nó không khóa người đang sửa trực tiếp ô Sheet hoặc một dự án khác tự ghi cùng bảng. Nhiều lần đọc toàn bộ dữ liệu cũng phải chờ, nên có thể làm tăng thời gian phản hồi.

**23. Ghi chi tiết trước, ghi tổng sau.** Với phiếu nhập và bán theo dõi kho:

1. Kiểm tra toàn bộ dữ liệu trước khi ghi chi tiết.
2. Ghi tất cả dòng chi tiết.
3. flush để đẩy thay đổi.
4. Ghi dòng tổng làm dấu chứng từ đã hoàn tất.
5. flush lần cuối.

Chi tiết không có dòng tổng tương ứng không được cộng/trừ vào tồn. Nếu lỗi giữa chừng, mã đó vẫn được giữ để lần sau không ghép nhầm chứng từ khác. Các dòng dang dở được giữ lại, chưa có tác vụ tự dọn.

Đây không phải transaction có rollback toàn bộ. Ghi nhãn cột hoặc một số chi tiết có thể đã xảy ra khi một bước sau lỗi. Nếu dòng tổng đã lưu nhưng flush cuối hoặc bước đọc sau đó lỗi, phía người dùng vẫn có thể thấy lỗi; gửi lại cùng requestId cho phép nhận chứng từ đã hoàn tất.

**24. Trạng thái giao diện và chống phản hồi cũ.** Danh sách bán giữ orders, một Map các hóa đơn vừa lưu chờ đối chiếu, bộ lọc và số thứ tự lần tải. “Pending” trong Map này là hóa đơn máy chủ đã xác nhận, không phải hàng đợi gửi ngoại tuyến.

Khi tải lại thành công, dữ liệu máy chủ thay thế bản tạm và bỏ trùng theo mã. Khi tải lỗi, dữ liệu đã có được giữ cùng thông báo có thể chưa cập nhật. Danh sách cũ phản hồi muộn không được ghi đè lần tải mới.

Kho giữ products, receipts, stock và lastReceiptId. Hai màn hình dùng cùng bộ dữ liệu. pending ở mô-đun kho là Promise tải đang chạy; nhiều yêu cầu thông thường có thể dùng chung. load(true) tạo lần tải mới và bỏ qua phản hồi cũ theo loadVersion, không thật sự hủy các request cũ.

Khách hàng giữ customers, orders, statements, payments và số thứ tự lần tải. Bấm Xem công nợ mở dialog riêng của đúng khách, có tên/mã/liên hệ, đơn và phiếu tổng; đóng dialog về danh sách, không gộp nội dung chi tiết xuống trang khách. Từ dialog khách có thể mở dialog phiếu tổng hoặc thu tiền; tìm kiếm theo mã/tên/điện thoại/địa chỉ. Khi lập phiếu hoặc thu tiền, khóa nút và giữ requestId qua lỗi mạng; sau thành công tải lại dữ liệu.

ensureLoaded() dùng lại dữ liệu đã tải thành công nếu chưa có lỗi; không phải lần nào mở form cũng lấy danh mục mới. Tồn chính xác vẫn do máy chủ kiểm tra khi lưu. Không có WebSocket hoặc tự đồng bộ theo giây; dữ liệu được cập nhật khi vào màn hình, Làm mới hoặc lưu thành công.

Các biểu mẫu có busy/ready và số lần opening. Khi lưu, khóa nhập và nút, không cho gửi trùng hoặc đóng bằng các nút/Escape của app. Phản hồi của lần mở form đã đóng không được sửa form mới. Đóng rồi mở lại reset bản nháp; chưa có xác nhận mất dữ liệu. Toast hiện khoảng 4,5 giây.

**25. Tương thích dữ liệu hóa đơn cũ.** Lịch sử CHITIET_HD có hai cách lưu:

| Dạng | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| Dạng 5 cột cũ từ IN | Mã HD | Tên | Số lượng | Giá | Thành tiền | Trống |
| Dạng 6 cột từ web | Mã HD | Tên | Số lượng | ĐVT | Giá | Thành tiền |

Mã đọc nhận dạng từng dòng. F có giá trị, kể cả 0, được đọc theo dạng 6 cột; F trống và D/E đọc được như tiền được nhận dạng theo dạng cũ. Dòng mới thiếu subtotal có thể tính lại từ qty × price.

Trường hợp ĐVT là số mà F thiếu có thể mơ hồ. Không có việc tự di chuyển hoặc sửa lại các dòng lịch sử. Hóa đơn thiếu chi tiết vẫn có thể xuất hiện với danh sách mặt hàng rỗng. Dữ liệu items dạng JSON chuỗi cũ cũng được giao diện chuẩn hóa; chuỗi không đọc thành mảng được giữ để hiện nội dung.

Hóa đơn cũ chưa có productId vẫn hiển thị nhưng không trừ vào tồn mới. Tồn đầu kỳ phải ghi bằng phiếu nhập. Mọi hóa đơn bán mới cần mặt hàng đã hoàn thiện; danh mục trống hoặc còn hàng chờ thì không được dùng đường lưu tự do để bỏ qua kiểm tra kho. Dữ liệu hóa đơn lịch sử được giữ nguyên.

Danh mục cũ sáu cột MATHANG được đưa vào chờ bổ sung ĐVT/giá/quy đổi, không mất mã hay chứng từ. Nếu tồn cũ không ghi đơn vị, người dùng chọn legacyUnit trước khi hoàn thiện; hệ thống dùng ánh xạ đó khi tính lại thay vì ghi sửa lịch sử.

**26. Thao tác trực tiếp trên mẫu IN.** Các hàm giữ nguyên tên để nút trên Sheet tiếp tục gọi được.

| Vùng IN | Nội dung mã đang đọc |
| --- | --- |
| B5 | Số hóa đơn |
| L1 | Ngày |
| C8 | Khách hàng |
| C9 | Địa chỉ |
| B12:B27 | Tên hàng, tối đa 16 vị trí dòng |
| E12:E27 | Số lượng |
| F12:F27 | Đơn giá |
| G12:G27 | Thành tiền |
| E28 | Tổng |
| E29 | Khách trả |
| E30 | Nợ |
| E32 | Người giao |

taoSoHoaDonTuDong() lấy ngày L1, sinh mã xem trước và điền B5. luuHoaDon() đọc các ô, kiểm tra toàn bộ dòng có tên, lấy khóa, chặn mã đã có rồi lưu. Khác form web, IN bỏ qua dòng không có tên nhưng vẫn có thể đọc các dòng có tên phía sau một dòng trống.

IN tìm mặt hàng đã hoàn thiện theo tên chuẩn hóa duy nhất, kiểm tra tồn và ghi productId. Mẫu chưa xác định ô ĐVT, nên mặt hàng chỉ có một ĐVT được dùng đơn vị duy nhất đó. Nếu có nhiều ĐVT, lưu bị chặn; dùng biểu mẫu web để chọn đúng đơn vị, không tự đoán từ giá. Khi mã B5 đã tồn tại hoặc có chi tiết dang dở, cần tạo mã mới. Mã tự sinh dạng HD nhưng B5 sửa tay hiện chỉ kiểm tra không trống/trùng, chưa kiểm tra đầy đủ mẫu ký tự. Cảnh báo UI mở sau khi nhả khóa.

luuVaInHoaDon() chỉ chạy in khi luuHoaDon() trả true. Nó mở URL xuất PDF từ Sheet với vùng A1:G32, giấy A5 dọc, scale=2, lề 0,5, canh ngang giữa, không gridlines và đúng gid của tab IN. Nó không lưu PDF tự động vào Drive. L1 không trực tiếp nằm trong vùng xuất này.

PDF lấy mẫu IN đang có, không lấy lại chứng từ chuẩn hóa từ bảng dữ liệu. Khi theo dõi kho, máy chủ tính lại tiền nhưng không ghi ngược các kết quả đó vào các ô IN; công thức hoặc dữ liệu trên mẫu sai có thể làm bản PDF khác số đã lưu.

taoHD() xóa B6, B12:F27, E29:G29, E32:G32, C8:G9 rồi tạo mã B5 mới. Hàm không xóa L1, E28/E30 hoặc cột G12:G27; các vùng công thức còn lại phụ thuộc mẫu Sheet hiện tại.

Mã API mở bảng bằng SPREADSHEET_ID; các nút IN dùng bảng đang gắn script qua getActiveSpreadsheet(). Vì vậy dự án cần gắn đúng bảng tính đang sử dụng.

**27. In từ website.** printorder.js chuẩn hóa chứng từ, điền các phần tử p_id, p_date, p_name, p_address, p_table, p_total, p_paid, p_debt, p_shipper và gọi window.print().

| Nội dung | Bán | Nhập |
| --- | --- | --- |
| Tiêu đề | HÓA ĐƠN BÁN HÀNG | PHIẾU NHẬP KHO |
| Đối tác | Tên khách hàng | Nhà cung cấp |
| Dòng tiền đã trả | KHÁCH TRẢ | ĐÃ THANH TOÁN |
| Phần ký/tên cuối | NGƯỜI GIAO HÀNG | NHÀ CUNG CẤP |

Phiếu công nợ có vùng in riêng A4, liệt kê từng hàng hóa: ngày hóa đơn, tên, số lượng, ĐVT, đơn giá, thành tiền. Các dòng cùng ngày dùng ô gộp theo mẫu; dữ liệu và mã đơn được escape. Tổng tiền cộng giá trị các đơn; Đã trả cộng trả ban đầu và thu theo phiếu; Nợ lại là số dư hiệu lực. Goods được giữ trong snapshot, phiếu cũ thiếu goods đọc thêm từ đơn; bản chốt mới giữ đủ hàng hóa để in lại. Phiếu vẫn giữ lịch sử thu và trạng thái. Body chỉ bật printing-debt trong lúc gọi in; hóa đơn bán/nhập tiếp tục dùng vùng in A5, tránh in lẫn hai mẫu.

Mẫu bán/nhập có tên cửa hàng và số điện thoại cố định trong HTML, số/ngày hóa đơn, địa chỉ, sáu cột STT/tên/ĐVT/số lượng/đơn giá/thành tiền và ba tổng tiền. CSS in ẩn giao diện quản lý/dialog/toast, hiện printArea dù vùng này hidden trên màn hình, dùng A5 dọc, lề 8 mm và Times New Roman.

Lưu và in lưu trước; hủy hộp thoại in không hủy hóa đơn hoặc hoàn tồn. In không phải thao tác lưu lại. Phiếu nhập in lại bằng mã NK; hóa đơn bán bấm mã HD rồi In lại, dùng bản đã lưu kể cả đang có bản nháp chỉnh sửa. Không có xác nhận máy in đã in, xử lý afterprint hay tự xuất PDF trên website.

Ctrl/Cmd+P trực tiếp dùng printArea đã được chuẩn bị lần cuối, hoặc mẫu còn trống nếu chưa chuẩn bị; không tự lấy toàn bộ bảng đang xem làm hóa đơn.

**28. Bố cục, khả năng sử dụng và trình duyệt.** Giao diện dùng màu xanh đậm/xanh dương, nền sáng, màu xanh lá cho thao tác lưu/in và màu đỏ cho lỗi/công nợ.

Máy tính có bốn thẻ thống kê một hàng; Kho có lưới hóa đơn nhập lớn và cột bên chứa hàng chờ/tồn kho. CSS có điểm chuyển ở 1050 px và 700 px. Dưới 700 px, điều hướng xuống hàng riêng, thẻ thống kê thành hai cột, các khung kho xếp dọc và nhóm form thành một cột.

Bảng và dòng nhập có chiều rộng tối thiểu, cuộn ngang trên màn hình nhỏ thay vì giấu cột. Dialog cuộn trong giới hạn màn hình, thanh nút cuối bám đáy, nền sau được làm tối.

HTML có label, aria-label theo số dòng, table caption, scope cho tiêu đề, vùng role=status/alert, aria-busy/aria-invalid, focus rõ và tôn trọng prefers-reduced-motion. Khi đóng dialog bằng app, con trỏ trở lại phần tử đã mở nó. Form bán có xử lý bấm ra ngoài để đóng; form mặt hàng/nhập dùng nút đóng hoặc Escape.

Ứng dụng cần JavaScript và trình duyệt hiện đại hỗ trợ dialog, fetch, AbortController, Intl, Promise/async và các cú pháp JavaScript đang dùng. Chưa có giao diện dự phòng đầy đủ khi JavaScript tắt.

**29. Quyền truy cập và phạm vi bảo vệ hiện tại.** Manifest triển khai đang ghi runtime V8, múi giờ Việt Nam, executeAs=USER_DEPLOYING và access=ANYONE_ANONYMOUS. API thực hiện bằng quyền người triển khai; khách truy cập website không cần được chia sẻ trực tiếp file Sheet để gọi API.

Website hiện chưa có đăng nhập người dùng, tài khoản, phân quyền nhân viên/chủ cửa hàng, API key, chữ ký yêu cầu hay kiểm tra người gọi trong doGet/doPost. Người có địa chỉ API có thể gọi các chức năng đọc/ghi được cung cấp. Đây là cấu hình đang dùng, không phải cơ chế truy cập nội bộ đã được xây dựng.

Kiểm tra số lượng/tồn/giá và khóa nằm trên máy chủ nên không phụ thuộc việc nút trình duyệt đang khóa. Tuy nhiên các kiểm tra này không phải xác thực danh tính hoặc phân quyền.

Dữ liệu khi chèn HTML được escape các ký tự &, <, >, dấu nháy; các thông báo/nội dung văn bản dùng textContent. Cơ chế này giảm khả năng dữ liệu tên/địa chỉ bị trình duyệt hiểu thành HTML/script. Nó không mã hóa dữ liệu trong Sheet và không thay thế kiểm soát truy cập.

requestHash không phải chữ ký; requestId không phải bí mật. Mã hiện ghi chuỗi vào Sheet qua appendRow/setValues, chưa có lớp riêng để vô hiệu hóa mọi chuỗi có thể được Sheet hiểu thành công thức.

Quyền Google đã cấp cho clasp dùng để quản lý mã và triển khai, khác với đăng nhập cho người sử dụng website. Thông tin đăng nhập công cụ được lưu trong thư mục triển khai riêng, quyền tệp hạn chế, được .gitignore loại khỏi mã nguồn; không gửi xuống index.html hoặc đưa vào các file .gs.

**30. Lỗi và kết quả nhìn thấy.**

| Tình huống | Phản ứng |
| --- | --- |
| Chưa tải được danh mục | Khóa lưu form cần danh mục, báo lỗi |
| Chưa có mặt hàng | Nhập tên mới được phép; bán yêu cầu có hàng hoàn thiện |
| Trùng tên sản phẩm | Máy chủ từ chối tạo |
| Nhập tên chưa có trong danh mục | Cấp mã SP chờ, ghi nhận kho và yêu cầu hoàn thiện trước khi bán |
| Bán hàng chờ/ngoài danh mục hoặc thiếu ĐVT | Từ chối trước khi ghi hóa đơn |
| ĐVT chưa khai báo hoặc quy đổi không biểu diễn chính xác | Yêu cầu hoàn thiện/sửa cấu hình hoặc số lượng |
| Đổi ĐVT gốc/hệ số của hàng đã có lịch sử | Từ chối để giữ số lượng lịch sử nhất quán |
| Số lượng/giá không hợp lệ | Báo lỗi, không ghi chứng từ mới |
| Bán quá tồn hoặc tổng hai dòng quá tồn | Từ chối trước khi ghi chi tiết |
| Tải lịch sử/kho thất bại sau khi đã tải được | Giữ dữ liệu cũ và nêu có thể chưa cập nhật |
| Timeout lúc lưu | Giữ form, không khẳng định đã lưu; cùng requestId cho phép thử lại |
| Phản hồi cũ đến muộn | Bỏ qua bằng số thứ tự yêu cầu |
| Lưu thành công nhưng không mở được in | Báo đã lưu, lỗi chỉ ở bước in |
| Danh mục bị xóa nhưng còn mã/chứng từ kho | Chặn bán, cần khôi phục danh mục |
| Tab mới sai cấu trúc hoặc liên kết sản phẩm mất | Báo lỗi thay vì tự đoán/sửa đè |
| Trùng tên khách không đủ thông tin phân biệt | Yêu cầu chọn mã hoặc nhập thông tin riêng |
| Thu vượt nợ, số âm/0 hoặc phiếu đã tất toán | Từ chối trước khi ghi thu tiền |
| Bấm lập tổng khi khách có phiếu đang mở | Trả lại phiếu mở, không tạo đợt chồng chéo |
| Đơn nợ mới sau khi phiếu đã tất toán | Chờ lập phiếu đợt mới, phiếu cũ giữ nguyên |

Một số lỗi đọc chung có thể chặn cả lần tải, không chỉ bỏ qua dòng sai. Ví dụ CHITIET_HD thiếu mã, MATHANG trùng tên, phiếu nhập trùng mã hoặc tham chiếu mã sản phẩm không có.

**31. Triển khai và bảo trì.** Có hai phần được cập nhật độc lập:

| Phần | Cách có hiệu lực |
| --- | --- |
| HTML/CSS/JS | GitHub Pages/Netlify triển khai từ Git, hoặc Live Server phục vụ tệp cục bộ; trình duyệt cần tải lại |
| Apps Script | Cập nhật nội dung dự án, tạo version và cập nhật deployment đang dùng |

Đã triển khai Apps Script 15 ngày 04/11/2026 sau khi sao lưu phiên bản 14: cập nhật cả bảy file .gs gồm invoice-edit.gs và cập nhật deployment cũ để giữ URL. API kho giữ schemaVersion 2, API khách hàng dùng schemaVersion 1; updateOrder trả bản hiệu lực có version/canEdit/editBlockedReason. Bản sao mã không phải bản sao dữ liệu Sheet; việc kiểm tra dữ liệu thật chỉ đọc, không lập chứng từ thử.

Chỉ sửa file .gs trên máy không thay đổi Google; chỉ lưu mã trong trình chỉnh sửa Google chưa đổi version mà /exec đang trỏ tới. Các nút IN chạy mã đã lưu trong dự án, nên có thể dùng bản HEAD mới hơn bản web nếu chưa cập nhật deployment.

API_URL ở order-api.js, SPREADSHEET_ID và tên hai tab hóa đơn ở websang.gs, ba tab kho ở inventory.gs, thông tin cửa hàng trong mẫu in HTML là các điểm cấu hình cần biết.

Để triển khai từ máy đã dùng Node.js, Google clasp, OAuth và bật Apps Script API của tài khoản. Các bước đọc/ghi mã này không phải quy trình người dùng phải làm mỗi lần lập hóa đơn.

**32. Kiểm thử hiện có.** Các bộ kiểm thử dùng JavaScriptCore và mô phỏng, không tạo chứng từ giả vào bảng thật:

| Tệp | Phần được kiểm tra |
| --- | --- |
| tests/invoices.test.js | Ngày/tiền, API, lịch sử, bộ lọc, giữ dữ liệu, in, hợp đồng kho |
| tests/order-rows.test.js | Dòng bán, stock hint, xem/in/sửa/hủy, originalPaid/debtPaid, version/retry, trạng thái khóa và lỗi tải |
| tests/inventory-ui.test.js | Điều hướng, tải kho, tạo/cập nhật đơn vị, hàng chờ, nhập tên mới, tính tiền, chống bấm trùng, in |
| tests/apps-script.test.js | Hóa đơn cũ/mới, số tự động, đọc chi tiết, thao tác IN, kiểm tra và khóa |
| tests/inventory-backend.test.js | Danh mục nhiều ĐVT, quy đổi, hàng chờ/hoàn thiện, dữ liệu cũ, tồn, gửi lại, lỗi giữa chừng và độ chính xác |
| tests/inventory-flow.test.js | API JavaScript thật gọi doGet/doPost thật qua Sheet giả lập |
| tests/customers-backend.test.js | Cấp KH, nhận diện/mã/điện thoại, khách trùng tên, legacy, retry và liên kết đơn |
| tests/invoice-edit.test.js | Revision nguyên tử, stock delta/quy đổi, phiên bản/retry/xung đột, công nợ mở và khóa tất toán |
| tests/debt-print.test.js | Dòng hàng theo ngày, tổng giá trị/đã trả, escape và mẫu in |
| tests/customer-debt.test.js | Công nợ cộng dồn, phân bổ FIFO, thu từng phần/đủ, tất toán, nhiều đợt, retry, legacy và lỗi ghi |

Các tệp apps-script-mocks.js và ui-dom-fixture.js cung cấp Sheet/DOM giả. Kiểm thử bao gồm số thập phân và retry không cộng/trừ lần nữa, nhập 2 bao với factor 50 thành 100 kg, bán theo kg/bao, chặn hàng chờ, hoàn thiện giữ mã, ánh xạ ĐVT cũ và khóa hệ số sau phát sinh kho.

Đã kiểm tra luồng trên Edge bằng Playwright với frontend/API/Apps Script thật và Google Sheets giả: nhập tên mới → chờ → hoàn thiện quy đổi nhân/chia → bán thập phân, chọn giá ĐVT, xóa Khách trả và trừ đúng tồn. Kiểm tra này không ghi chứng từ thật. Chưa có bộ trình duyệt duy trì trong repository, thử tải lớn hoặc giám sát liên tục; kiểm thử mô phỏng cũng không xác nhận mọi máy in/trình duyệt hay tải nhiều người trên Google.

**33. Những chức năng chưa có.** Các mục sau không được suy ra từ chữ “quản lý kho” hoặc “hóa đơn”:

| Nhóm | Chưa được xây dựng |
| --- | --- |
| Người dùng | Đăng nhập, vai trò, phân quyền, nhật ký theo nhân viên |
| Danh mục | Xóa hàng trên UI, danh mục loại/đơn vị dùng chung, barcode, lịch sử mọi lần chỉnh sửa |
| Đối tác | Hồ sơ/mã nhà cung cấp riêng, sổ công nợ tổng nhà cung cấp, gộp/sửa/xóa hồ sơ KH trên UI |
| Chứng từ | Xóa/hủy hóa đơn bán; sửa/xóa phiếu nhập; trả hàng và hoàn tiền |
| Thanh toán | Sổ trả nợ nhà cung cấp, hoàn tác/sửa lần thu đã lưu, tự bù khoản khách trả dư |
| Kho | Nhiều kho, chuyển kho, kiểm kê, tồn theo ngày, cảnh báo tồn thấp |
| Giá vốn | Bình quân/FIFO, giá trị tồn, lợi nhuận, tự cập nhật giá từ lần nhập |
| Tìm kiếm/báo cáo | Phân trang, lọc ngày phiếu nhập, xuất Excel/CSV, báo cáo tổng hợp nâng cao |
| Tự động hóa | Đồng bộ thời gian thực, lưu ngoại tuyến, tự dọn dòng lỗi, sao lưu Sheet định kỳ |
| Hóa đơn | Kết nối nhà cung cấp hóa đơn điện tử, thuế/VAT/chiết khấu/phí vận chuyển riêng |

GET kho đọc HOADON và CHITIET_HD mỗi tab một lần, không tăng số lần đọc theo số mặt hàng. Đọc lịch sử và tính tồn hiện quét toàn bộ vùng dữ liệu Sheet; chưa có phân trang, chỉ mục, cache tồn hoặc bộ tổng hợp tăng dần. Nhiều dòng hơn dẫn đến nhiều dữ liệu tải/DOM và thời gian giữ khóa hơn. Các giới hạn dung lượng/thời gian của dịch vụ Google cũng có thể ảnh hưởng vận hành; mã hiện chưa tách tác vụ lớn thành hàng đợi.

Sửa/xóa trực tiếp các dòng Sheet có thể làm số liệu thay đổi, làm mất liên kết hoặc tạo tồn âm; các kiểm tra trước khi lưu từ ứng dụng không tự sửa được dữ liệu thủ công không nhất quán. Bộ đọc bán cũ chưa loại hết trường hợp mã tổng trùng. Bộ sinh mã SP chỉ quét MATHANG hiện có: nếu xóa tay mã lớn nhất, mã đó có thể được cấp lại cho mặt hàng khác và ảnh hưởng liên kết chứng từ cũ; chưa có quy trình xóa sản phẩm an toàn trên ứng dụng.

**34. Ví dụ nghiệp vụ hoàn chỉnh.** Giả sử danh mục mới chưa có tồn:

1. Tạo “Xi măng Hà Tiên”, loại “Xi măng”, ĐVT gốc kg giá 2.500/hệ số 1 và bao giá 100.000/hệ số 50 → cấp SP000001, tồn 0 kg. Có thể nhập tên mới trước rồi hoàn thiện cùng cấu hình này trong Kho.
2. Nhập 100 bao, giá nhập 90.000, trả nhà cung cấp 5.000.000 → NK tổng 9.000.000, nợ 4.000.000, tồn 5.000 kg.
3. Bán 20 bao, giá 100.000, khách trả 1.500.000 → HD tổng 2.000.000, khách nợ 500.000, tồn 4.000 kg. Nhập Khách trả sau khi đã chốt chi tiết; sửa chi tiết sẽ làm trống khoản trả để kiểm tra lại.
4. Gửi lại cùng requestId/nội dung bước 3 → nhận chính hóa đơn đó, tồn vẫn 4.000 kg.
5. Lập hóa đơn mới bán 81 bao → nhu cầu 4.050 kg vượt tồn 4.000 kg, không ghi chứng từ mới.
6. Lọc ngày màn hình Hóa đơn → chỉ bảng/thống kê bán đổi; tồn vẫn 4.000 kg.

Khoản nợ nhà cung cấp và khoản khách còn nợ nằm trên hai nhóm chứng từ khác nhau; hệ thống không tự bù trừ hai khoản này hoặc tính chúng thành lợi nhuận.
