import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MedicineCatalogScreen } from '@/features/catalog/screens/medicine-catalog-screen';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ keyword?: string | string[] }>();
  const router = useRouter();
  const routeKeyword = Array.isArray(params.keyword) ? params.keyword[0] ?? '' : params.keyword ?? '';
  const [draft, setDraft] = useState(routeKeyword);
  const [keyword, setKeyword] = useState(routeKeyword.trim());

  useEffect(() => {
    setDraft(routeKeyword);
    setKeyword(routeKeyword.trim());
  }, [routeKeyword]);

  const submit = () => {
    const submittedKeyword = draft.trim();
    setKeyword(submittedKeyword);
    router.setParams({ keyword: submittedKeyword || undefined });
  };

  return (
    <MedicineCatalogScreen
      mode="search"
      keyword={keyword}
      searchValue={draft}
      onSearchChange={setDraft}
      onSearchSubmit={submit}
    />
  );
}
