import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

interface EasBuildProfile {
  distribution?: string;
  environment?: string;
  android?: { buildType?: string };
  env?: Record<string, string>;
}

const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8')) as {
  build?: Record<string, EasBuildProfile>;
};

test('Android 内测配置产出可安装 APK 并连接线上 API', () => {
  const preview = eas.build?.preview;
  assert.equal(preview?.distribution, 'internal');
  assert.equal(preview?.environment, 'preview');
  assert.equal(preview?.android?.buildType, 'apk');
  assert.equal(preview?.env?.EXPO_PUBLIC_API_URL, 'https://chenju.work');
});

test('正式构建和提交 profile 保持可辨识', () => {
  assert.ok(eas.build?.production, '缺少 production build profile');
  assert.notEqual(eas.build?.production?.distribution, 'internal');
});

test('内测操作文档覆盖 APK、iOS 内测和 TestFlight', () => {
  const guide = fs.readFileSync('../docs/IOS-TESTFLIGHT-ANDROID-APK.md', 'utf8');
  assert.match(guide, /eas init/);
  assert.match(guide, /--profile preview --platform android/);
  assert.match(guide, /--profile preview --platform ios/);
  assert.match(guide, /TestFlight/);
  assert.match(guide, /--profile production --platform ios/);
  assert.match(guide, /不得伪造|不能伪造|不要手填/);
});
