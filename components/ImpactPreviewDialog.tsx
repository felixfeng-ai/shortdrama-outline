"use client"

import { useEffect, useRef } from "react"

import type { RepairAnchorsPreview } from "@/lib/rework/preview"

interface Props {
  preview: RepairAnchorsPreview
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 确定性批量返修的修改前确认层。
 * 预览阶段不写库；只有用户确认后才生成新的分镜快照。
 */
export default function ImpactPreviewDialog({
  preview,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    confirmRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      previousFocus.current?.focus()
    }
  }, [busy, onCancel])

  return (
    <div
      className="wfx-impact-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        className="wfx-impact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wfx-impact-title"
      >
        <header>
          <span>修改前影响预览</span>
          <h2 id="wfx-impact-title">修复 {preview.shotCount} 个镜头的提示词</h2>
          <p>只把最新角色和地点锚点追加到 Prompt，不生成图片或视频。</p>
        </header>

        <dl className="wfx-impact-metrics">
          <div><dt>受影响镜头</dt><dd>{preview.shotCount}</dd></div>
          <div><dt>涉及分集</dt><dd>{preview.episodeCount}</dd></div>
          <div><dt>涉及场次</dt><dd>{preview.sceneCount}</dd></div>
          <div><dt>已出图转返修</dt><dd>{preview.selectedImageShots}</dd></div>
        </dl>

        <ul className="wfx-impact-facts">
          <li>不调用模型</li>
          <li>不扣创作额度</li>
          <li>保存为新的分镜版本</li>
          <li>不改角色定妆和已采用素材</li>
        </ul>

        <footer>
          <p>确认后旧分镜版本仍保留，可在产物中心比较和恢复。</p>
          <div>
            <button
              className="wfx-button is-secondary"
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              取消
            </button>
            <button
              ref={confirmRef}
              className="wfx-button"
              type="button"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "正在保存…" : "生成新分镜版本"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
