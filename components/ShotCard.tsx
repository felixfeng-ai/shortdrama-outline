'use client'

// 镜头卡：产品的主工作面。
//
// 每张卡承载四件事（对应 SDD B4/B5/B6）：
//   1. 七个字段（场景/角色/动作/景别/运镜/提示词），全部可编辑
//   2. 本镜该带哪几张参考图 —— 双人同框串脸的主要防线
//   3. 生成参数（竖屏 9:16 / 时长 / 尾帧）—— 接出图平台的最后一公里
//   4. 返修状态 —— 返修雷达的落点
import AutoTextarea from './AutoTextarea'
import CopyButton from './CopyButton'
import { shotToWorkOrder } from '@/lib/assets/export'
import { CAMERA_MOVES, SHOT_DURATIONS, SHOT_SIZES, isSupportedDuration, type Shot, type ShotStatus } from '@/lib/assets/types'

interface Props {
  shot: Shot
  index: number
  onUpdate: (id: string, patch: Partial<Shot>) => void
  onRemove: (id: string) => void
  /** 是否为放映厅当前选中的那一镜 */
  active?: boolean
  /** 点到这张卡就把放映厅切到这一镜 */
  onSelect?: (id: string) => void
}

const STATUS_META: Record<ShotStatus, { label: string; cls: string }> = {
  todo: { label: '待出图', cls: 'bg-ink-100 text-ink-600' },
  done: { label: '已出图', cls: 'bg-done-100 text-done-700' },
  rework: { label: '需返修', cls: 'bg-accent-100 text-accent-800' },
}

export default function ShotCard({ shot, index, onUpdate, onRemove, active = false, onSelect }: Props) {
  const missing = shot.missingRefFor ?? []

  return (
    <article
      // 点卡片任意位置就把放映厅切到这一镜：提示词、参数、缩略图都跟着换
      onClick={() => onSelect?.(shot.id)}
      className={`lift min-w-0 rounded-card border bg-surface-card p-3.5 sm:p-4
        ${active ? 'border-accent-300 ring-1 ring-accent-200' : 'border-surface-line'}`}
    >
      {/* 头部：镜号 + 状态 + 删除 */}
      <div className="mb-3 flex items-start gap-2.5 sm:gap-3">
        <span className="mt-0.5 w-7 shrink-0 text-center text-lg leading-7 text-ink-900">
          {shot.shot}
        </span>

        <div className="min-w-0 flex-1">
          {/* 集号：分镜是全剧的，没有它分不清这一镜属于哪一集 */}
          {shot.episode > 0 && (
            <span className="mb-0.5 inline-block rounded-chip bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
              第 {shot.episode} 集
            </span>
          )}
          <AutoTextarea
            value={shot.scene}
            onChange={(scene) => onUpdate(shot.id, { scene })}
            ariaLabel={`第 ${shot.shot} 镜场景`}
            placeholder="场景"
            className="-ml-2 text-sm font-semibold text-ink-900"
          />
        </div>

        <select
          value={shot.status}
          onChange={(e) => onUpdate(shot.id, { status: e.target.value as ShotStatus })}
          aria-label={`第 ${shot.shot} 镜状态`}
          className={`shrink-0 rounded-chip border border-transparent px-2 py-1 text-xs font-medium ${STATUS_META[shot.status].cls}`}
        >
          {(Object.keys(STATUS_META) as ShotStatus[]).map((k) => (
            <option key={k} value={k}>{STATUS_META[k].label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onRemove(shot.id)}
          aria-label={`删除第 ${shot.shot} 镜`}
          className="shrink-0 rounded-chip p-2 text-ink-200 transition-colors hover:bg-accent-50 hover:text-accent-600"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="min-w-0 space-y-2 pl-0 sm:pl-10">
        {/* B6：本镜参考图标注 —— 双人同框不一致的主要防线 */}
        <div className={`flex min-w-0 flex-wrap items-center gap-1.5 break-words rounded-chip border px-3 py-2 text-xs
          ${missing.length > 0 ? 'border-accent-200 bg-accent-50/70' : 'border-surface-line bg-surface/70'}`}>
          <span className="font-medium text-ink-500">本镜参考图</span>
          {shot.refImages.length > 0 ? (
            shot.refImages.map((r) => (
              <span key={r} className="break-all rounded-chip bg-surface-card px-1.5 py-0.5 font-medium text-ink-700 ring-1 ring-surface-line">
                {r}
              </span>
            ))
          ) : (
            <span className="text-ink-300">无</span>
          )}
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => {
                // 滚到第三步的视觉定妆，并高亮缺图的角色——光给警告不给出口等于没提示
                const target = document.getElementById('visual-anchors')
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                window.dispatchEvent(new CustomEvent('chengju:focus-vc', { detail: missing }))
              }}
              title={`去视觉定妆给 ${missing.join('、')} 挂参考图`}
              className="ml-1 rounded-chip bg-accent-200/70 px-1.5 py-0.5 font-semibold text-accent-800
                transition-colors hover:bg-accent-300 focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-accent-400"
            >
              缺参考图：{missing.join('、')} · 去挂图
            </button>
          )}
        </div>

        {/* 出场角色 */}
        <div className="flex min-w-0 gap-2">
          <span className="mt-1 w-14 shrink-0 text-xs font-medium text-ink-400">出场角色</span>
          <AutoTextarea
            value={shot.characters.join('、')}
            onChange={(v) => onUpdate(shot.id, { characters: v.split(/[、,，\s]+/).filter(Boolean) })}
            ariaLabel={`第 ${shot.shot} 镜出场角色`}
            placeholder="角色名，用、分隔"
            className="text-sm leading-relaxed text-ink-600"
          />
        </div>

        {/* 动作 */}
        <div className="flex min-w-0 gap-2">
          <span className="mt-1 w-14 shrink-0 text-xs font-medium text-ink-400">动作</span>
          <AutoTextarea
            value={shot.action}
            onChange={(action) => onUpdate(shot.id, { action })}
            ariaLabel={`第 ${shot.shot} 镜动作`}
            placeholder="动作描述"
            className="text-sm leading-relaxed text-ink-600"
          />
        </div>

        {/*
          台词：这是唯一一条下游补不上的输入——即梦不知道你的剧情，剪映不认识你的角色。
          两个字段都留空就是纯画面镜头，这是合法的，不强制每镜都说话。
        */}
        <div className="flex min-w-0 gap-2">
          <span className="mt-1 w-14 shrink-0 text-xs font-medium text-ink-400">台词</span>
          <div className="flex min-w-0 flex-1 gap-1.5">
            <AutoTextarea
              value={shot.speaker}
              onChange={(speaker) => onUpdate(shot.id, { speaker })}
              ariaLabel={`第 ${shot.shot} 镜说话人`}
              placeholder="谁说的"
              className="w-16 shrink-0 text-sm text-ink-600"
            />
            <AutoTextarea
              value={shot.dialogue}
              onChange={(dialogue) => onUpdate(shot.id, { dialogue })}
              ariaLabel={`第 ${shot.shot} 镜台词`}
              placeholder="纯画面镜头留空"
              className="min-w-0 flex-1 text-sm leading-relaxed text-ink-600"
            />
          </div>
        </div>

        {/*
          参数行：走「分镜视觉」的暗面板语言 —— 深棕黑底 + 浅金数值。
          这是整张卡里第二块暗色，和下面的提示词原文一起构成「要交给机器的东西」。
        */}
        <div className="darkroom mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 px-3.5 py-2.5">
          <label className="flex items-center gap-2 text-xs text-cinema-text">
            景别
            <select
              value={shot.shotSize || '中景'}
              onChange={(e) => onUpdate(shot.id, { shotSize: e.target.value })}
              aria-label={`第 ${shot.shot} 镜景别`}
              className="rounded-chip bg-white/[0.07] px-2 py-1 text-xs font-semibold text-gold
                outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              {SHOT_SIZES.map((s) => <option key={s} value={s} className="text-ink-800">{s}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-cinema-text">
            运镜
            <select
              value={shot.camera}
              onChange={(e) => onUpdate(shot.id, { camera: e.target.value })}
              aria-label={`第 ${shot.shot} 镜运镜`}
              className="rounded-chip bg-white/[0.07] px-2 py-1 text-xs font-semibold text-gold
                outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              {CAMERA_MOVES.map((m) => <option key={m} value={m} className="text-ink-800">{m}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-cinema-text">
            画幅
            <select
              value={shot.params.ratio}
              onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, ratio: e.target.value } })}
              aria-label={`第 ${shot.shot} 镜画面比例`}
              className="rounded-chip bg-white/[0.07] px-2 py-1 text-xs font-semibold text-gold
                outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <option value="9:16" className="text-ink-800">竖屏 9:16</option>
              <option value="16:9" className="text-ink-800">横屏 16:9</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-cinema-text">
            时长
            {/*
              枚举而不是自由数字框：出视频平台只认固定档位，填 7 秒会到平台才被拒。
              旧数据里的非标档位显示成「N 秒（平台不认）」而不是静默改成 5 秒。
            */}
            <select
              value={String(shot.params.duration)}
              onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, duration: Number(e.target.value) } })}
              aria-label={`第 ${shot.shot} 镜时长（秒）`}
              className="rounded-chip bg-white/[0.07] px-2 py-1 text-xs font-semibold text-gold
                outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              {SHOT_DURATIONS.map((d) => (
                <option key={d} value={d} className="text-ink-800">{d} 秒</option>
              ))}
              {!isSupportedDuration(shot.params.duration) && (
                <option value={shot.params.duration} className="text-ink-800">
                  {shot.params.duration} 秒（平台不认）
                </option>
              )}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-cinema-text">
            <input
              type="checkbox" checked={shot.params.lastFrame}
              onChange={(e) => onUpdate(shot.id, { params: { ...shot.params, lastFrame: e.target.checked } })}
              aria-label={`第 ${shot.shot} 镜接下一镜首帧`}
              title="勾选后，这一镜的尾帧会接到下一镜的首帧；分镜工具条上会出现「复制衔接清单」，列出该导出的尾帧与衔接顺序"
              className="accent-accent-500"
            />
            接下一镜首帧
          </label>
        </div>

        {/* B5：提示词 —— 唯一要被复制的字段，单独高亮 + 等宽 */}
        <div className="darkroom min-w-0 overflow-hidden px-3 py-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-done-300">提示词 · 英文 · 已内嵌角色锚点</span>
            <span className="flex items-center gap-1.5">
              <CopyButton text={shot.prompt} label="复制 prompt" />
              {/* 平台没有导入接口，能做的极限是让用户照单执行：提示词 + 参考图 + 参数一次拿走 */}
              <CopyButton text={shotToWorkOrder(shot)} label="复制执行单" />
            </span>
          </div>
          <AutoTextarea
            value={shot.prompt}
            onChange={(prompt) => onUpdate(shot.id, { prompt })}
            ariaLabel={`第 ${shot.shot} 镜提示词`}
            placeholder="English prompt"
            className="wrap-anywhere min-w-0 font-mono text-xs leading-relaxed text-ink-100"
          />
        </div>
      </div>
    </article>
  )
}
