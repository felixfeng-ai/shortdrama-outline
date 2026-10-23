// 健康检查：给运维和外部监控一个「这个站点还活着吗」的稳定入口。
//
// 为什么不复用首页：首页是静态渲染的，它返回 200 只说明 CDN 有缓存，
// 说明不了进程、数据库、模型 Key 这三件事。这里逐个报，出错也不抛 500——
// 监控要的是「哪一项坏了」，不是一个笼统的失败。
import { NextResponse } from 'next/server'
import { getDbForRequest } from '@/lib/assets/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, boolean> = {
    // 模型 Key 缺失时应用能启动，但所有生成都会失败——这属于「不健康」
    modelKey: !!process.env.DEEPSEEK_API_KEY,
    imageKey: !!process.env.ALIYUN_DASHSCOPE_API_KEY,
    db: false,
  }

  try {
    // 真跑一条查询，而不是只看文件在不在
    getDbForRequest().prepare('SELECT 1 AS ok').get()
    checks.db = true
  } catch {
    checks.db = false
  }

  const healthy = Object.values(checks).every(Boolean)
  return NextResponse.json(
    { ok: healthy, checks, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  )
}
