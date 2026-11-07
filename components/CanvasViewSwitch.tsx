"use client"

export type CanvasWorkspaceView = "production" | "free"

interface Props {
  value: CanvasWorkspaceView
  onChange: (value: CanvasWorkspaceView) => void
}

export default function CanvasViewSwitch({ value, onChange }: Props) {
  return (
    <div className="canvas-view-switch" role="tablist" aria-label="画布视图">
      <button
        type="button"
        role="tab"
        aria-selected={value === "production"}
        className={value === "production" ? "is-active" : ""}
        onClick={() => onChange("production")}
      >
        生产画布
        <small>默认可读</small>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "free"}
        className={value === "free" ? "is-active" : ""}
        onClick={() => onChange("free")}
      >
        自由画布
        <small>高级编排</small>
      </button>
    </div>
  )
}
