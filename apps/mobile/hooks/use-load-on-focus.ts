import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export function useLoadOnFocus(load: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { refreshing, onRefresh };
}
