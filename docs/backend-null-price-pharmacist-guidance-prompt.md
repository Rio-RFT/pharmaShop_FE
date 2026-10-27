# Prompt backend: giá sản phẩm chưa niêm yết

Sao chép prompt này vào AI đang làm việc trong repository `pharmaShop_BE`.

---

Hãy cập nhật backend PharmaShop để sản phẩm chưa có giá vẫn hiển thị trong catalog, nhưng khách hàng không thể thêm vào giỏ hoặc đặt mua và được hướng dẫn hỏi dược sĩ.

## Kiểm tra trước khi sửa

1. Đọc `AGENTS.md`, Prisma schema, DTO, medicines/cart/orders services, catalog search/detail, coupon và các test liên quan.
2. Xác nhận `Medicine.price` hiện đang là `Decimal NOT NULL`, import DTO yêu cầu `price` number và `parseImportItem()` từ chối `null`.
3. Không thay đổi contract ngoài các thay đổi cần thiết dưới đây; giữ response envelope và các sản phẩm có giá hiện tại hoạt động bình thường.

## Yêu cầu dữ liệu và import

1. Đổi `Medicine.price` thành nullable Decimal bằng migration an toàn, giữ nguyên giá của các sản phẩm hiện có.
2. `POST /medicines/admin/import` chấp nhận `price: null`; giá số vẫn phải >= 0 và tối đa hai chữ số thập phân. Không tự gán 0 hoặc giá mặc định.
3. Báo cáo import giữ đúng `price: null` cho sản phẩm chưa niêm yết.
4. Các DTO create/update và Swagger thể hiện rõ price có thể null. Không cho `null` bị đổi thành 0 bởi class-transformer.
5. Catalog search/detail trả `price: null` nguyên trạng. Khi lọc min/max price, sản phẩm chưa niêm yết không được ghép vào khoảng giá.

## Chặn mua hàng ở backend (bắt buộc)

Backend là nguồn sự thật; không dựa vào việc frontend disable nút.

1. `POST /cart/items` từ chối thêm sản phẩm có `price: null` với lỗi 400 thông báo sản phẩm cần dược sĩ tư vấn.
2. `PATCH /cart/items/:medicineId` cũng từ chối tăng/đặt số lượng sản phẩm giá null. Vẫn cho phép xóa sản phẩm khỏi cart.
3. Cart GET có thể trả về sản phẩm đã nằm trong giỏ từ trước, nhưng `lineTotal` của item đó phải null và không được cộng vào subtotal như giá 0. Chọn chính sách rõ ràng cho cart cũ: giữ để khách thấy và xóa, hoặc tự loại khỏi cart; không tính thành đơn có tổng tiền sai.
4. `POST /orders` kiểm tra lại mọi medicine trong transaction. Từ chối đơn nếu bất kỳ sản phẩm nào có giá null, kể cả sản phẩm được thêm trước khi giá bị xóa.
5. Không tạo PayOS link/đơn COD cho cart có item giá null. Coupon/minimum order cũng không được tính trên sản phẩm giá null.
6. Đảm bảo API checkout/cart response cho sản phẩm giá null không trả line total/subtotal giả bằng 0.

## Hoàn tất

- Cập nhật migration, DTO, OpenAPI, service, response typing và test.
- Test import `price: null`, catalog response, min/max filter, add/update/remove cart, cart subtotal và order rejection; thêm regression test để giá số bình thường vẫn hoạt động.
- Chạy Prisma generate, migration validation, typecheck, lint và test backend.
- Báo cáo tên migration, contract cập nhật, lệnh deploy/migrate cần chạy và xác nhận Render đã deploy đúng commit. Không tuyên bố đã hoàn tất deploy nếu chưa thực hiện.
