import { useCallback, useEffect, useState } from 'react';
import { getMedicineCategories } from '@/features/catalog/api/medicines';
import { ApiError } from '@/shared/api/client';

export function useMedicineCategories(enabled = true) {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    void getMedicineCategories()
      .then((items) => { if (active) setCategories(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : 'Không tải được danh mục.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, reload]);

  const retry = useCallback(() => setReload((value) => value + 1), []);
  return { categories, loading, error, retry };
}
