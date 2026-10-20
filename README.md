# PharmaShop

Ứng dụng nhà thuốc trực tuyến cho iOS, Android và web, xây dựng bằng React Native, Expo và Expo Router. Logo dùng từ `assets/logo.svg`; giao diện tự theo theme thiết bị.

## Chạy ứng dụng

```bash
npm install
npm run start
```

## Kết nối API

Ứng dụng yêu cầu `EXPO_PUBLIC_API_URL` trong `.env` trên mọi nền tảng; không tự chọn host theo Android/iOS/web. Đặt biến này thành URL backend có thể truy cập được từ thiết bị hoặc trình duyệt (bao gồm `/api/v1`, ví dụ `http://<IP-máy-chạy-backend>:1111/api/v1` cho thiết bị trong cùng mạng), rồi khởi động lại Expo. Xem `.env.example`.

Trang chủ và danh mục gọi `GET /medicines/search` và `GET /medicines/categories`; trang chi tiết gọi `GET /medicines/:id`. Tài khoản hỗ trợ đăng ký, đăng nhập, lưu JWT trong SecureStore trên iOS/Android và làm mới token. Giỏ hàng dùng các route `/cart`; hồ sơ/địa chỉ đọc từ `/users/profile`; đơn hàng dùng `/orders/my`; checkout tạo đơn COD qua `POST /orders`. API client xử lý response envelope, lỗi và timeout theo backend.

Đăng xuất xóa token và cache riêng tư. Web chỉ giữ phiên trong bộ nhớ hiện tại. OTP, Google OAuth, PayOS và chỉnh sửa địa chỉ chưa được tích hợp.
