import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthError, AuthField, AuthLayout, AuthPrimaryButton } from '@/features/auth/components/auth-ui';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';

type RegisterErrors = { fullName?: string; phone?: string; email?: string; password?: string; confirmPassword?: string };

export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const nextErrors: RegisterErrors = {};
    if (fullName.trim().length < 2) nextErrors.fullName = 'Nhập họ tên đầy đủ của bạn.';
    if (phone.replace(/\D/g, '').length < 9) nextErrors.phone = 'Số điện thoại chưa hợp lệ.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Kiểm tra lại địa chỉ email.';
    if (password.length < 6) nextErrors.password = 'Mật khẩu cần có ít nhất 6 ký tự.';
    if (confirmPassword !== password) nextErrors.confirmPassword = 'Mật khẩu nhập lại chưa khớp.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    Keyboard.dismiss();
    setBusy(true); setFormError(null);
    try {
      await signUp({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim() || undefined, password });
      router.back();
    } catch (reason) {
      setFormError(reason instanceof ApiError ? reason.message : 'Chưa thể tạo tài khoản. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return <AuthLayout
    title="Tạo tài khoản"
    subtitle="Tạo tài khoản khách hàng để đồng bộ giỏ hàng và theo dõi đơn mua."
    onBack={() => router.back()}
    footer={<><ThemedText themeColor="textSecondary">Đã có tài khoản? </ThemedText><Link href="/auth/login" style={{ color: theme.tint, fontWeight: '700' }}>Đăng nhập</Link></>}
  >
    <AuthField label="Họ và tên" value={fullName} onChangeText={(value) => { setFullName(value); setErrors((current) => ({ ...current, fullName: undefined })); }} autoCapitalize="words" autoCorrect={false} textContentType="name" returnKeyType="next" placeholder="Nguyễn Minh Anh" error={errors.fullName} />
    <AuthField label="Số điện thoại" value={phone} onChangeText={(value) => { setPhone(value); setErrors((current) => ({ ...current, phone: undefined })); }} keyboardType="phone-pad" textContentType="telephoneNumber" returnKeyType="next" placeholder="09xx xxx xxx" error={errors.phone} />
    <AuthField label="Email (không bắt buộc)" value={email} onChangeText={(value) => { setEmail(value); setErrors((current) => ({ ...current, email: undefined })); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" placeholder="you@example.com" error={errors.email} />
    <AuthField label="Mật khẩu" value={password} onChangeText={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); }} secureTextEntry secureToggle textContentType="newPassword" returnKeyType="next" placeholder="Ít nhất 6 ký tự" error={errors.password} />
    <AuthField label="Nhập lại mật khẩu" value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); setErrors((current) => ({ ...current, confirmPassword: undefined })); }} secureTextEntry secureToggle textContentType="newPassword" returnKeyType="go" onSubmitEditing={() => void submit()} placeholder="Nhập lại mật khẩu" error={errors.confirmPassword} />
    {formError ? <AuthError>{formError}</AuthError> : null}
    <AuthPrimaryButton title="Tạo tài khoản" busy={busy} onPress={() => void submit()} />
  </AuthLayout>;
}
