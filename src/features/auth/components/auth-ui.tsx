import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppHeader } from '@/components/app-header';
import { useTheme } from '@/hooks/use-theme';
import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function AuthLayout({ title, subtitle, footer, children, onBack }: PropsWithChildren<{ title: string; subtitle: string; footer: ReactNode; onBack: () => void }>) {
  const theme = useTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return <ThemedView style={styles.page}>
    <SafeAreaView style={styles.safe}>
      <AppHeader />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.scroll, keyboardVisible && styles.scrollWithKeyboard]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={onBack} hitSlop={8} style={styles.backLink}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>‹  Quay lại</ThemedText></Pressable>
            <View style={styles.heading}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>{subtitle}</ThemedText>
            </View>
            {children}
            <View style={styles.footer}>{footer}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ThemedView>;
}

export function AuthField({ label, error, secureToggle, ...inputProps }: TextInputProps & { label: string; error?: string; secureToggle?: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const isSecure = Boolean(inputProps.secureTextEntry && !visible);
  return <View style={styles.fieldWrap}>
    <ThemedText style={styles.label}>{label}</ThemedText>
    <View style={[styles.inputShell, { backgroundColor: theme.backgroundElement, borderColor: error ? '#B42318' : focused ? theme.tint : 'transparent' }]}>
      <TextInput
        {...inputProps}
        secureTextEntry={secureToggle ? isSecure : inputProps.secureTextEntry}
        onFocus={(event) => { setFocused(true); inputProps.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); inputProps.onBlur?.(event); }}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.tint}
        style={[styles.input, { color: theme.text }, inputProps.style]}
      />
      {secureToggle ? <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onPress={() => setVisible((value) => !value)} hitSlop={8} style={styles.passwordToggle}><ThemedText style={{ color: theme.tint, fontWeight: '700', fontSize: 13 }}>{visible ? 'Ẩn' : 'Hiện'}</ThemedText></Pressable> : null}
    </View>
    {error ? <ThemedText accessibilityRole="alert" style={styles.fieldError}>{error}</ThemedText> : null}
  </View>;
}

export function AuthPrimaryButton({ title, busy, disabled, onPress }: { title: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || busy) }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: theme.tint, opacity: disabled || busy ? 0.55 : pressed ? 0.82 : 1 }]}>
    {busy ? <View style={styles.buttonLoading}><LoadingIndicator color="#FFFFFF" /><ThemedText style={styles.primaryText}>Đang xử lý</ThemedText></View> : <ThemedText style={styles.primaryText}>{title}</ThemedText>}
  </Pressable>;
}

export function AuthError({ children }: PropsWithChildren) {
  return <View style={styles.errorBox}><ThemedText accessibilityRole="alert" style={styles.formError}>{children}</ThemedText></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, keyboard: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 18 }, scrollWithKeyboard: { justifyContent: 'flex-start', paddingVertical: 8 }, content: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8 },
  backLink: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 20 },
  heading: { marginBottom: 26 }, eyebrow: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, marginBottom: 15 }, eyebrowText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21 },
  fieldWrap: { marginBottom: 16 }, label: { fontSize: 13, fontWeight: '700', marginBottom: 8 }, inputShell: { minHeight: 54, borderWidth: 1.5, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 }, input: { flex: 1, minHeight: 52, paddingVertical: 0, fontSize: 15 }, passwordToggle: { minHeight: 44, justifyContent: 'center', paddingLeft: 10 }, fieldError: { color: '#B42318', marginTop: 6, fontSize: 12 },
  primary: { minHeight: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, buttonLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBox: { borderRadius: 12, backgroundColor: '#FEF3F2', paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14 }, formError: { color: '#B42318', fontSize: 13, lineHeight: 19 }, footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
});
