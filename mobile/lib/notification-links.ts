import type { Href } from 'expo-router';

export interface NotificationData {
  projectId?: string;
  assetId?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  mediaKind?: 'image' | 'video' | 'audio';
}

export function notificationRoute(data: NotificationData): Href {
  const projectId = typeof data.projectId === 'string' ? data.projectId : '';
  if (
    typeof data.assetId === 'string'
    && data.assetId
    && (data.targetType === 'shot' || data.targetType === 'character' || data.targetType === 'place')
    && typeof data.targetId === 'string'
    && data.targetId
  ) {
    return {
      pathname: '/review/[id]',
      params: {
        id: data.assetId,
        projectId,
        targetType: data.targetType,
        targetId: data.targetId,
        targetLabel: data.targetLabel ?? '',
        ...(data.mediaKind ? { mediaKind: data.mediaKind } : {}),
      },
    };
  }
  return {
    pathname: '/tasks',
    params: projectId ? { projectId } : {},
  };
}

export function pushPlatform(value: string | undefined): 'ios' | 'android' | 'unknown' {
  return value === 'ios' || value === 'android' ? value : 'unknown';
}
