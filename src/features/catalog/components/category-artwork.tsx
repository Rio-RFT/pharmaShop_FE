import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import type { ImageStyle, StyleProp, TextStyle } from 'react-native';
import { searchMedicines } from '@/features/catalog/api/medicines';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const fallbackMarks = ['Rx', 'V', '✳', '+', '•'];

type CategoryArtworkProps = {
  category: string;
  index: number;
  imageStyle?: StyleProp<ImageStyle>;
  fallbackStyle?: StyleProp<TextStyle>;
};

export function CategoryArtwork({ category, index, imageStyle, fallbackStyle }: CategoryArtworkProps) {
  const theme = useTheme();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageQuery = useQuery({
    queryKey: ['category-artwork', category],
    queryFn: async () => {
      const result = await searchMedicines({ category, page: 1, limit: 12 });
      return result.data.find((medicine) => medicine.imageUrl)?.imageUrl ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const imageUrl = imageQuery.data;

  useEffect(() => setFailedImage(null), [imageUrl]);

  if (imageUrl && failedImage !== imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={imageStyle}
        contentFit="contain"
        transition={150}
        onError={() => setFailedImage(imageUrl)}
        accessibilityLabel={`Sản phẩm đại diện cho danh mục ${category}`}
      />
    );
  }

  return (
    <ThemedText style={[{ color: theme.tint, fontWeight: '800', textAlign: 'center' }, fallbackStyle]}>
      {fallbackMarks[index % fallbackMarks.length]}
    </ThemedText>
  );
}
