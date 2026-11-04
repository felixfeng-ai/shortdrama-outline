import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { LocalImageAttachment } from './media-input';
import { base64FromDataUrl } from './media-encoding-core.ts';

async function webBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('参考图读取失败');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('参考图读取失败'));
    reader.onload = () => {
      try {
        resolve(base64FromDataUrl(String(reader.result ?? '')));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(blob);
  });
}

export async function attachmentToGenerationReference(
  attachment: LocalImageAttachment,
): Promise<{ base64: string; mime: string }> {
  const base64 = Platform.OS === 'web'
    ? await webBase64(attachment.uri)
    : await FileSystem.readAsStringAsync(attachment.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
  if (!base64) throw new Error('参考图没有可读取的内容');
  return { base64, mime: attachment.mime };
}
