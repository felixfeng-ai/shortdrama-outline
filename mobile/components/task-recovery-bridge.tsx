import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useWorkspace } from '@/lib/workspace-store';

export function TaskRecoveryBridge() {
  const { data, refresh } = useWorkspace();
  const active = data.tasks.some((task) => task.status === 'queued' || task.status === 'running');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 12_000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  return null;
}
