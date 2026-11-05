import { resolveApiBaseUrl } from './workspace-api.ts';

export interface OverseasAuditIssue {
  code: string;
  severity: 'blocking' | 'warning';
  episode: number;
  field: string;
  message: string;
  evidence: string;
  suggestion: string;
}

export interface OverseasReview {
  id: string;
  name: string;
  locale: string;
  market: string;
  marketLabel: string;
  platforms: string[];
  subtitleMaxLineChars: number;
  subtitleMaxCps: number;
  redlines: string[];
  visualRules: string[];
  audit: {
    blocking: number;
    warning: number;
    issues: OverseasAuditIssue[];
  };
}

interface Branch {
  id: string;
  name: string;
  locale: string;
  market: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function strings(value: unknown, max = 20): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, 160)).filter(Boolean).slice(0, max)
    : [];
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || fallback);
  }
  return payload.data;
}

function parseIssues(value: unknown): OverseasAuditIssue[] {
  if (!Array.isArray(value)) return [];
  return value.map((item): OverseasAuditIssue | null => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const message = text(record.message, 500);
    if (!message) return null;
    return {
      code: text(record.code, 80),
      severity: record.severity === 'blocking' ? 'blocking' : 'warning',
      episode: Number.isFinite(Number(record.episode)) ? Number(record.episode) : 0,
      field: text(record.field, 80),
      message,
      evidence: text(record.evidence, 500),
      suggestion: text(record.suggestion, 500),
    };
  }).filter((item): item is OverseasAuditIssue => item !== null);
}

export async function loadOverseasReviews(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OverseasReview[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置海外审片服务');
  const branchResponse = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/localization/branches`,
    { credentials: 'include', headers: { Accept: 'application/json' }, signal },
  );
  const branchData = await readJson<{ branches?: Branch[] }>(
    branchResponse,
    '海外分支读取失败',
  );
  const branches = Array.isArray(branchData.branches) ? branchData.branches : [];
  if (branches.length === 0) return [];

  return Promise.all(branches.map(async (branch): Promise<OverseasReview> => {
    const basePath = `${root}/api/projects/${encodeURIComponent(projectId)}/localization/branches/${encodeURIComponent(branch.id)}`;
    const [contextResponse, auditResponse] = await Promise.all([
      fetchImpl(`${basePath}/context`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal,
      }),
      fetchImpl(`${basePath}/audit`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal,
      }),
    ]);
    const contextData = await readJson<{ context?: Record<string, unknown> | null }>(
      contextResponse,
      '海外市场上下文读取失败',
    );
    const auditData = await readJson<{ audit?: Record<string, unknown> | null }>(
      auditResponse,
      '海外审计读取失败',
    );
    const context = contextData.context ?? {};
    const profile = context.profile && typeof context.profile === 'object'
      ? context.profile as Record<string, unknown>
      : {};
    const subtitle = context.subtitle && typeof context.subtitle === 'object'
      ? context.subtitle as Record<string, unknown>
      : {};
    const adaptation = context.adaptationBrief && typeof context.adaptationBrief === 'object'
      ? context.adaptationBrief as Record<string, unknown>
      : {};
    const audit = auditData.audit ?? {};
    return {
      id: branch.id,
      name: branch.name,
      locale: branch.locale,
      market: branch.market,
      marketLabel: text(profile.label, 80) || branch.market,
      platforms: strings(context.platforms),
      subtitleMaxLineChars: Number(subtitle.maxLineChars) || 0,
      subtitleMaxCps: Number(subtitle.maxCps) || 0,
      redlines: strings(adaptation.redlines),
      visualRules: strings(profile.visualRules),
      audit: {
        blocking: Math.max(0, Number(audit.blocking) || 0),
        warning: Math.max(0, Number(audit.warning) || 0),
        issues: parseIssues(audit.issues),
      },
    };
  }));
}
