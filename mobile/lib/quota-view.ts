import type { WorkspaceQuota } from './workspace-api.ts';

export interface QuotaPresetRow {
  episodeCount: number;
  cost: string;
  projects: string;
}

export function quotaProjectLabel(quota: WorkspaceQuota): string {
  const projects = Math.max(0, Math.floor(quota.projectsLeft));
  const episodes = Math.max(0, Math.floor(quota.episodeCount));
  return episodes > 0
    ? `可跑 ${projects} 部 ${episodes} 集项目`
    : `可跑 ${projects} 个项目`;
}

export function quotaCostLabel(quota: WorkspaceQuota): string {
  const units = Math.max(0, Math.floor(quota.projectCost));
  return units > 0 ? `约 ${units} 单位 / 部` : '项目成本待同步';
}

export function quotaPriceVersionLabel(quota: WorkspaceQuota): string {
  return quota.pricingVersion && quota.pricingVersion !== 'legacy'
    ? `价格口径 ${quota.pricingVersion}`
    : '价格口径 待同步';
}

export function quotaPresetRows(quota: WorkspaceQuota): QuotaPresetRow[] {
  return [...quota.estimates.presets]
    .sort((left, right) => left.episodeCount - right.episodeCount)
    .map((item) => ({
      episodeCount: item.episodeCount,
      cost: `${item.units} 单位 / 部`,
      projects: `还能 ${item.projectsLeft} 部`,
    }));
}
