import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthError, AuthField, AuthLayout, AuthPrimaryButton } from '@/features/auth/components/auth-ui';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submit = async () => {
    const errors = {
      identifier: identifier.trim() ? undefined : 'Nhập email hoặc số điện thoại của bạn.',
      password: password ? undefined : 'Nhập mật khẩu để tiếp tục.',
    };
    setFieldErrors(errors);
    if (errors.identifier || errors.password) return;
    Keyboard.dismiss();
    setBusy(true); setFormError(null);
    try { await signIn(identifier.trim(), password); if (notificationId) router.replace(`/notifications/${notificationId}` as import('expo-router').Href); else router.back(); }
    catch (reason) { setFormError(reason instanceof ApiError ? reason.message : 'Đăng nhập chưa thành công. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  return <AuthLayout
    title="Chào mừng trở lại"
    subtitle="Đăng nhập để tiếp tục mua sắm và theo dõi đơn hàng của bạn."
    onBack={() => router.back()}
    footer={<><ThemedText themeColor="textSecondary">Chưa có tài khoản? </ThemedText><Link href="/auth/register" style={{ color: theme.tint, fontWeight: '700' }}>Tạo tài khoản</Link></>}
  >
    <AuthField label="Email hoặc số điện thoại" value={identifier} onChangeText={(value) => { setIdentifier(value); setFieldErrors((errors) => ({ ...errors, identifier: undefined })); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" returnKeyType="next" placeholder="you@example.com hoặc 09xx…" error={fieldErrors.identifier} />
    <AuthField label="Mật khẩu" value={password} onChangeText={(value) => { setPassword(value); setFieldErrors((errors) => ({ ...errors, password: undefined })); }} secureTextEntry textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} placeholder="Nhập mật khẩu" error={fieldErrors.password} secureToggle />
    {formError ? <AuthError>{formError}</AuthError> : null}
    <AuthPrimaryButton title="Đăng nhập" busy={busy} onPress={() => void submit()} />
  </AuthLayout>;
}
