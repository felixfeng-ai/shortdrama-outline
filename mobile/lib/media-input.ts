export interface PickedImageLike {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export interface LocalImageAttachment {
  id: string;
  uri: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export function readPickedImage(result: {
  canceled: boolean;
  assets?: PickedImageLike[] | null;
}): LocalImageAttachment | null {
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const uri = asset.uri.trim();
  if (!uri) return null;
  return {
    id: uri,
    uri,
    name: asset.fileName?.trim() || '参考图',
    mime: asset.mimeType?.trim() || 'image/jpeg',
    width: Number(asset.width) || 0,
    height: Number(asset.height) || 0,
    bytes: Number(asset.fileSize) || 0,
  };
}

export function appendVoiceTranscript(base: string, transcript: string): string {
  return `${base}${transcript.trim()}`;
}
