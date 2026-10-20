import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/client';
import { searchMedicines, type Medicine, type MedicineSearchResult } from '@/features/catalog/api/medicines';

type SearchState = { items: Medicine[]; total: number; loading: boolean; error: string | null };

export function useMedicineSearch(keyword: string, category?: string, limit = 12) {
  const [state, setState] = useState<SearchState>({ items: [], total: 0, loading: true, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    const timer = setTimeout(() => {
      void searchMedicines({ keyword: keyword.trim() || undefined, category, page: 1, limit })
        .then((result: MedicineSearchResult) => {
          if (active) setState({ items: result.data, total: result.pagination.total, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (!active) return;
          setState({ items: [], total: 0, loading: false, error: error instanceof ApiError ? error.message : 'Không tải được danh sách thuốc.' });
        });
    }, keyword ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [keyword, category, limit, reload]);

  const retry = useCallback(() => setReload((value) => value + 1), []);
  return { ...state, retry };
}
