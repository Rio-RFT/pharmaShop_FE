import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function ProductSearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Tìm thuốc, sản phẩm…',
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} tintColor={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        accessibilityLabel="Tìm thuốc và sản phẩm"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        enterKeyHint="search"
      />
      {value.trim() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xóa từ khóa"
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={styles.clearButton}
        >
          <ThemedText themeColor="textSecondary" style={styles.clearText}>×</ThemedText>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tìm kiếm"
        onPress={onSubmit}
        style={({ pressed }) => [styles.submit, { backgroundColor: theme.tint, opacity: pressed ? 0.75 : 1 }]}
      >
        <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={17} tintColor="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 5 },
  input: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 11 },
  clearButton: { minWidth: 34, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 24, lineHeight: 28 },
  submit: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
