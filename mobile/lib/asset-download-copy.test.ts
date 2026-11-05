import assert from 'node:assert/strict';
import test from 'node:test';

import {
  downloadDialogTitle,
  downloadFailureMessage,
  downloadMediaLabel,
} from './asset-download-copy.ts';

test('下载文案按 MIME 区分视频、音频和图片', () => {
  assert.equal(downloadMediaLabel('video/mp4'), '视频');
  assert.equal(downloadMediaLabel('audio/mpeg'), '音频');
  assert.equal(downloadMediaLabel('image/png'), '图片');
  assert.equal(downloadDialogTitle('video/mp4'), '保存视频');
  assert.equal(downloadDialogTitle('audio/wav'), '保存音频');
});

test('视频下载失败保留 HTTP 状态，不再误报图片失败', () => {
  assert.equal(downloadFailureMessage('video/mp4', 500), '视频下载失败（HTTP 500）');
  assert.match(downloadFailureMessage('video/mp4', 401), /登录/);
  assert.match(downloadFailureMessage('video/mp4', 404), /不存在/);
});
