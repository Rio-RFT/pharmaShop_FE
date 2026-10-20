import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { getProvinceDetail, getProvinces, type DivisionOption } from '@/features/checkout/api/vietnam-provinces';

type AddressLocation = { province: DivisionOption | null; district: DivisionOption | null; ward: DivisionOption | null };
type Selector = 'province' | 'district' | 'ward';

export function VietnamAddressFields({ value, onChange }: { value: AddressLocation; onChange: (value: AddressLocation) => void }) {
  const theme = useTheme();
  const [activeSelector, setActiveSelector] = useState<Selector | null>(null);
  const provinces = useQuery({ queryKey: ['vietnam-provinces', 'list'], queryFn: getProvinces, staleTime: 86_400_000 });
  const province = useQuery({ queryKey: ['vietnam-provinces', 'detail', value.province?.code], queryFn: () => getProvinceDetail(value.province!.code), enabled: value.province !== null, staleTime: 86_400_000 });

  const fields: Record<Selector, { label: string; value: DivisionOption | null; options: DivisionOption[]; loading: boolean; error: Error | null; retry: () => void; disabled: boolean }> = {
    province: { label: 'Tỉnh / thành phố', value: value.province, options: provinces.data ?? [], loading: provinces.isLoading, error: provinces.error, retry: () => void provinces.refetch(), disabled: false },
    district: { label: 'Quận / huyện', value: value.district, options: province.data?.districts ?? [], loading: province.isLoading, error: value.province ? province.error : null, retry: () => void province.refetch(), disabled: !value.province || province.isLoading || !!province.error },
    ward: { label: 'Phường / xã', value: value.ward, options: province.data?.districts.find((entry) => entry.code === value.district?.code)?.wards ?? [], loading: province.isLoading, error: value.province ? province.error : null, retry: () => void province.refetch(), disabled: !value.district || province.isLoading || !!province.error },
  };

  const choose = (selector: Selector, item: DivisionOption) => {
    if (selector === 'province') onChange({ province: item, district: null, ward: null });
    else if (selector === 'district') onChange({ ...value, district: item, ward: null });
    else onChange({ ...value, ward: item });
    setActiveSelector(null);
  };

  return <View style={styles.fields}>
    {(['province', 'district', 'ward'] as const).map((selector) => {
      const field = fields[selector];
      return <View key={selector}>
        <ThemedText style={styles.label}>{field.label}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chọn ${field.label.toLocaleLowerCase('vi-VN')}`}
          accessibilityState={{ disabled: field.disabled }}
          disabled={field.disabled}
          onPress={() => setActiveSelector(selector)}
          style={[styles.select, { borderColor: theme.backgroundSelected, backgroundColor: theme.background, opacity: field.disabled ? 0.55 : 1 }]}
        >
          <ThemedText numberOfLines={1} themeColor={field.value ? 'text' : 'textSecondary'} style={styles.selectValue}>{field.value?.name ?? `Chọn ${field.label.toLocaleLowerCase('vi-VN')}`}</ThemedText>
          {field.loading ? <ActivityIndicator size="small" color={theme.tint} /> : <ThemedText themeColor="textSecondary" style={styles.chevron}>⌄</ThemedText>}
        </Pressable>
        {field.error ? <Pressable accessibilityRole="button" onPress={field.retry} style={styles.retry}><ThemedText style={{ color: '#B42318', fontSize: 12 }}>Không tải được dữ liệu. Chạm để thử lại.</ThemedText></Pressable> : null}
      </View>;
    })}
    {activeSelector ? <DivisionPicker
      title={fields[activeSelector].label}
      options={fields[activeSelector].options}
      selectedCode={fields[activeSelector].value?.code ?? null}
      onSelect={(item) => choose(activeSelector, item)}
      onClose={() => setActiveSelector(null)}
    /> : null}
  </View>;
}

function DivisionPicker({ title, options, selectedCode, onSelect, onClose }: { title: string; options: DivisionOption[]; selectedCode: number | null; onSelect: (item: DivisionOption) => void; onClose: () => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('vi-VN');
    return normalized ? options.filter((option) => option.name.toLocaleLowerCase('vi-VN').includes(normalized)) : options;
  }, [options, search]);

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[styles.modal, { backgroundColor: theme.background }]}>
      <View style={styles.modalHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng danh sách" onPress={onClose} hitSlop={8}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Đóng</ThemedText></Pressable>
        <ThemedText style={styles.modalTitle}>{title}</ThemedText>
        <View style={styles.headerSpace} />
      </View>
      <TextInput value={search} onChangeText={setSearch} autoCorrect={false} placeholder={`Tìm ${title.toLocaleLowerCase('vi-VN')}`} placeholderTextColor={theme.textSecondary} accessibilityLabel={`Tìm ${title.toLocaleLowerCase('vi-VN')}`} style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
      {filtered.length ? <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.code)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.code === selectedCode }} onPress={() => onSelect(item)} style={[styles.option, { borderBottomColor: theme.backgroundElement }]}>
          <ThemedText style={[styles.optionName, item.code === selectedCode ? { color: theme.tint, fontWeight: '700' } : null]}>{item.name}</ThemedText>
          {item.code === selectedCode ? <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Đã chọn</ThemedText> : null}
        </Pressable>}
      /> : <ThemedText themeColor="textSecondary" style={styles.noOptions}>Không tìm thấy kết quả.</ThemedText>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  fields: { gap: 12, marginTop: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  select: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectValue: { flex: 1, fontSize: 14 },
  chevron: { fontSize: 20, lineHeight: 24 },
  retry: { paddingTop: 6, paddingBottom: 2 },
  modal: { flex: 1, paddingTop: 18, paddingHorizontal: 18 },
  modalHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  headerSpace: { width: 36 },
  search: { height: 46, borderRadius: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 10 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  optionName: { flex: 1, fontSize: 14 },
  noOptions: { textAlign: 'center', marginTop: 24 },
});
