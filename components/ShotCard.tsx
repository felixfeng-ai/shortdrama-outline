'use client'

// 镜头卡：产品的主工作面。
//
// 每张卡承载四件事（对应 SDD B4/B5/B6）：
//   1. 六个字段（场景/角色/动作/运镜/提示词），全部可编辑
//   2. 本镜该带哪几张参考图 —— 双人同框串脸的主要防线
//   3. 生成参数（竖屏 9:16 / 时长 / 尾帧）—— 接即梦的最后一公里
//   4. 返修状态 —— 返修雷达的落点
import AutoTextarea from './AutoTextarea'
import CopyButton from './CopyButton'
import { CAMERA_MOVES, type Shot, type ShotStatus } from '@/lib/assets/types'

interface Props {
  shot: Shot
  index: number
  onUpdate: (id: string, patch: Partial<Shot>) => void
  onRemove: (id: string) => void
}

const STATUS_META: Record<ShotStatus, { label: string; cls: string }> = {
  todo: { label: '待出图', cls: 'bg-slate-100 text-slate-600' },
  done: { label: '已出图', cls: 'bg-emerald-100 text-emerald-700' },
  rework: { label: '需返修', cls: 'bg-rose-100 text-rose-700' },
}

export default function ShotCard({ shot, index, onUpdate, onRemove }: Props) {
  const missing = shot.missingRefFor ?? []

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
      {/* 头部：镜号 + 状态 + 删除 */}
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
          {shot.shot}
        </span>

        <div className="min-w-0 flex-1">
          <AutoTextarea
            value={shot.scene}
            onChange={(scene) => onUpdate(shot.id, { scene })}
            ariaLabel={`第 ${shot.shot} 镜场景`}
            placeholder="场景"
            className="-ml-2 text-sm font-semibold text-slate-900"
          />
        </div>

        <select
          value={shot.status}
          onChange={(e) => onUpdate(shot.id, { status: e.target.value as ShotStatus })}
          aria-label={`第 ${shot.shot} 镜状态`}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${STATUS_META[shot.status].cls}`}
        >
          {(Object.keys(STATUS_META) as ShotStatus[]).map((k) => (
            <option key={k} value={k}>{STATUS_META[k].label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onRemove(shot.id)}
          aria-label={`删除第 ${shot.shot} 镜`}
          className="shrink-0 rounded-md p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="space-y-2 pl-10">
        {/* B6：本镜参考图标注 —— 双人同框不一致的主要防线 */}
        <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 text-xs
          ${missing.length > 0 ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/60'}`}>
          <span className="font-medium text-slate-500">本镜参考图</span>
          {shot.refImages.length > 0 ? (
            shot.refImages.map((r) => (
              <span key={r} className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">
                {r}
              </span>
            ))
          ) : (
            <span className="text-slate-400">无</span>
          )}
          {missing.length > 0 && (
            <span className="ml-1 rounded bg-amber-200/70 px-1.5 py-0.5 font-semibold text-amber-800">
              缺参考图：{missing.join('、')}
            </span>
          )}
        </div>

        {/* 出场角色 */}
        <div className="flex gap-2">
          <span className="mt-1 w-14 shrink-0 text-xs font-medium text-slate-500">出场角色</span>
          <AutoTextarea
            value={shot.characters.join('、')}
            onChange={(v) => onUpdate(shot.id, { characters: v.split(/[、,，\s]+/).filter(Boolean) })}
            ariaLabel={`第 ${shot.shot} 镜出场角色`}
            placeholder="角色名，用、分隔"
            className="text-sm leading-relaxed text-slate-600"
          />
        </div>

        {/* 动作 */}
        <div className="flex gap-2">
          <span className="mt-1 w-14 shrink-0 text-xs font-medium text-slate-500">动作</span>
          <AutoTextarea
            value={shot.action}
            onChange={(action) => onUpdate(shot.id, { action })}
            ariaLabel={`第 ${shot.shot} 镜动作`}
            placeholder="动作描述"
            className="text-sm leading-relaxed text-slate-600"
          />
        </div>

        {/* 运镜 + 参数 */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={shot.camera}
            onChange={(e) => onUpdate(shot.id, { camera: e.target.value })}
            aria-label={`第 ${shot.shot} 镜运镜`}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {CAMERA_MOVES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <select
            value={shot.params.ratio}
            onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, ratio: e.target.value } })}
            aria-label={`第 ${shot.shot} 镜画面比例`}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <option value="9:16">竖屏 9:16</option>
            <option value="16:9">横屏 16:9</option>
          </select>

          <label className="flex items-center gap-1 text-xs text-slate-600">
            时长
            <input
              type="number" min={1} max={30} value={shot.params.duration}
              onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, duration: Number(e.target.value) || 5 } })}
              className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-xs"
            />
            秒
          </label>

          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox" checked={shot.params.lastFrame}
              onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, lastFrame: e.target.checked } })}
            />
            接下一镜首帧
          </label>
        </div>

        {/* B5：提示词 —— 唯一要被复制的字段，单独高亮 + 等宽 */}
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-brand-800">提示词（英文，已内嵌角色锚点）</span>
            <CopyButton text={shot.prompt} label="复制 prompt" />
          </div>
          <AutoTextarea
            value={shot.prompt}
            onChange={(prompt) => onUpdate(shot.id, { prompt })}
            ariaLabel={`第 ${shot.shot} 镜提示词`}
            placeholder="English prompt"
            className="font-mono text-xs leading-relaxed text-slate-700"
          />
        </div>
      </div>
    </article>
  )
}
