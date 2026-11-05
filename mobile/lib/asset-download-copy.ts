export function downloadMediaLabel(mime: string): string {
  if (mime.startsWith('video/')) return '视频';
  if (mime.startsWith('audio/')) return '音频';
  if (mime.startsWith('image/')) return '图片';
  return '文件';
}

export function downloadDialogTitle(mime: string): string {
  return `保存${downloadMediaLabel(mime)}`;
}

export function downloadFailureMessage(mime: string, status?: number): string {
  const label = downloadMediaLabel(mime);
  if (status === 401 || status === 403) {
    return `${label}下载鉴权失败，请重新登录后重试`;
  }
  if (status === 404 || status === 410) {
    return `${label}文件不存在或已被清理`;
  }
  if (status !== undefined) {
    return `${label}下载失败（HTTP ${status}）`;
  }
  return `${label}下载失败，请检查网络后重试`;
}
