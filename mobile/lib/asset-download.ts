import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function downloadAuthenticatedFile(input: {
  url: string;
  fileName: string;
  mime: string;
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
}): Promise<'downloaded' | 'shared'> {
  if (Platform.OS === 'web') {
    const response = await input.fetchImpl(input.url, {
      credentials: 'include',
      headers: input.headers,
    });
    if (!response.ok) throw new Error('图片下载失败');
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = input.fileName;
    link.click();
    URL.revokeObjectURL(href);
    return 'downloaded';
  }

  const root = FileSystem.cacheDirectory;
  if (!root) throw new Error('设备缓存目录不可用');
  const result = await FileSystem.downloadAsync(
    input.url,
    `${root}${input.fileName}`,
    { headers: input.headers },
  );
  if (result.status < 200 || result.status >= 300) throw new Error('图片下载失败');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('当前设备不支持系统保存或分享');
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: input.mime,
    dialogTitle: '保存关键帧',
  });
  return 'shared';
}
