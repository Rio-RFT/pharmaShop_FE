# Prompt yêu cầu AI bổ sung API CRUD quản trị PharmaShop

Sao chép nội dung prompt bên dưới vào AI đang làm việc trong repository `pharmaShop_BE`.

---

Bạn đang làm việc trong backend NestJS + Prisma của PharmaShop. Hãy hoàn thiện các API quản trị còn thiếu để frontend admin mobile quản lý dữ liệu an toàn.

## Bắt buộc kiểm tra trước khi sửa

1. Đọc `AGENTS.md`, Prisma schema, Swagger setup, controllers, services, DTOs, guards/roles, migrations và tests hiện có.
2. Xác minh routes hiện có trước khi thêm gì. Hiện tại frontend dùng:
   - `GET /api/v1/users/admin/all` và `PATCH /api/v1/users/admin/:id` (phân trang, tìm kiếm, đổi `role`/`isActive`).
   - `GET /api/v1/medicines/search`, `POST/PATCH/DELETE /api/v1/medicines` (phân trang catalog; tạo/sửa/xóa sản phẩm).
   - `GET /api/v1/coupons/admin`, `POST/PATCH/DELETE /api/v1/coupons` (xóa là vô hiệu hóa).
   - `GET /api/v1/orders/admin/all` và `PATCH /api/v1/orders/:id/status` (đơn hàng phân trang, quản lý trạng thái).
   - Các route chat `/api/v1/chat/...` cho inbox, nhận xử lý, đọc/gửi tin nhắn, đề nghị kết thúc, archive và admin reopen.
3. Không đổi contract hiện có, không làm hỏng role CUSTOMER/PHARMACIST/ADMIN, response envelope, Socket.IO events hoặc client đang dùng.
4. Không cho app xử lý quyền hạn thay backend. Tất cả endpoint admin phải được bảo vệ bằng JWT và role guard ADMIN; kiểm tra trạng thái/ownership phía server.

## API còn thiếu cần đề xuất và triển khai

### Quản lý người dùng

- Thêm khả năng tạo tài khoản qua quy trình an toàn. Không nhận hoặc trả password mặc định dạng rõ; ưu tiên luồng invitation/đặt mật khẩu hoặc yêu cầu user tự kích hoạt. Validate phone/email không trùng và giới hạn vai trò được phép tạo.
- Thêm thao tác xóa mềm hoặc vô hiệu hóa/xóa dữ liệu cá nhân theo chính sách hiện có. Không xóa cứng người dùng có đơn hàng, thanh toán, chat hoặc dữ liệu cần lưu theo nghiệp vụ. Nếu `isActive=false` đã đáp ứng chính sách xóa tài khoản, giải thích và không tạo endpoint xóa trùng nghĩa.
- Không cho admin vô tình khóa hoặc hạ quyền tài khoản admin cuối cùng; xác định rõ quy tắc bảo vệ self-lock/self-demotion.

### Danh mục sản phẩm

- Hiện category là chuỗi `medicine.category` và danh sách category được suy ra từ sản phẩm; chưa có resource/controller CRUD riêng.
- Nếu cần quản lý danh mục thực sự, thiết kế model/DTO/API để tạo, liệt kê, sửa, ẩn/xóa mềm danh mục. Xác định migration, cách chuyển dữ liệu danh mục chuỗi hiện có, xử lý sản phẩm tham chiếu và tính tương thích ngược với `GET /medicines/categories` cùng search/filter hiện tại.
- Không xóa danh mục còn sản phẩm tham chiếu nếu chưa có quy tắc chuyển danh mục rõ ràng.

### Chat admin

- Xác nhận API hiện có cho phép gửi TEXT, PRODUCT và IMAGE cho staff/admin. Nếu backend đang hỗ trợ, giữ nguyên contract và bổ sung Swagger/tests còn thiếu.
- Nếu thiếu, thêm gửi sản phẩm bằng `medicineId` (snapshot sản phẩm tạo ở server) và upload ảnh theo Fivemanage presigned flow đã có; không gửi API key Fivemanage về client.
- Phát Socket.IO event theo conventions hiện hữu và đảm bảo archive/reopen/closure không làm lộ hội thoại cho user không liên quan.

## Không thêm CRUD không phù hợp nghiệp vụ

- Không tạo endpoint xóa cứng đơn hàng hoặc tin nhắn chỉ để đủ chữ CRUD. Dùng transition trạng thái đơn, archive hội thoại và retention policy có kiểm soát.
- Không đặt giá/stock/discount do client tính làm nguồn sự thật; backend validate và tính toán.
- Không commit secret, service account, API key hoặc dữ liệu production.

## Hoàn tất

- Cập nhật DTO validation, OpenAPI/Swagger, authorization và migration nếu cần.
- Viết/cập nhật tests cho quyền truy cập, validation, các trường hợp conflict/ràng buộc dữ liệu, và response contract.
- Chạy typecheck, lint và test backend hiện có.
- Báo cáo chính xác files/routes/DTO mới, migration cần chạy, contract mẫu, các quyết định bảo vệ dữ liệu và lệnh kiểm tra. Nếu một yêu cầu đã được API hiện có đáp ứng, không tạo route trùng; ghi rõ route được tái sử dụng.

---
