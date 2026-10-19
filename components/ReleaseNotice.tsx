'use client'

// 上线公告：到点才出现，关掉后不再打扰。
// 发布时间可用 NEXT_PUBLIC_RELEASE_AT 覆盖（ISO 字符串，默认北京时间 10-20 17:00）。
import { useEffect, useState } from 'react'

const RELEASE_AT = Date.parse(
  process.env.NEXT_PUBLIC_RELEASE_AT || '2026-10-20T17:00:00+08:00',
)
const STORAGE_KEY = 'chengju:notice:h-deck-v1'

export default function ReleaseNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (Number.isNaN(RELEASE_AT) || Date.now() < RELEASE_AT) return
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return
    } catch {
      // 隐私模式读不到，就照常展示
    }
    setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // 写不了也只影响下次是否再提示
    }
  }

  return (
    <div className="release-note" role="status">
      <span className="release-dot" aria-hidden="true" />
      <p>
        <b>成剧换界面了</b>：左边写、右边看。六步流程没变，分镜与 AI 场记并进右侧产出舱；
        分集可选 10 / 30 / 60 集。已有项目数据不受影响。
      </p>
      <button type="button" onClick={dismiss}>
        知道了
      </button>
    </div>
  )
}
