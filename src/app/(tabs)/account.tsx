import { Link, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { createAddress, deleteAddress, getAddresses, updateAddress, type Address, type AddressInput } from '@/features/profile/api/addresses';
import { ApiError } from '@/shared/api/client';

type Form = AddressInput;
const emptyForm: Form = { receiverName: '', phone: '', street: '', ward: '', district: '', province: '', isDefault: false };

export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading, signOut } = useAuth();
  const [editing, setEditing] = useState<Address | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState('');
  const addresses = useQuery({ queryKey: ['addresses', user?.id], queryFn: getAddresses, enabled: !!user });
  const setField = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] }); };
  const save = useMutation({
    mutationFn: (makeDefault?: Address) => makeDefault ? updateAddress(makeDefault.id, { isDefault: true }) : editing ? updateAddress(editing.id, form) : createAddress(form),
    onSuccess: async () => { closeModal(); await refresh(); },
    onError: (error) => setFormError(error instanceof ApiError ? error.message : 'Không lưu được địa chỉ. Vui lòng thử lại.'),
  });
  const remove = useMutation({ mutationFn: deleteAddress, onSuccess: refresh });
  const closeModal = () => { setModalVisible(false); setEditing(null); setForm(emptyForm); setFormError(''); };
  const openNew = () => { setEditing(null); setForm({ ...emptyForm, receiverName: user?.fullName ?? '', phone: user?.phone ?? '', isDefault: !addresses.data?.length }); setFormError(''); setModalVisible(true); };
  const openEdit = (address: Address) => { setEditing(address); setForm({ receiverName: address.receiverName, phone: address.phone, street: address.street, ward: address.ward, district: address.district, province: address.province, isDefault: address.isDefault }); setFormError(''); setModalVisible(true); };
  const submit = () => {
    if (Object.entries(form).some(([key, value]) => key !== 'isDefault' && !String(value).trim())) { setFormError('Vui lòng điền đầy đủ thông tin địa chỉ.'); return; }
    setFormError(''); save.mutate();
  };
  const confirmDelete = (address: Address) => Alert.alert('Xóa địa chỉ?', `Địa chỉ của ${address.receiverName} sẽ bị xóa.`, [
    { text: 'Để sau', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => remove.mutate(address.id) },
  ]);

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader /><ScrollView contentContainerStyle={styles.content}>
    <ThemedText style={styles.title}>Tài khoản</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>Hồ sơ và địa chỉ nhận hàng</ThemedText>
    {loading ? <ActivityIndicator color={theme.tint} /> : user ? <>
      <View style={[styles.profile, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.name}>{user.fullName}</ThemedText><ThemedText themeColor="textSecondary" style={styles.meta}>{user.phone}</ThemedText>{user.email ? <ThemedText themeColor="textSecondary" style={styles.meta}>{user.email}</ThemedText> : null}<ThemedText style={[styles.role, { color: theme.tint }]}>{user.role}</ThemedText></View>
      <View style={styles.sectionHeading}><ThemedText style={styles.section}>Địa chỉ giao hàng</ThemedText><Pressable accessibilityRole="button" onPress={openNew}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>+ Thêm</ThemedText></Pressable></View>
      {addresses.isLoading ? <ActivityIndicator color={theme.tint} /> : addresses.error ? <View><ThemedText style={styles.error}>{addresses.error instanceof ApiError ? addresses.error.message : 'Không tải được địa chỉ.'}</ThemedText><Pressable onPress={() => void addresses.refetch()}><ThemedText style={{ color: theme.tint, marginTop: 8 }}>Thử lại</ThemedText></Pressable></View> : addresses.data?.length ? addresses.data.map((address) => <View key={address.id} style={[styles.address, { borderBottomColor: theme.backgroundElement }]}>
        <View style={styles.addressTop}><ThemedText style={styles.name}>{address.receiverName}</ThemedText>{address.isDefault ? <ThemedText style={[styles.defaultTag, { color: theme.tint }]}>Mặc định</ThemedText> : null}</View>
        <ThemedText themeColor="textSecondary" style={styles.meta}>{address.phone}</ThemedText><ThemedText themeColor="textSecondary" style={styles.meta}>{[address.street, address.ward, address.district, address.province].join(', ')}</ThemedText>
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => openEdit(address)}><ThemedText style={{ color: theme.tint, fontWeight: '600' }}>Sửa</ThemedText></Pressable>{!address.isDefault ? <Pressable accessibilityRole="button" onPress={() => save.mutate(address)}><ThemedText style={{ color: theme.tint, fontWeight: '600' }}>Đặt mặc định</ThemedText></Pressable> : null}<Pressable accessibilityRole="button" onPress={() => confirmDelete(address)}><ThemedText style={{ color: '#B42318', fontWeight: '600' }}>Xóa</ThemedText></Pressable></View>
      </View>) : <ThemedText themeColor="textSecondary" style={styles.meta}>Chưa có địa chỉ giao hàng.</ThemedText>}
      <Pressable accessibilityRole="button" onPress={() => void signOut().then(() => router.replace('/'))} style={[styles.logout, { borderColor: theme.backgroundSelected }]}><ThemedText style={{ color: '#B42318', fontWeight: '700' }}>Đăng xuất</ThemedText></Pressable>
    </> : <View style={[styles.profile, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.name}>Đăng nhập PharmaShop</ThemedText><ThemedText themeColor="textSecondary" style={styles.meta}>Đồng bộ giỏ hàng và theo dõi đơn hàng của bạn.</ThemedText><Link href="/auth/login" style={[styles.primaryLink, { backgroundColor: theme.tint }]}>Đăng nhập</Link><Link href="/auth/register" style={[styles.secondaryLink, { borderColor: theme.tint, color: theme.tint }]}>Tạo tài khoản</Link></View>}
  </ScrollView></SafeAreaView>
    <Modal visible={!!user && modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
      <ThemedView style={styles.modal}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionHeading}><ThemedText style={styles.modalTitle}>{editing ? 'Sửa địa chỉ' : 'Địa chỉ mới'}</ThemedText><Pressable onPress={() => { setEditing(null); setForm(emptyForm); }}><ThemedText style={{ color: theme.tint }}>Đóng</ThemedText></Pressable></View>
        {([['receiverName', 'Tên người nhận'], ['phone', 'Số điện thoại'], ['street', 'Số nhà, tên đường'], ['ward', 'Phường / xã'], ['district', 'Quận / huyện'], ['province', 'Tỉnh / thành phố']] as const).map(([key, label]) => <View key={key}><ThemedText style={styles.label}>{label}</ThemedText><TextInput value={form[key]} onChangeText={(value) => setField(key, value)} keyboardType={key === 'phone' ? 'phone-pad' : 'default'} accessibilityLabel={label} placeholder={label} placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]} /></View>)}
        <View style={styles.switchRow}><ThemedText>Đặt làm địa chỉ mặc định</ThemedText><Switch value={form.isDefault} onValueChange={(value) => setField('isDefault', value)} trackColor={{ true: theme.tint }} /></View>
        {formError ? <ThemedText accessibilityRole="alert" style={styles.error}>{formError}</ThemedText> : null}
        <Pressable accessibilityRole="button" disabled={save.isPending} onPress={submit} style={[styles.submit, { backgroundColor: theme.tint, opacity: save.isPending ? 0.6 : 1 }]}>{save.isPending ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.submitText}>Lưu địa chỉ</ThemedText>}</Pressable>
      </ScrollView></SafeAreaView></ThemedView>
    </Modal>
  </ThemedView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 32 }, title: { fontSize: 28, fontWeight: '800' }, subtitle: { marginTop: 5, marginBottom: 24, fontSize: 14 },
  profile: { padding: 18, borderRadius: 16 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 13, marginTop: 6, lineHeight: 19 }, role: { marginTop: 10, fontSize: 12, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 }, section: { fontSize: 17, fontWeight: '700' }, address: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth }, addressTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, defaultTag: { fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 22, marginTop: 12 },
  logout: { marginTop: 28, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primaryLink: { color: '#FFFFFF', textAlign: 'center', paddingVertical: 13, borderRadius: 11, overflow: 'hidden', marginTop: 18, fontWeight: '700' }, secondaryLink: { textAlign: 'center', paddingVertical: 12, borderRadius: 11, borderWidth: 1, marginTop: 10, fontWeight: '700' }, error: { color: '#B42318', marginTop: 10 },
  modal: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 32 }, modalTitle: { fontSize: 22, fontWeight: '800' }, label: { fontSize: 14, fontWeight: '700', marginTop: 15, marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, fontSize: 15 }, switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }, submit: { minHeight: 50, borderRadius: 12, marginTop: 24, alignItems: 'center', justifyContent: 'center' }, submitText: { color: '#FFFFFF', fontWeight: '700' },
});
