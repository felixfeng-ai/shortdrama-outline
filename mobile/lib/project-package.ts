interface ProjectPackageAsset {
  uri: string;
  name?: string;
  size?: number;
  file?: Blob;
}

export interface ImportManifest {
  project: { title?: string };
  keyframes: Array<{
    included?: boolean;
    importFile?: string;
    archivePath?: string;
  }>;
  [key: string]: unknown;
}

const MAX_PACKAGE_BYTES = 120 * 1024 * 1024;

function u16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error('ZIP 文件结构不完整');
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error('ZIP 文件结构不完整');
  return view.getUint32(offset, true);
}

function decodeName(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('ZIP 文件名编码不正确');
  }
}

function validateEntryPath(path: string): void {
  const normalized = path.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('\u0000') ||
    normalized.split('/').some((part) => part === '..' || part === '')
  ) {
    throw new Error(`ZIP 路径非法：${path}`);
  }
}

export function readStoreZip(buffer: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  const start = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');

  const count = u16(view, eocd + 10);
  const centralOffset = u32(view, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error('ZIP 文件名越界');
    const name = decodeName(buffer.subarray(nameStart, nameEnd));
    validateEntryPath(name);
    if (flags & 0x1) throw new Error('不支持加密 ZIP');
    if (method !== 0) throw new Error('仅支持成剧导出的未压缩 ZIP');
    if (compressedSize !== uncompressedSize) throw new Error('ZIP 条目尺寸不一致');
    if (u32(view, localOffset) !== 0x04034b50) throw new Error('ZIP 本地文件头损坏');
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (localNameEnd > buffer.length) throw new Error('ZIP 本地文件名越界');
    if (decodeName(buffer.subarray(localNameStart, localNameEnd)) !== name) {
      throw new Error('ZIP 本地文件名与中央目录不一致');
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('ZIP 文件内容越界');
    entries.set(name, buffer.slice(dataStart, dataEnd));
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

export function readManifestFromEntries(entries: Map<string, Uint8Array>): ImportManifest {
  const raw = entries.get('manifest.json');
  if (!raw) throw new Error('项目包缺少 manifest.json');
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new Error('项目包 manifest 不是有效 JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('项目包格式不正确');
  }
  const manifest = value as Record<string, unknown>;
  if (!manifest.project || typeof manifest.project !== 'object') {
    throw new Error('项目包缺少项目信息');
  }
  return {
    ...manifest,
    project: manifest.project as { title?: string },
    keyframes: Array.isArray(manifest.keyframes)
      ? manifest.keyframes.filter(
          (item): item is ImportManifest['keyframes'][number] =>
            !!item && typeof item === 'object',
        )
      : [],
  };
}

export function buildProjectImportForm(entries: Map<string, Uint8Array>): FormData {
  const manifest = readManifestFromEntries(entries);
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));

  for (const keyframe of manifest.keyframes) {
    if (!keyframe.included || !keyframe.importFile || !keyframe.archivePath) continue;
    const bytes = entries.get(keyframe.archivePath);
    if (!bytes) continue;
    const name = keyframe.archivePath.split('/').at(-1) || keyframe.importFile;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    form.append(
      keyframe.importFile,
      new Blob([copy.buffer], { type: 'application/octet-stream' }),
      name,
    );
  }
  return form;
}

export async function readPickedProjectPackage(
  asset: ProjectPackageAsset,
): Promise<FormData> {
  if ((asset.size ?? 0) > MAX_PACKAGE_BYTES) {
    throw new Error('项目包超过 120 MB，无法导入');
  }
  let bytes: Uint8Array;
  if (asset.file) {
    bytes = new Uint8Array(await asset.file.arrayBuffer());
  } else {
    const { File } = await import('expo-file-system');
    bytes = await new File(asset.uri).bytes();
  }
  if (bytes.length > MAX_PACKAGE_BYTES) {
    throw new Error('项目包超过 120 MB，无法导入');
  }
  return buildProjectImportForm(readStoreZip(bytes));
}
