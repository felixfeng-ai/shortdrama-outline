export const ONBOARDING_STORAGE_KEY = 'chengju.onboarding.completed.v1';
export const ONBOARDING_VERSION = 1;

export type OnboardingStatus = 'loading' | 'pending' | 'complete';

interface StoredOnboarding {
  version: number;
  completed: boolean;
  completedAt: string;
}

export function parseOnboardingCompletion(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as Partial<StoredOnboarding>;
    return value.version === ONBOARDING_VERSION && value.completed === true;
  } catch {
    return false;
  }
}

export function shouldRedirectToOnboarding(
  status: OnboardingStatus,
  segments: readonly string[],
): boolean {
  return status === 'pending' && segments[0] !== 'onboarding';
}
