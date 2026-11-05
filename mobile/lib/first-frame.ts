import type {
  WorkspaceGenerationTarget,
} from './workspace-api.ts';

export function shotFrameTarget(
  targets: readonly WorkspaceGenerationTarget[],
  videoTarget: { targetId: string } | null | undefined,
): WorkspaceGenerationTarget | null {
  if (!videoTarget) return null;
  return (
    targets.find(
      (target) =>
        target.targetType === 'shot' && target.targetId === videoTarget.targetId,
    ) ?? null
  );
}

export function resolveFrameAssetId(
  selectedFrameAssetId: string | null | undefined,
  generatedFrameAssetId: string | undefined,
): string | null {
  return selectedFrameAssetId ?? generatedFrameAssetId ?? null;
}
