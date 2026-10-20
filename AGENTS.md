# FE_AGENTS.md — PharmaShop Mobile Frontend Operating Guide

Tài liệu này hướng dẫn AI agent phát triển ứng dụng mobile PharmaShop bằng React Native và Expo. Tài liệu UI kế thừa các nguyên tắc trong `C:\Users\quocl\Desktop\AGENTS FILES STORE\MINIMALISM_AGENTS.md`; các quy tắc dưới đây chuyển chúng thành cách làm phù hợp với native mobile.

## 1. Mục tiêu và phạm vi

- Một ứng dụng mua dược phẩm chạy trên **iOS và Android**, xây bằng **React Native + Expo**.
- Điều hướng dùng **Expo Router**.
- Phục vụ luồng mua hàng vừa đủ cho đồ án giữa kỳ: xác thực, khám phá/tìm kiếm sản phẩm, chi tiết sản phẩm, giỏ hàng, địa chỉ, đặt hàng, thanh toán, theo dõi đơn, hồ sơ và thông báo.
- Hỗ trợ tài khoản `CUSTOMER`, `PHARMACIST`, `ADMIN` theo khả năng backend hiện có. Chỉ hiển thị màn hình hoặc thao tác tương ứng với role được cấp.
- Không triển khai upload/đơn thuốc, duyệt toa Rx, chat, loyalty, hoặc các tính năng không có trong backend hiện tại nếu chưa được yêu cầu.
- Giữ UI tối giản, hiện đại, y tế, dễ đọc và dễ thao tác. Không biến mọi vùng thành card; dùng khoảng cách, căn chỉnh, typography và phân cấp trước khi thêm nền, viền hoặc đổ bóng.
- Theme hỗ trợ sáng/tối và tự chọn theo cài đặt thiết bị; cả hai theme dùng chung cấu trúc tokens và phải giữ tương phản/accessibility.
- Điều hướng chính gồm 5 tab: **Trang chủ, Danh mục, Giỏ hàng, Đơn hàng, Tài khoản**. Giữ các luồng phụ như chi tiết sản phẩm, checkout và thanh toán ngoài tab bar.
- Giỏ hàng được lưu ở backend cho người dùng đã đăng nhập; sau logout không giữ dữ liệu tài khoản trong cache local. Nếu backend chưa có cart API thì báo rõ và đề xuất bổ sung contract thay vì âm thầm triển khai giỏ hàng local lâu dài.

## 2. Nguồn sự thật và thứ tự ưu tiên

Khi có mâu thuẫn, tuân theo thứ tự:

1. Yêu cầu cụ thể của người dùng trong task hiện tại.
2. API contract thực tế tại Swagger `/api/docs` và backend code đang chạy.
3. Cấu trúc và conventions sẵn có của ứng dụng mobile.
4. Tài liệu này.
5. Nguyên tắc tổng quát từ `MINIMALISM_AGENTS.md`.

Trước khi sửa UI:

1. Đọc file này và `MINIMALISM_AGENTS.md`.
2. Khảo sát package, Expo SDK, routing, design tokens và components hiện có.
3. Kiểm tra endpoint/DTO thực tế; không suy luận request/response từ tên route.
4. Xác định mục tiêu màn hình, nội dung chính, hành động chính và các trạng thái.
5. Tái sử dụng primitives/components đã có; chỉ tạo abstraction mới khi có nhiều nơi dùng hoặc có trách nhiệm rõ ràng.

## 3. Công nghệ và ranh giới kiến trúc

- **Runtime:** React Native + Expo, TypeScript strict.
- **Routing:** Expo Router; route file nên mỏng, chuyển việc hiển thị và nghiệp vụ cho feature modules.
- **Server state:** ưu tiên TanStack Query nếu dự án đã dùng hoặc cần quản lý cache/refetch. Không tạo một lớp state server riêng trùng chức năng.
- **Local UI state:** React state hoặc store nhẹ chỉ cho trạng thái giao diện dùng chung. Không lưu thông tin server lâu dài trong global store nếu query cache phù hợp hơn.
- **Forms:** dùng React Hook Form và schema validation hiện có trong app; không thêm thư viện mới nếu chưa cần.
- **Icons:** dùng `lucide-react-native`; không dùng emoji làm icon.
- **Networking:** gom API client, base URL, auth headers, timeout và lỗi chuẩn hóa vào shared layer. Feature không gọi `fetch` rải rác.
- **Secrets:** không ghi API keys, PayOS keys, SMTP credentials, Google client secret, JWT secrets hoặc Redis credentials vào app, source code, log hay bundle Expo.

### Redis và cache

- Redis chỉ chạy ở **backend/server**. Ứng dụng mobile gọi API; không kết nối Redis trực tiếp và không chứa Redis credentials.
- Backend dùng Redis cache catalog sản phẩm với TTL ngắn và xóa cache khi sản phẩm, giá hoặc tồn kho đổi. Mobile cache phản hồi API bằng TanStack Query hoặc cơ chế hiện hữu, với stale time và invalidation phù hợp từng dữ liệu.
- Dữ liệu đơn hàng, thanh toán, tồn kho và profile cần cập nhật thì invalidate/refetch khi có mutation hoặc sự kiện realtime; không xem cache client là nguồn sự thật.
- Không cache thông tin nhạy cảm trong storage không an toàn. JWT/refresh token chỉ lưu bằng `expo-secure-store` hoặc giải pháp an toàn tương đương.

## 4. Hybrid folder structure

Áp dụng cấu trúc hybrid: **Expo Router theo route**, phần nghiệp vụ và UI gom theo **feature**, primitives và dịch vụ dùng chung đặt trong **shared**. Giữ cấu trúc hiện hữu nếu nó đã nhất quán; không di chuyển hàng loạt file chỉ để khớp ví dụ.

```text
app/                         # Expo Router: layouts, tabs, route adapters
  (auth)/
  (shop)/
  (account)/
  order/
src/
  features/
    auth/
    catalog/
    medicine-detail/
    cart/
    checkout/
    orders/
    payments/
    profile/
    notifications/
    pharmacist/              # Chỉ các dashboard/API thực sự còn hỗ trợ
  shared/
    api/                     # API client, DTO transport, error mapping
    components/              # Button, Input, ProductImage, EmptyState...
    hooks/
    lib/                     # formatters, validators, platform utilities
    theme/                   # tokens, typography, spacing, colors
    types/
  assets/
```

Trong một feature, ưu tiên nhóm theo mục đích thay vì tạo nhiều tầng rỗng:

```text
features/catalog/
  api/
  components/
  hooks/
  screens/
  types.ts
```

## 5. Nguyên tắc minimalism và visual system

- Mỗi màn hình có một mục tiêu chính, một hành động chính dễ nhận biết và thứ bậc nội dung rõ.
- Ưu tiên layout mở và khoảng trắng hợp lý. Chỉ dùng surface/card khi nó thể hiện grouping, trạng thái, tương tác hoặc quyền sở hữu nội dung.
- Dùng design tokens tập trung cho màu, typography, khoảng cách, bán kính, kích thước controls và elevation. Không rải magic numbers hay màu tùy tiện.
- Giữ bảng màu y tế nhất quán: nền trung tính sáng, màu nhấn y tế xanh/cyan và màu trạng thái có ngữ nghĩa. Chỉ dùng màu đỏ cho lỗi/nguy hiểm, không dùng làm trang trí.
- Dùng typography dễ đọc; tên thuốc, hàm lượng/quy cách, giá, tồn kho và trạng thái đơn phải phân biệt được ngay.
- Tránh gradient, glassmorphism, shadow nặng, viền kép, icon trang trí, animation liên tục và card lồng card nếu không phục vụ nhiệm vụ.
- Dùng ảnh sản phẩm theo tỉ lệ ổn định, có placeholder/loading/error; không để lỗi tải ảnh làm vỡ layout.
- Tôn trọng safe areas, bàn phím, notch, kích thước màn hình nhỏ/lớn, font scaling và chế độ Reduce Motion.
- Không dùng CSS/web-only assumptions trong React Native; dùng primitives và APIs tương thích Expo/iOS/Android.

## 6. Component và tương tác

- Component dùng lại nhận props rõ nghĩa, có kiểu chặt chẽ và semantic variants như `primary`, `secondary`, `destructive`, `loading`, `disabled`.
- Mọi control phải có trạng thái phù hợp: idle, pressed, disabled, loading, success/error nếu áp dụng.
- Vùng chạm đủ lớn cho ngón tay; icon button cần accessibility label. Không chỉ dùng màu để truyền đạt trạng thái.
- Form có label, validation gần trường lỗi, keyboard phù hợp kiểu dữ liệu, trạng thái gửi và chống gửi lặp.
- Hành động có tác động như hủy đơn cần xác nhận và giải thích kết quả.
- Modal/sheet có hành vi đóng rõ, xử lý Android back, bàn phím và safe area.
- Danh sách lớn dùng `FlatList`/`SectionList`, key ổn định, pagination/infinite query theo API; không render toàn bộ catalog bằng `ScrollView`.
- Loading, lỗi, danh sách rỗng, offline và nội dung tải một phần là các trạng thái UI bắt buộc, không thay bằng màn hình trắng.

## 7. Backend contract hiện có

Base path mặc định `/api/v1` (xác minh bằng app config/backend trước khi tích hợp). Các nhóm endpoint đã có:

- Auth: `/auth/register`, `/auth/login`, `/auth/send-otp`, `/auth/verify-otp-login`, `/auth/refresh-token`, `/auth/reset-password`, `/auth/change-password`, Google OAuth start/callback/exchange.
- Medicines: `/medicines/search`, `/medicines/categories`, `/medicines/barcode/:barcode`, `/medicines/:id`, interactions check/management.
- Cart (JWT bắt buộc): `GET /cart`; `POST /cart/items` với `{ medicineId, quantity }` (cộng số lượng); `PATCH /cart/items/:medicineId` với `{ quantity }` (đặt số lượng); `DELETE /cart/items/:medicineId`; `DELETE /cart`. Response GET gồm `items`, `itemCount`, `subtotal`; mỗi item có dữ liệu sản phẩm và `lineTotal`.
- Orders: `POST /orders`, `GET /orders/my`, `GET /orders/:id`, hủy đơn và route admin cập nhật trạng thái.
- Coupons: `GET /coupons/available` trả các mã đang hiệu lực; chỉ ADMIN quản lý qua `POST /coupons`, `GET /coupons/admin`, `PATCH /coupons/:id`, `DELETE /coupons/:id` (vô hiệu hóa).
- Payments: PayOS checkout-link endpoint `POST /payments/payos/:orderId/link`; webhook là server-to-server, không gọi từ app.
- Users: profile, addresses CRUD, push-token register/delete.
- Pharmacists: dashboard stats endpoint.

**Luôn đọc Swagger/DTO trước khi viết integration.** Kiểm tra query params, pagination, response envelope, auth, role, error shape và enum. Không hard-code response mẫu thành production logic.

### Luồng cần hỗ trợ

- **OTP email:** gọi send OTP rồi verify theo DTO thực tế; xử lý resend cooldown, expiry, loading và lỗi. OTP điện thoại chưa có SMS gateway theo tài liệu backend.
- **Google login:** mở flow backend và nhận kết quả qua custom deep link của Expo; trao đổi one-time code với endpoint exchange. Validate scheme/host/path và lỗi/hủy OAuth; không đặt client secret trong app.
- **PayOS:** tạo link từ backend, mở checkout URL bằng browser/in-app browser theo UX đã chọn, xử lý return/cancel deep link và tải lại trạng thái order từ backend. Không đánh dấu đơn đã thanh toán chỉ dựa trên query params hay callback phía client.
- **Push:** xin quyền theo thời điểm hợp lý, lấy Expo push token trên thiết bị hỗ trợ, đăng ký với `/users/push-token`, gỡ token khi logout nếu phù hợp. Xử lý permission denied và môi trường simulator không hỗ trợ.
- **Realtime:** dùng `socket.io-client` khi backend gateway/API contract xác nhận; join room sau khi xác thực, leave/disconnect khi logout hoặc đổi tài khoản. Chỉ cập nhật cache theo payload xác minh được, nếu không thì invalidate query liên quan.
- **Drug interaction:** kiểm tra giỏ hàng khi thay đổi danh sách thuốc và trình bày mức độ/cảnh báo dễ hiểu. Không tự suy luận tương tác từ tên thuốc phía client; nội dung đến từ backend.
- **Cart/discount:** lấy cart từ backend sau đăng nhập/app resume; optimistic update phải rollback khi API lỗi. Xóa query cache/cart state khi logout. Có thể gửi `couponCode` cùng `POST /orders`: `{ items: [{ medicineId, quantity }], receiverName, receiverPhone, shippingAddress, paymentMethod, couponCode }`. Backend tự xác minh giá, tồn kho, hạn mức và tính `subtotalAmount`, `discountAmount`, `totalAmount`; không tính số tiền cuối ở client. Mã không hợp lệ/hết hạn/hết lượt/không đạt đơn tối thiểu trả lỗi 400.

## 8. TanStack Query và cache client

- Đặt query keys theo feature và tham số: ví dụ `['medicines', 'search', filters]`, `['orders', 'detail', orderId]`.
- Invalidate đúng phạm vi sau mutation: giỏ hàng/đơn hàng/profile/địa chỉ; tránh clear toàn bộ cache vô cớ.
- Với stock/order/payment, ưu tiên refetch khi app resume, mutation hoàn tất hoặc nhận sự kiện realtime.
- Không lưu query cache chứa dữ liệu riêng tư vào persistent storage nếu chưa có chính sách bảo vệ và logout cleanup.
- Redis phía backend có TTL/invalidation theo backend; frontend không cần biết Redis key hoặc truy cập Redis.

## 9. Accessibility, localization và y tế

- Giao diện ngôn ngữ tiếng Việt là mặc định; hỗ trợ Unicode, dấu tiếng Việt và định dạng tiền VND bằng formatter dùng chung.
- Có `accessibilityRole`, label/hint phù hợp, thứ tự focus hợp lý và tương phản đủ.
- Dùng ngôn ngữ trung lập, không đưa chẩn đoán hay khuyến nghị điều trị do client tự tạo.
- Không ẩn thông tin an toàn quan trọng phía sau màu sắc hoặc tooltip khó thấy.
- Nếu thông tin hoạt chất/quy cách chưa có, hiển thị trạng thái chưa cập nhật; không bịa dữ liệu y tế.

## 10. Security và privacy

- Không log OTP, password, token, địa chỉ đầy đủ, dữ liệu thanh toán hoặc secret.
- Xóa token và dữ liệu người dùng trong bộ nhớ/cache khi logout; ngắt socket và unregister push token theo contract.
- Dùng HTTPS cho API và cấu hình deep links theo allowlist; không nhận URL redirect tùy ý từ input không tin cậy.
- Không xác nhận thanh toán, role, giá cuối, tồn kho hoặc quyền truy cập chỉ ở client. Backend là nguồn sự thật.
- Không đưa thông tin cá nhân vào notification preview nếu không cần; nội dung notification nên tối thiểu.

## 11. Definition of Done cho frontend task

1. Luồng hoạt động trên iOS và Android; route/back behavior đúng, không tạo màn hình dead-end.
2. TypeScript không có lỗi; không thêm `any` hoặc ép kiểu để né contract.
3. Có loading, error, empty, disabled và success states tương ứng.
4. UI tuân theo minimalism/hybrid system, tokens hiện hữu, accessibility và safe areas.
5. API behavior được xác minh bằng DTO/Swagger; không để secret ở client.
6. Tính nhất quán cache, logout, socket và deep link được xử lý nếu feature liên quan.
7. Chạy các lệnh lint/build/typecheck hiện có khi task yêu cầu hoặc khi cần xác minh thay đổi; không thêm dependency/test suite ngoài phạm vi.

## 12. Câu hỏi còn mở để xác nhận

Các lựa chọn đã được xác nhận: iOS + Android, Expo Router, Redis chỉ ở backend, phạm vi toàn bộ app mua dược phẩm, theme theo thiết bị, 5 tab chính như trên và giỏ hàng backend khi đăng nhập. Hãy hỏi người dùng trước khi đổi các quyết định này.
