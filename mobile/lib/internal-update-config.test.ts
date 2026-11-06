import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('EAS Update 配置覆盖内测与生产通道', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const app = JSON.parse(fs.readFileSync('app.json', 'utf8')) as {
    expo?: {
      extra?: { eas?: { projectId?: string } };
      updates?: { url?: string };
      runtimeVersion?: { policy?: string };
    };
  };
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8')) as {
    build?: Record<string, { channel?: string }>;
  };

  assert.ok(pkg.dependencies?.['expo-updates']);
  assert.match(
    app.expo?.updates?.url ?? '',
    /u\.expo\.dev\/fd5d8e4e-37c8-4c4f-a8c9-7d0612a5f435/,
  );
  assert.equal(app.expo?.runtimeVersion?.policy, 'appVersion');
  assert.equal(eas.build?.preview?.channel, 'preview');
  assert.equal(eas.build?.production?.channel, 'production');
});

test('App 提供检查、下载和用户确认后重启更新', () => {
  const service = fs.readFileSync('lib/app-updates.ts', 'utf8');
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');

  assert.match(service, /checkForUpdateAsync/);
  assert.match(service, /fetchUpdateAsync/);
  assert.match(service, /reloadAsync/);
  assert.ok(me.includes('检查内测更新'));
  assert.ok(me.includes('applyAppUpdate'));
});
