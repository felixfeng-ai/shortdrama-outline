import { resolveApiBaseUrl, type WorkspaceTaskTargetType } from './workspace-api.ts';
import type { ReviewAsset } from './review-api.ts';

export function reviewVersions(assets: readonly ReviewAsset[]): ReviewAsset[] {
  return [...assets].sort((a, b) => b.createdAt - a.createdAt);
}

export function initialReviewAsset(
  assets: readonly ReviewAsset[],
  preferredId?: string | null,
): ReviewAsset | null {
  const selected = assets.find((asset) => asset.selectedAt !== null);
  if (selected) return selected;
  const preferred = preferredId
    ? assets.find((asset) => asset.id === preferredId)
    : null;
  return preferred ?? assets[0] ?? null;
}

export function reviewVersionLabel(versions: readonly ReviewAsset[], index: number): string {
  return `V${Math.max(1, versions.length - index)}`;
}

export function reviewAspectRatio(targetType: WorkspaceTaskTargetType): number {
  if (targetType === 'place') return 16 / 9;
  if (targetType === 'character') return 3 / 4;
  return 9 / 16;
}

export function buildReviewImageSource(
  baseUrl: string,
  asset: ReviewAsset,
  headers: Record<string, string>,
): { uri: string; headers: Record<string, string> } {
  const root = resolveApiBaseUrl(baseUrl);
  const uri = /^https?:\/\//i.test(asset.downloadUrl)
    ? asset.downloadUrl
    : `${root}${asset.downloadUrl.startsWith('/') ? '' : '/'}${asset.downloadUrl}`;
  return { uri, headers };
}

export function reviewBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function reviewCreatedAt(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function reviewFileName(asset: ReviewAsset): string {
  const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime === 'image/webp' ? 'webp' : 'png';
  return `${asset.targetType}-${asset.targetId}-${asset.id}.${ext}`;
}
