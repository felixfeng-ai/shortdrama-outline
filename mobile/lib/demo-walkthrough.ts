export type DemoStepId = 'sample' | 'agent' | 'generate' | 'review' | 'sync';

export interface DemoStep {
  id: DemoStepId;
  title: string;
  description: string;
  actionLabel: string;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 'sample',
    title: '载入示例项目',
    description: '从真实示例进入，不从空白页开始。',
    actionLabel: '载入示例',
  },
  {
    id: 'agent',
    title: '让 Agent 发现问题',
    description: '查看当前场次、项目记忆和下一步建议。',
    actionLabel: '返回 Agent',
  },
  {
    id: 'generate',
    title: '发起视频草片',
    description: '从已采用首帧选择镜头，确认费用后再生成。',
    actionLabel: '打开生成页',
  },
  {
    id: 'review',
    title: '在 App 审片并采用',
    description: '播放候选、比较版本，再决定采用或退回。',
    actionLabel: '打开任务',
  },
  {
    id: 'sync',
    title: '回到 Web 核对同步',
    description: '用同一账号打开 Web，确认项目和采用结果一致。',
    actionLabel: '查看项目',
  },
] as const;

export function parseDemoProgress(value: string | null): DemoStepId {
  if (!value) return 'sample';
  try {
    const parsed = JSON.parse(value) as { step?: unknown };
    return DEMO_STEPS.some((step) => step.id === parsed.step)
      ? parsed.step as DemoStepId
      : 'sample';
  } catch {
    return 'sample';
  }
}

export function nextDemoStep(current: DemoStepId): DemoStepId {
  const index = DEMO_STEPS.findIndex((step) => step.id === current);
  return DEMO_STEPS[Math.min(DEMO_STEPS.length - 1, Math.max(0, index + 1))].id;
}

export function demoStepIndex(step: DemoStepId): number {
  return Math.max(0, DEMO_STEPS.findIndex((item) => item.id === step));
}
