# Prompt bổ sung phân loại thông báo SYSTEM/EVENT cho PharmaShop

Sao chép prompt này vào AI đang làm việc trong repository `pharmaShop_BE`.

---

Bạn đang làm việc trong backend NestJS + Prisma của PharmaShop. Hãy bổ sung contract phân loại inbox thành **Thông báo hệ thống** và **Sự kiện**, tương thích với ứng dụng mobile.

## Kiểm tra trước khi sửa

1. Đọc `AGENTS.md`, `FE_AGENTS.md`, Prisma schema/migrations, notifications module, order/payment notification flows, Swagger và tests.
2. Contract hiện có:
   - `GET /api/v1/notifications?page=&limit=` trả `{ items, unreadCount, page, limit, total, hasMore }`.
   - Summary hiện có `notification: { id, type, title, body, createdAt }`.
   - `type` là `SHORT | PAGE` và mô tả **định dạng trình bày**, không phải category.
   - `POST /api/v1/notifications/admin/broadcast` nhận `type`, `title`, `body`, `content?`.
   - `GET /api/v1/notifications/:id` lấy chi tiết và đánh dấu đã đọc.
   - Order/payment có một số push trực tiếp nhưng chúng chưa được lưu thành inbox notifications và payload có thể chỉ mang `orderId`/`type`.
3. Không dùng `SHORT/PAGE` thay cho category nghiệp vụ. Giữ nguyên ý nghĩa type, response envelope và route đang dùng.

## Contract cần bổ sung

### Category và inbox

- Thêm category nghiệp vụ `SYSTEM | EVENT` độc lập với `type: SHORT | PAGE`.
- Giữ tương thích dữ liệu cũ; migration cần quy định rõ giá trị mặc định/backfill an toàn và nêu quyết định trong báo cáo.
- Summary của `GET /notifications` trả thêm:
  ```json
  {
    "category": "SYSTEM | EVENT",
    "imageUrl": "https://..." 
  }
  ```
  `imageUrl` nullable; với thông báo sự kiện dạng PAGE, lấy ảnh HTTPS đầu tiên trong content block IMAGE để mobile hiển thị thumbnail. Không đưa content blocks đầy đủ vào từng summary.
- Hỗ trợ lọc `GET /notifications?category=SYSTEM|EVENT&page=1&limit=20`; giữ phân trang, total/hasMore/unreadCount nhất quán theo filter.
- Detail trả thêm category nhưng giữ cấu trúc detail/content hiện tại.

### Tạo thông báo

- Bổ sung `category` bắt buộc hoặc có default rõ ràng trong `POST /notifications/admin/broadcast`.
- Cho phép SYSTEM và EVENT dùng cả SHORT/PAGE; chỉ validate quy tắc content theo `type` như hiện tại.
- Push payload tiếp tục chứa `notificationId`, `screen: "notification-detail"`, đồng thời có thể thêm category; mobile vẫn phải fetch detail từ API có authorization, không tin nội dung riêng tư từ payload.

### Thông báo phát sinh từ nghiệp vụ

- Xác định và bổ sung persistence trong inbox cho sự kiện trạng thái đơn hàng/thanh toán đang gửi push trực tiếp cho khách. Gắn category SYSTEM và liên kết recipient đúng user.
- Gửi push có `notificationId` của bản ghi inbox; không gửi dữ liệu cá nhân, địa chỉ hoặc nội dung nhạy cảm.
- Tránh tạo notification trùng khi payment webhook/order transition được retry; dùng transaction/idempotency phù hợp với lifecycle nghiệp vụ.
- Chỉ đưa sự kiện nghiệp vụ thật sự cần người dùng xem vào inbox; không biến mọi log thành notification.

## Bảo mật và chất lượng

- Giữ JWT/ownership guards cho inbox/detail; admin broadcast vẫn ADMIN-only.
- Validate enum, phân trang, HTTPS URL ảnh và response envelope theo conventions hiện có.
- Không đổi auth, cart, order hoặc payment API ngoài phần cần persist notification.
- Cập nhật Prisma migration, DTO, Swagger và tests cho filter/category, unread count, permission, image preview, idempotency và backward compatibility.
- Chạy typecheck/lint/tests backend hiện có; không deploy production.

## Hoàn tất

Báo cáo migration, endpoints/DTOs, cách backfill dữ liệu cũ, flows order/payment được lưu vào inbox, mẫu response, lệnh test và mọi bước deploy migration cần thiết.

---

Frontend hiện tạm thời phân loại dữ liệu cũ theo `PAGE → EVENT` và `SHORT → SYSTEM`. Khi backend trả `category`, frontend ưu tiên trường đó.
