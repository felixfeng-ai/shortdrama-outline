'use client'

import ShotCard from './ShotCard'
import type { Shot } from '@/lib/assets/types'

interface Props {
  shots: Shot[]
  onChange: (next: Shot[]) => void
}

export default function ShotList({ shots, onChange }: Props) {
  const update = (id: string, patch: Partial<Shot>) =>
    onChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  // 删除后重排镜号，否则会出现「2、3、4…」这种没有第 1 镜的清单
  const remove = (id: string) =>
    onChange(shots.filter((s) => s.id !== id).map((s, i) => ({ ...s, shot: i + 1 })))

  return (
    <div className="space-y-3">
      {shots.map((shot, i) => (
        <ShotCard key={shot.id} shot={shot} index={i} onUpdate={update} onRemove={remove} />
      ))}
    </div>
  )
}
