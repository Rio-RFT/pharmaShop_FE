import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Medicine } from '@/features/catalog/api/medicines';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export function MedicineListItem({ medicine, onPress }: { medicine: Medicine; onPress: () => void }) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [medicine.imageUrl]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem sản phẩm ${medicine.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={[styles.imageFrame, { backgroundColor: theme.backgroundElement }]}>
        {medicine.imageUrl && !imageFailed ? (
          <Image
            source={{ uri: medicine.imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={150}
            onError={() => setImageFailed(true)}
            accessibilityLabel={`Ảnh ${medicine.name}`}
          />
        ) : (
          <SymbolView name={{ ios: 'cross.case', android: 'medical_services', web: 'medical_services' }} size={26} tintColor={theme.tint} />
        )}
      </View>
      <View style={styles.details}>
        <ThemedText style={styles.name} numberOfLines={2}>{medicine.name}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.supporting} numberOfLines={1}>
          {medicine.activeIngredient || medicine.packaging || medicine.category}
        </ThemedText>
        <View style={styles.meta}>
          <ThemedText style={[styles.price, { color: theme.tint }]}>{medicine.price == null ? 'Cần dược sĩ tư vấn' : money.format(Number(medicine.price))}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.stock}>
            {medicine.stockQuantity > 0 ? 'Còn hàng' : 'Tạm hết'}
          </ThemedText>
        </View>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  imageFrame: { width: 76, height: 76, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  details: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  supporting: { fontSize: 12, lineHeight: 17 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginTop: 3 },
  price: { fontSize: 14, fontWeight: '700' },
  stock: { fontSize: 11 },
});
