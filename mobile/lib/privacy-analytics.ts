export interface AnalyticsEvent {
  name: string
  path: string
  properties: Record<string, string | number | boolean>
}

const ALLOWED_PROPERTIES = new Set([
  'durationMs',
  'screen',
  'projectId',
  'taskStatus',
  'result',
  'mode',
  'from',
  'to',
  'appVersion',
  'buildVersion',
  'platform',
  'osVersion',
  'deviceModel',
  'errorName',
  'errorCode',
]);

export function sanitizeAnalyticsEvent(value: {
  name: string
  path?: string
  properties?: Record<string, unknown>
}): AnalyticsEvent {
  const properties: AnalyticsEvent['properties'] = {};
  for (const [key, property] of Object.entries(value.properties ?? {})) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (typeof property === 'string') properties[key] = property.slice(0, 120);
    else if (typeof property === 'number' && Number.isFinite(property)) properties[key] = property;
    else if (typeof property === 'boolean') properties[key] = property;
  }
  return {
    name: value.name.trim().slice(0, 64),
    path: (value.path ?? '').trim().slice(0, 120),
    properties,
  };
}

export function shouldRetryAnalytics(attempt: number, retryable: boolean): boolean {
  return retryable && attempt < 3;
}
