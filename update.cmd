@echo off
setlocal DisableDelayedExpansion
title PharmaShop - Publish EAS Update

pushd "%~dp0"

echo.
echo ==========================================
echo       PharmaShop - Publish EAS Update
echo ==========================================
echo.
echo Chon kenh cap nhat:
echo   1. preview     - ban APK thu nghiem
echo   2. production  - ban phat hanh chinh thuc
echo   3. development - ban development client
echo.
set /p "CHANNEL_CHOICE=Nhap 1, 2 hoac 3: "

if "%CHANNEL_CHOICE%"=="1" set "CHANNEL=preview"
if "%CHANNEL_CHOICE%"=="2" set "CHANNEL=production"
if "%CHANNEL_CHOICE%"=="3" set "CHANNEL=development"
if not defined CHANNEL goto invalid_channel

echo.
set /p "UPDATE_MESSAGE=Mo ta noi dung cap nhat: "
if not defined UPDATE_MESSAGE goto missing_message

echo.
echo Kenh:       %CHANNEL%
echo Moi truong: %CHANNEL%
echo Noi dung:   %UPDATE_MESSAGE%
echo.
choice /c YN /n /m "Xac nhan publish ban cap nhat nay? [Y/N] "
if errorlevel 2 goto cancelled

echo.
echo Dang publish len EAS Update...
call npx.cmd eas-cli@latest update --channel "%CHANNEL%" --environment "%CHANNEL%" --message "%UPDATE_MESSAGE%"
set "UPDATE_EXIT_CODE=%ERRORLEVEL%"

echo.
if "%UPDATE_EXIT_CODE%"=="0" (
  echo Publish thanh cong. Thiet bi se tai ban cap nhat khi mo app.
) else (
  echo Publish that bai, ma loi: %UPDATE_EXIT_CODE%
)

popd
echo.
pause
exit /b %UPDATE_EXIT_CODE%

:invalid_channel
echo Lua chon khong hop le.
goto failed

:missing_message
echo Can nhap mo ta cho ban cap nhat.
goto failed

:cancelled
echo Da huy, chua publish cap nhat.
popd
pause
exit /b 0

:failed
popd
pause
exit /b 1
