// 生成中的骨架屏。三个步骤的占位形状略有不同，用 variant 区分。
// 作用：让等待有「内容正在长出来」的感觉，而不是一片空白。

function Bar({ width }: { width: string }) {
  return <div className="skeleton-bar h-3.5" style={{ width }} />
}

interface Props {
  variant: 'characters' | 'acts' | 'episodes'
}

export default function Skeleton({ variant }: Props) {
  if (variant === 'characters') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <Bar width="45%" />
            <Bar width="90%" />
            <Bar width="75%" />
            <Bar width="60%" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'acts') {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <Bar width="30%" />
            <Bar width="95%" />
            <Bar width="85%" />
            <Bar width="65%" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <Bar width="35%" />
          <Bar width="92%" />
          <Bar width="55%" />
        </div>
      ))}
    </div>
  )
}
