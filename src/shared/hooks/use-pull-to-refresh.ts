import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Refetches enabled server queries when the current screen is pulled down. */
export function usePullToRefresh(afterRefresh?: () => void | Promise<void>) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
      await afterRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [afterRefresh, queryClient, refreshing]);
  return { refreshing, onRefresh };
}
