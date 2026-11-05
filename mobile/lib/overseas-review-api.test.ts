import assert from 'node:assert/strict';
import test from 'node:test';

import { loadOverseasReviews } from './overseas-review-api.ts';

test('海外审片聚合分支、平台、字幕规则和最新审计', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/localization/branches')) {
      return Response.json({
        success: true,
        data: {
          branches: [{
            id: 'branch-en',
            projectId: 'project-1',
            ownerId: 'owner-1',
            name: '北美版',
            branchType: 'localization',
            locale: 'en-US',
            market: 'US',
            sourceLanguage: 'zh-CN',
            status: 'active',
            parentBranchId: null,
            baseSnapshotId: 'snapshot-1',
            note: '',
            createdAt: 1,
            updatedAt: 2,
          }],
        },
        error: null,
      });
    }
    if (url.endsWith('/branch-en/context')) {
      return Response.json({
        success: true,
        data: {
          context: {
            branchId: 'branch-en',
            projectId: 'project-1',
            marketCode: 'en-US',
            profile: {
              code: 'en-US',
              label: '北美英语',
              platforms: ['TikTok', 'ReelShort', 'DramaBox'],
              subtitle: { maxLineChars: 42, maxCps: 17 },
              visualRules: ['货币使用 USD'],
            },
            platforms: ['TikTok', 'ReelShort'],
            adaptationBrief: {
              audience: '北美短剧用户',
              emotion: '紧张',
              strategy: '减少解释',
              redlines: ['血腥'],
            },
            subtitle: {
              maxLineChars: 42,
              maxCps: 17,
              minDurationMs: 1000,
              maxDurationMs: 7000,
            },
            version: 1,
            updatedAt: 2,
          },
        },
        error: null,
      });
    }
    if (url.endsWith('/branch-en/audit')) {
      return Response.json({
        success: true,
        data: {
          audit: {
            blocking: 1,
            warning: 1,
            issues: [{
              code: 'glossary-miss',
              severity: 'blocking',
              episode: 2,
              field: 'localized',
              message: '锁定术语「林昭」没有使用 Lin Zhao',
              evidence: 'Lin',
              suggestion: '改为 Lin Zhao',
            }],
          },
        },
        error: null,
      });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;

  const reviews = await loadOverseasReviews(
    'http://127.0.0.1:3200',
    'project-1',
    fetchImpl,
  );

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].name, '北美版');
  assert.equal(reviews[0].marketLabel, '北美英语');
  assert.equal(reviews[0].subtitleMaxLineChars, 42);
  assert.deepEqual(reviews[0].platforms, ['TikTok', 'ReelShort']);
  assert.equal(reviews[0].audit.blocking, 1);
  assert.match(reviews[0].audit.issues[0].message, /Lin Zhao/);
  assert.equal(calls.length, 3);
});

test('没有海外分支时返回真实空列表', async () => {
  const fetchImpl = (async () => Response.json({
    success: true,
    data: { branches: [] },
    error: null,
  })) as typeof fetch;
  assert.deepEqual(
    await loadOverseasReviews('http://127.0.0.1:3200', 'project-1', fetchImpl),
    [],
  );
});
