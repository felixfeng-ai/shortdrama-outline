export function base64FromDataUrl(value: string): string {
  const text = value.trim()
  const comma = text.indexOf(',')
  if (comma < 0 || !text.slice(0, comma).includes(';base64')) {
    throw new Error('参考图读取失败');
  }
  const base64 = text.slice(comma + 1).trim();
  if (!base64) throw new Error('参考图没有可读取的内容');
  return base64;
}
