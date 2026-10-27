# Prompt backend: nhập JSON sản phẩm và danh mục từ PharmaShop Admin

Sao chép prompt này vào AI đang làm việc trong repository `pharmaShop_BE`.

---

Bạn đang làm việc trong backend NestJS + Prisma của PharmaShop. Hãy hoàn thiện API an toàn để Admin nhập hàng loạt sản phẩm và danh mục từ JSON được xuất bởi `tools/medicine-html-importer.html`.

## Bắt buộc kiểm tra trước khi sửa

1. Đọc `AGENTS.md`, Prisma schema, migrations, medicines/category controllers/services/DTOs, guards, Swagger và tests.
2. Contract hiện có đã xác minh:
   - `POST /api/v1/medicines` tạo một medicine; ADMIN-only.
   - DTO medicine bắt buộc `name`, `activeIngredient`, `category`, `price`, `packaging`; `stockQuantity`/`unit`/`imageUrl` tùy chọn.
   - `POST /api/v1/medicines/admin/categories` hiện chỉ nhận `{ name }`.
   - `GET /api/v1/medicines/admin/categories` trả các category `{ id, name, isActive, ... }`.
   - Prisma `MedicineCategory` hiện có `id`, `name` unique, `isActive`, timestamps; chưa có `imageUrl`.
   - Tạo medicine hiện upsert category theo tên; service có catalog cache invalidation/socket events.
3. Không truy cập database trực tiếp từ app. Admin mobile gửi JSON qua API HTTPS có JWT/role guard ADMIN; backend validate và ghi DB.
4. Không đoán DTO khác hoặc xóa/thay đổi route đang dùng. Giữ response envelope conventions hiện tại.

## 1. Bulk import products

Front-end parser xuất một mảng JSON, ví dụ:

```json
[
  {
    "name": "Viên uống Vitacap bổ sung vitamin và khoáng chất",
    "category": "Vitamin và khoáng chất",
    "price": 153000,
    "stockQuantity": 100,
    "unit": "Hộp",
    "imageUrl": "https://cdn.example.com/product.png"
  }
]
```

- Thêm route ADMIN-only đề xuất `POST /api/v1/medicines/admin/import` nhận `{ "items": [ ... ] }`.
- Dùng DTO riêng cho import. Các trường nguồn tối thiểu: `name`, `category`, `price`, `stockQuantity`, `unit`; `imageUrl` optional HTTPS.
- API import cần áp dụng đúng validate của medicine create. Bởi schema/API legacy yêu cầu `activeIngredient` và `packaging`, định nghĩa quy tắc rõ ràng: nhận optional `activeIngredient`/`packaging`; nếu thiếu, lưu `activeIngredient: "Chưa cập nhật"`, `packaging: unit`. Không suy đoán hoạt chất từ tên.
- `category` phải trỏ tới category đang active; không tự tạo category ngầm trong bulk import.
- Chọn giới hạn batch hợp lý (ví dụ tối đa 100), validate từng item, trả kết quả theo index: tạo thành công, lỗi validation/conflict. Không để lỗi một item làm mất báo cáo các item khác.
- Đảm bảo một sản phẩm không bị tạo hai lần nếu client retry sau timeout. Chọn idempotency key hoặc quy tắc deduplicate có căn cứ từ schema/business, tài liệu hóa và kiểm tra race condition; không tùy tiện dedupe theo tên nếu cho phép trùng tên.
- Dùng transaction theo batch/chunk phù hợp; gọi cache invalidation và realtime notification đúng conventions sau khi DB commit.
- Giữ nguyên `POST /medicines` và CRUD hiện có.

## 2. Category image và bulk import

Parser danh mục xuất:

```json
[
  { "name": "Thuốc cảm lạnh, ho", "imageUrl": "https://cdn.example.com/category.png" }
]
```

- Thêm `imageUrl` nullable vào Prisma `MedicineCategory` bằng migration; validate chỉ cho URL HTTPS, giới hạn độ dài và giữ `null` cho danh mục cũ.
- Cập nhật DTO/Swagger/API category admin list và public categories để trả `imageUrl` đúng contract. Sửa create/update category để nhận/thay/xóa ảnh theo conventions patch hiện tại.
- Thêm route ADMIN-only đề xuất `POST /api/v1/medicines/admin/categories/import` nhận `{ "items": [{ "name", "imageUrl" }] }`.
- Upsert theo tên category đã chuẩn hóa (trim; giữ nguyên hiển thị tiếng Việt). Nếu đã tồn tại thì cập nhật `imageUrl` và re-activate theo quy tắc được công bố; trả kết quả created/updated/failed theo index.
- Không ghi đè ảnh thành null nếu trường ảnh bị bỏ khỏi item; quy định riêng hành vi null rỗng.
- Giữ tương thích danh mục chuỗi legacy của Medicine và các quan hệ `categoryId`; không xóa dữ liệu.
- Xóa Redis/catalog cache sau khi commit, theo conventions hiện có.

## 3. Bảo mật và chất lượng

- Các route import phải dùng JWT + role guard ADMIN, validation whitelist, giới hạn payload/batch và trả envelope chuẩn.
- Không để client truyền category ID tùy ý để vượt trạng thái inactive; kiểm tra category ở server.
- Không log token, nguyên HTML copy, dữ liệu nhạy cảm hoặc payload dài; log tóm tắt số lượng và lỗi an toàn.
- Cập nhật migration, Swagger, DTO, tests cho permission, validation, URL ảnh, batch limit, item-level failures, duplicates/retries, category upsert và cache invalidation.
- Chạy typecheck, lint và tests backend hiện có; không deploy production.

## Báo cáo

Nêu migration, routes/DTOs cuối cùng, ví dụ request/response đầy đủ, quy tắc upsert/idempotency, lệnh kiểm tra và lệnh deploy migration. Nếu contract hiện hữu khiến đề xuất cần đổi, giải thích trước khi sửa; không tạo route trùng chức năng.

---

Frontend tool `tools/medicine-html-importer.html` xuất product array và category array riêng. Sau khi backend chốt contract, cập nhật frontend importer dùng đúng routes/DTO đã triển khai.

## Cập nhật trạng thái backend đã kiểm tra ngày 2026-10-27

Trong working tree backend hiện đã có `MedicineCategory.imageUrl`, DTO create/update có ảnh, `ImportMedicineCategoriesDto` và method `MedicineCategoriesService.import()` với response `total`, `created`, `updated`, `failed` (number), `results`. Tuy nhiên `MedicineCategoriesController` hiện chưa có route gọi method import và service/controller chưa hoàn toàn nối DTO. Frontend Admin hiện dùng contract đề xuất `POST /api/v1/medicines/admin/categories/import` với `{ "items": [{ "name", "imageUrl" }] }` và response trên.

Hãy hoàn tất controller route ADMIN-only, nối đúng DTO/service, sửa các lỗi type/build phát sinh, cập nhật Swagger và tests. Đảm bảo field `imageUrl` từ create/update thật sự được lưu và list trả về. Chạy backend typecheck/tests trước khi deploy API. Không đổi contract frontend nếu chưa báo rõ.

### Ghi chú frontend mới

Category importer trong Admin hiện gửi tuần tự từng mục qua các route CRUD đã tồn tại: `POST /medicines/admin/categories` cho danh mục mới và `PATCH /medicines/admin/categories/:id` cho danh mục đã có (cập nhật ảnh, bật lại danh mục). Frontend không gọi route `/medicines/admin/categories/import`, vì controller backend hiện chưa expose method bulk import.
