import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Agent 输入区接入相机、相册与语音识别', () => {
  const source = fs.readFileSync('components/agent-composer.tsx', 'utf8');
  assert.ok(source.includes('launchCameraAsync'), '没有相机入口');
  assert.ok(source.includes('launchImageLibraryAsync'), '没有相册入口');
  assert.ok(source.includes('requestCameraPermissionsAsync'), '没有相机权限');
  assert.ok(source.includes('ExpoSpeechRecognitionModule.requestPermissionsAsync'), '没有语音权限');
  assert.ok(source.includes('isRecognitionAvailable'), '没有检查语音识别服务');
  assert.ok(source.includes('getSpeechRecognitionServices'), '没有检查 Android 识别器');
  assert.ok(source.includes('ExpoSpeechRecognitionModule.start'), '没有开始语音识别');
  assert.ok(source.includes('ExpoSpeechRecognitionModule.stop'), '没有停止语音识别');
});
