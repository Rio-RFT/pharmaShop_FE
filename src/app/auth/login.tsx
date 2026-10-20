import { Link, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthDivider, AuthError, AuthField, AuthGoogleButton, AuthLayout, AuthPrimaryButton } from '@/features/auth/components/auth-ui';
import { ApiError, API_BASE_URL } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithGoogleCode } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isBusy = busy || googleBusy;

  const submit = async () => {
    const errors = {
      identifier: identifier.trim() ? undefined : 'Nhập email hoặc số điện thoại của bạn.',
      password: password ? undefined : 'Nhập mật khẩu để tiếp tục.',
    };
    setFieldErrors(errors);
    if (errors.identifier || errors.password) return;
    Keyboard.dismiss();
    setBusy(true); setFormError(null);
    try { await signIn(identifier.trim(), password); router.back(); }
    catch (reason) { setFormError(reason instanceof ApiError ? reason.message : 'Đăng nhập chưa thành công. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  const handleGoogleSignIn = async () => {
    Keyboard.dismiss();
    setGoogleBusy(true); setFormError(null);
    try {
      if (Platform.OS === 'android') {
        if (await signInWithGoogle()) router.back();
        return;
      }
      if (Platform.OS === 'ios') {
        const redirectUri = Linking.createURL('auth/callback');
        const result = await WebBrowser.openAuthSessionAsync(`${API_BASE_URL}/auth/google`, redirectUri);
        if (result.type !== 'success' || !result.url) return;
        const callback = new URL(result.url);
        if (callback.protocol !== 'pharmashop:' || callback.hostname !== 'auth' || callback.pathname !== '/callback') {
          throw new Error('Địa chỉ trả về từ Google không hợp lệ.');
        }
        const code = callback.searchParams.get('code');
        if (!code) throw new Error('Không nhận được mã đăng nhập Google.');
        await signInWithGoogleCode(code);
        router.back();
      }
    } catch (reason) {
      setFormError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'Không thể đăng nhập bằng Google.');
    } finally {
      setGoogleBusy(false);
    }
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
    <AuthPrimaryButton title="Đăng nhập" busy={busy} disabled={googleBusy} onPress={() => void submit()} />
    <AuthDivider />
    <AuthGoogleButton busy={googleBusy} disabled={busy || Platform.OS === 'web'} onPress={() => void handleGoogleSignIn()} />
  </AuthLayout>;
}
