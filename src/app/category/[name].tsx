import { useLocalSearchParams } from 'expo-router';
import { MedicineCatalogScreen } from '@/features/catalog/screens/medicine-catalog-screen';

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ name: string | string[] }>();
  const category = Array.isArray(params.name) ? params.name[0] : params.name;
  return <MedicineCatalogScreen mode="category" category={category} />;
}
