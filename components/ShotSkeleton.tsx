'use client'

// 分镜/场次的加载骨架屏。
function Bar({ width }: { width: string }) {
  return <div className="skeleton-bar h-3.5" style={{ width }} />
}

export default function ShotSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-card border border-surface-line bg-surface-card p-4">
          <Bar width="25%" />
          <Bar width="70%" />
          <Bar width="92%" />
          <Bar width="50%" />
        </div>
      ))}
    </div>
  )
}
