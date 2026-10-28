# 📱 PharmaShop Frontend

Ứng dụng PharmaShop dành cho khách hàng và nhân viên, xây dựng bằng React Native và Expo. Frontend hỗ trợ Android, iOS và Web; các dữ liệu nghiệp vụ được lấy từ PharmaShop Backend.

<div align="center">

<img src="assets/readme-banner.svg" alt="PharmaShop — Nhà thuốc trực tuyến" width="100%" />

![Expo](https://img.shields.io/badge/Expo-SDK%2058-000020?style=for-the-badge&logo=expo)
![React Native](https://img.shields.io/badge/React%20Native-0.88-20232A?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Platforms](https://img.shields.io/badge/Platforms-Android%20%7C%20iOS%20%7C%20Web-18A889?style=for-the-badge)

### 🛍️ Mua sắm dược phẩm trên mọi thiết bị

[🚀 Bắt đầu nhanh](#cài-đặt) · [🔧 Cấu hình API](#cấu-hình) · [📜 Scripts](#scripts)

</div>

## Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ](#công-nghệ)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Chạy ứng dụng](#chạy-ứng-dụng)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [API và xác thực](#api-và-xác-thực)
- [Scripts](#scripts)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Liên quan](#liên-quan)

## ✨ Tính năng

- Đăng ký, đăng nhập, OTP, Google/Firebase Sign-In tùy cấu hình.
- Trang chủ, danh mục phân cấp, tìm kiếm và chi tiết thuốc.
- Giỏ hàng, checkout, quản lý địa chỉ nhận hàng và coupon.
- Lịch sử đơn, chi tiết đơn và đồng bộ trạng thái thanh toán PayOS.
- Hồ sơ người dùng, hộp thư thông báo và đăng ký push notification.
- Chat hỗ trợ khách hàng và giao diện quản trị/nhân viên theo role.
- Giao diện thích ứng với nền tảng và theme thiết bị.

## 🧰 Công nghệ

- React Native `0.88`, React `19`, Expo SDK `58`, TypeScript.
- Expo Router cho điều hướng theo file.
- TanStack Query cho server state/cache.
- Secure Store cho credential; Socket.IO client cho realtime.
- React Native Web cho bản chạy trên trình duyệt.
- Firebase Authentication/Messaging và Google Sign-In cho các luồng đã cấu hình.

## ✅ Yêu cầu

- Node.js và npm tương thích với `package-lock.json`.
- PharmaShop Backend đang chạy hoặc một API tương thích.
- Expo Go cho kiểm tra tính năng tương thích, hoặc development build khi dùng native modules như Firebase/Google Sign-In.
- Android Studio/Android SDK để build Android; macOS và Xcode để build/chạy iOS native.

## 🚀 Cài đặt

Từ thư mục này (`pharmaShop/`):

```bash
npm install
```

## 🔧 Cấu hình

Tạo file `.env` trong `pharmaShop/`:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:10000/api/v1
```

API client yêu cầu biến này khi khởi tạo. Giá trị phải gồm base path `/api/v1`. `EXPO_PUBLIC_*` được đưa vào bundle ứng dụng, vì vậy chỉ đặt URL/thông tin công khai ở đây; không đặt API key, JWT secret, Firebase Admin key hay PayOS secret.

### 🌍 URL theo nền tảng

| Nền tảng | Ví dụ |
|---|---|
| Web trên cùng máy chạy backend | `http://localhost:10000/api/v1` |
| Android emulator | `http://localhost:10000/api/v1`; client tự đổi `localhost` thành `10.0.2.2` |
| Thiết bị thật | `http://<IP-LAN-của-máy-backend>:10000/api/v1` |
| Backend staging/production | HTTPS URL của backend, kết thúc bằng `/api/v1` |

Thiết bị thật phải truy cập được máy chủ qua mạng. Sau khi đổi `.env`, dừng và khởi động lại Expo. Cấu hình native Google/Firebase còn cần thiết lập tương ứng trong Google Cloud/Firebase Console và app config.

## ▶️ Chạy ứng dụng

### 🌐 Web

```bash
npm run web
```

### 📲 Expo development server

```bash
npm start
```

Sau đó chọn Android/iOS/Web trong Expo CLI. Với native modules, hãy dùng development build thay vì giả định Expo Go hỗ trợ đầy đủ.

### 🤖 Android native

```bash
npm run android
```

Lệnh này sử dụng Android SDK đã cài trên máy để build/chạy ứng dụng.

### 🍎 iOS native

```bash
npm run ios
```

Yêu cầu macOS và Xcode.

## 📁 Cấu trúc mã nguồn

```text
src/
├── app/                    # Expo Router: tabs, auth, catalog, checkout, order, payment, admin
├── components/             # Component giao diện dùng chung
├── features/
│   ├── admin/              # API và màn hình quản trị
│   ├── auth/               # Session, token storage, đăng nhập
│   ├── cart/               # API giỏ hàng
│   ├── catalog/            # API, search, category, màn catalog
│   ├── checkout/           # Địa chỉ và checkout
│   ├── notifications/      # Hộp thư và đăng ký push
│   ├── orders/              # Đơn hàng, coupon, đồng bộ trạng thái
│   ├── payments/           # Kết quả và trạng thái thanh toán
│   ├── profile/            # Hồ sơ và địa chỉ
│   └── support-chat/       # Chat hỗ trợ
└── shared/
    ├── api/                # API client, auth header, refresh và lỗi
    ├── components/         # Component dùng chung
    └── hooks/              # Hook dùng chung
```

Một số route chính trong `src/app/`: `/(tabs)` cho trang chủ/danh mục/giỏ/đơn/tài khoản; `/search`, `/products`, `/category/[name]`, `/medicine/[id]`; `/checkout`; `/order/[id]`; `/payment/...`; `/notifications/...`; `/admin/...`.

## 🔐 API và xác thực

- Backend mặc định dùng base path `/api/v1`; Swagger có tại `/api/docs` khi server chạy.
- API client dùng `EXPO_PUBLIC_API_URL`, thêm Bearer access token, timeout, chuẩn hóa lỗi và thử refresh token khi nhận 401.
- Credential được quản lý trong `features/auth/token-storage.ts`; session được xóa khi refresh thất bại.
- Server response được đọc từ field `data` trong response envelope.
- Cart, order, giá, tồn và trạng thái thanh toán do backend quản lý. Không coi dữ liệu cache/client là nguồn sự thật.
- Chat dùng Socket.IO client; cần backend và token hợp lệ.

## 📜 Scripts

| Lệnh | Mô tả |
|---|---|
| `npm start` | Khởi động Expo development server |
| `npm run web` | Chạy ứng dụng Web |
| `npm run android` | Build/chạy Android native |
| `npm run ios` | Build/chạy iOS native |
| `npm run lint` | Chạy Expo lint |

## 🛠️ Khắc phục sự cố

### ⚠️ Thiếu `EXPO_PUBLIC_API_URL`

Kiểm tra `.env` nằm trong đúng thư mục `pharmaShop/`, tên biến chính xác và có `/api/v1`; khởi động lại Expo sau khi sửa.

### 🔌 API không kết nối được

Kiểm tra backend đang chạy, cổng `PORT`, PostgreSQL và địa chỉ API. Android emulator dùng `10.0.2.2`; điện thoại thật dùng IP LAN của máy backend.

### 🔑 Đăng nhập Google/Firebase hoặc push không hoạt động

Kiểm tra Firebase/Google project, OAuth client, package/bundle ID, file cấu hình native và development build. Các luồng này không chỉ phụ thuộc URL API.

### 🔄 Thay đổi native module nhưng app không cập nhật

Tạo lại development/native build; chỉ reload JavaScript không biên dịch lại native dependency.

## 🔗 Liên quan

- Backend API: [`../pharmaShop_BE/README.md`](../pharmaShop_BE/README.md)
- Hướng dẫn toàn hệ thống: [`../README.md`](../README.md)
- Cấu hình Expo: [`app.json`](app.json)
- API client: [`src/shared/api/client.ts`](src/shared/api/client.ts)
