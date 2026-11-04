import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendVoiceTranscript,
  readPickedImage,
} from './media-input.ts';

test('相册和相机结果转换成统一的本机附件', () => {
  const attachment = readPickedImage({
    canceled: false,
    assets: [{
      uri: 'file:///tmp/reference.jpg',
      fileName: 'reference.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 1600,
      fileSize: 2048,
    }],
  });
  assert.deepEqual(attachment, {
    id: 'file:///tmp/reference.jpg',
    uri: 'file:///tmp/reference.jpg',
    name: 'reference.jpg',
    mime: 'image/jpeg',
    width: 1200,
    height: 1600,
    bytes: 2048,
  });
  assert.equal(readPickedImage({ canceled: true, assets: null }), null);
});

test('语音转写替换临时结果并可继续手改', () => {
  assert.equal(appendVoiceTranscript('收紧', '第三集钩子'), '收紧第三集钩子');
  assert.equal(appendVoiceTranscript('收紧。', ''), '收紧。');
});
