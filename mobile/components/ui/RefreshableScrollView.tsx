// ScrollView con pull-to-refresh preconfigurado (color primario,
// spinner tint). Mantiene el estilo consistente sin obligar a cada
// screen a configurar RefreshControl manualmente.

import { useCallback, useState, type PropsWithChildren } from 'react';
import {
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';

import { colors } from '@/lib/theme';

interface Props extends PropsWithChildren<Omit<ScrollViewProps, 'refreshControl'>> {
  onRefresh: () => Promise<unknown> | void;
}

export function RefreshableScrollView({ onRefresh, children, ...rest }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  return (
    <ScrollView
      {...rest}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {children}
    </ScrollView>
  );
}