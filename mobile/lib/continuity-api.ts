import { resolveApiBaseUrl } from './workspace-api.ts';

export type ContinuityArea = 'character' | 'place' | 'prop' | 'lighting' | 'composition';
export type ContinuitySeverity = 'error' | 'warning' | 'info';

export interface ContinuityIssue {
  area: ContinuityArea;
  severity: ContinuitySeverity;
  expected: string;
  observed: string;
  evidence: string;
  suggestion: string;
  promptPatch: string;
}

export interface ContinuityReport {
  summary: string;
  issues: ContinuityIssue[];
}

const AREAS = new Set<ContinuityArea>([
  'character',
  'place',
  'prop',
  'lighting',
  'composition',
]);
const SEVERITIES = new Set<ContinuitySeverity>(['error', 'warning', 'info']);

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function readContinuityReport(value: unknown): ContinuityReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('现场连续性检查结果无法识别');
  }
  const root = value as Record<string, unknown>;
  const summary = text(root.summary, 500);
  if (!summary) throw new Error('现场连续性检查没有返回检查摘要');
  const issues = Array.isArray(root.issues)
    ? root.issues.map((item): ContinuityIssue | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const issue = item as Record<string, unknown>;
        const area = text(issue.area, 40) as ContinuityArea;
        const severity = text(issue.severity, 20) as ContinuitySeverity;
        const observed = text(issue.observed);
        const suggestion = text(issue.suggestion);
        if (!AREAS.has(area) || !SEVERITIES.has(severity) || !observed || !suggestion) {
          return null;
        }
        return {
          area,
          severity,
          expected: text(issue.expected),
          observed,
          evidence: text(issue.evidence),
          suggestion,
          promptPatch: text(issue.promptPatch, 300),
        };
      }).filter((item): item is ContinuityIssue => item !== null)
    : [];
  return { summary, issues: issues.slice(0, 12) };
}

export async function checkSceneContinuity(
  baseUrl: string,
  input: {
    projectId: string;
    targetId: string;
    imageBase64: string;
    mime: string;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ContinuityReport> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置现场检查服务');
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/mobile/continuity`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接现场检查服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { report?: unknown } | null;
    error?: string | null;
  } | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '现场连续性检查失败');
  }
  return readContinuityReport(payload.data.report);
}
