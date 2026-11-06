import type { AnalyticsEvent } from './privacy-analytics.ts';

export interface DiagnosticInput {
  errorName: string;
  message: string;
  errorCode?: number;
  path?: string;
  appVersion: string;
  buildVersion: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, '[链接]')
    .replace(/\bBearer\s+\S+/gi, '[令牌]')
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/gi, '[密钥]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱]')
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|opt|var)\/)[^\s]+/g, '[路径]')
    .replace(/\bprompt\s*=\s*\S+/gi, '[正文已移除]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function buildDiagnosticEvent(input: DiagnosticInput): AnalyticsEvent {
  const properties: AnalyticsEvent['properties'] = {
    errorName: sanitizeDiagnosticText(input.errorName) || 'Error',
    result: sanitizeDiagnosticText(input.message) || '未知页面错误',
    appVersion: input.appVersion.slice(0, 32),
    buildVersion: input.buildVersion.slice(0, 32),
    platform: input.platform.slice(0, 24),
    osVersion: input.osVersion.slice(0, 32),
    deviceModel: input.deviceModel.slice(0, 80),
  };
  if (Number.isFinite(input.errorCode)) properties.errorCode = Number(input.errorCode);
  return {
    name: 'app_error',
    path: (input.path ?? '').trim().slice(0, 120),
    properties,
  };
}
