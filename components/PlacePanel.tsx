'use client'

// 地点视觉锚点面板（SDD E16-E17）。
//
// 为什么和角色定妆分开放：定妆在第④步（角色），地点锚点跟场次一起在第⑤步产出——
// 拆场次的时候才知道这部剧有哪些地点。机制和角色锚点一样（一段稳定的串，
// 逐镜注入），只是产出的时机不同。
//
// 它挡住的是这一类穿帮：同一个房间在第 2 镜是「冷白台灯的小办公室」，
// 到第 15 镜变成「落地窗的现代办公室」——人物的脸保住了，房间每镜在变。
import { useState } from 'react'
import AutoTextarea from './AutoTextarea'
import BatchGenerationPanel from './BatchGenerationPanel'
import CopyButton from './CopyButton'
import KeyframePanel from './KeyframePanel'
import RefImagePicker from './RefImagePicker'
import {
  buildPlaceImagePrompt,
  compilePlaceAnchor,
  placeGenerationTargetId,
} from '@/lib/assets/anchors'
import type { LookBook } from '@/lib/look'
import type { VisualPlace } from '@/lib/assets/types'
import type { VaultFile } from '@/lib/assets/vault'

type PlaceVisualFieldKey = keyof PlaceVisualFields

const FIELDS: { key: PlaceVisualFieldKey; label: string; hint: string }[] = [
  { key: 'space', label: '空间结构', hint: '老式车间、裸露水泥柱、两排熔炉' },
  { key: 'props', label: '陈设道具', hint: '角落一个封存的铁皮配方柜' },
  { key: 'lighting', label: '光线条件', hint: '顶部单排白炽灯，夜间只留值班灯' },
  { key: 'grade', label: '色调氛围', hint: '冷青底子，炉火处偏橙' },
]

type PlaceVisualFields = Pick<VisualPlace, 'space' | 'props' | 'lighting' | 'grade'>

const EMPTY_DRAFT: PlaceVisualFields = {
  space: '',
  props: '',
  lighting: '',
  grade: '',
}

interface Props {
  places: VisualPlace[]
  onChange: (next: VisualPlace[]) => void
  /** 场次里出现过、但还没有锚点的地点名——没有它，这些地点的镜头会各拍各的 */
  missing: string[]
  /** 本地图库：给地点挂场景图用 */
  vaultFiles?: VaultFile[]
  /** 地点名 -> 已挂的场景图 key */
  attached?: Record<string, string[]>
  onAttach?: (placeName: string, file: VaultFile) => void
  onDetach?: (placeName: string, key: string) => void
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  look: LookBook
  onAddPlace?: (place: VisualPlace) => Promise<void> | void
}

export default function PlacePanel({
  places, onChange, missing, vaultFiles = [], attached = {}, onAttach, onDetach,
  projectId, onEnsureProject, look, onAddPlace,
}: Props) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [draftFields, setDraftFields] = useState<PlaceVisualFields>(EMPTY_DRAFT)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const update = (id: string, patch: Partial<VisualPlace>) =>
    onChange(places.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const draftAnchor = compilePlaceAnchor(draftFields)

  function startDraft(name: string) {
    setDraftName(name)
    setDraftFields(EMPTY_DRAFT)
    setDraftError(null)
  }

  async function saveDraft() {
    if (!draftName || !draftAnchor || savingDraft) return
    const place: VisualPlace = {
      id: placeGenerationTargetId(draftName),
      name: draftName,
      ...draftFields,
      anchor: draftAnchor,
    }
    const next = [...places, place]
    setSavingDraft(true)
    setDraftError(null)
    try {
      if (onAddPlace) await onAddPlace(place)
      else onChange(next)
      setDraftName(null)
      setDraftFields(EMPTY_DRAFT)
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : "地点锚点保存失败，请重试")
    } finally {
      setSavingDraft(false)
    }
  }

  if (places.length === 0 && missing.length === 0) return null

  return (
    <div className="min-w-0 rounded-card border border-done-200 bg-done-50/50 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-done-900">
          地点视觉锚点 · 已建立 {places.length} 个地点
        </p>
        <p className="text-[11px] text-done-800/70">
          全剧共用一份，逐镜注入提示词——改这里，那个地点的所有镜头一起变
        </p>
      </div>

      {places.length > 0 && (
        <div className="mt-3">
          <BatchGenerationPanel
            title="批量生成场景图"
            description="按全剧地点清单生成 16:9 空场景，适合作所有镜头的环境与光线基准。"
            targets={places.map((place) => {
              const prompt = buildPlaceImagePrompt(place)
              return {
                key: placeGenerationTargetId(place.name),
                targetType: 'place' as const,
                targetId: placeGenerationTargetId(place.name),
                name: place.name,
                detail: [place.space, place.lighting].filter(Boolean).join(' · ') || '地点场景',
                prompt,
                aspect: 'landscape' as const,
                blockedReason: prompt.trim() ? null : '缺地点锚点',
              }
            })}
            projectId={projectId}
            onEnsureProject={onEnsureProject}
            look={look}
          />
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-2 rounded-chip border border-accent-200 bg-accent-50/70 px-2.5 py-2 text-[11px] leading-relaxed text-accent-800">
          <p>
            缺少 {missing.length} 个地点锚点。它们出现的镜头不会带地点描述，画面容易各拍各的。
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => startDraft(name)}
                className="rounded-chip border border-accent-300 bg-surface-card px-2 py-1 text-[10.5px]
                  font-medium text-accent-800 transition-colors hover:bg-accent-100"
              >
                补建锚点 · {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {draftName && (
        <div className="mt-3 rounded-chip border border-accent-300 bg-surface-card px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-800">补建地点锚点 · {draftName}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-500">
                至少填写一项，保存后会加入到地点清单。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftName(null)
                setDraftFields(EMPTY_DRAFT)
                setDraftError(null)
              }}
              className="rounded-chip px-2 py-1 text-[10.5px] text-ink-500 hover:bg-ink-50"
            >
              取消
            </button>
          </div>
          <dl className="mt-2 space-y-1.5">
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="flex gap-2">
                <dt className="mt-1 w-16 shrink-0 text-[11px] font-medium text-ink-500">{label}</dt>
                <dd className="min-w-0 flex-1">
                  <AutoTextarea
                    value={draftFields[key]}
                    onChange={(value) => setDraftFields((current) => ({ ...current, [key]: value }))}
                    ariaLabel={`${draftName} 的${label}`}
                    placeholder={hint}
                    className="text-xs leading-relaxed text-ink-600"
                  />
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 rounded-chip bg-ink-50/70 px-2.5 py-1.5">
            <p className="wrap-anywhere font-mono text-[10.5px] leading-relaxed text-ink-700">
              {draftAnchor || '（还没有内容，至少填写一个视觉字段）'}
            </p>
          </div>
          <button
            type="button"
            disabled={!draftAnchor || savingDraft}
            onClick={() => void saveDraft()}
            className="mt-2 rounded-chip border border-done-300 bg-done-50 px-3 py-1.5 text-[10.5px]
              font-semibold text-done-900 transition-colors hover:bg-done-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingDraft ? "保存中…" : "保存锚点"}
          </button>
          {draftError && (
            <p role="alert" className="mt-1.5 text-[10.5px] leading-relaxed text-accent-700">
              {draftError}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 ledger-list">
        {places.map((place) => (
          <article key={place.id} className="ledger-row min-w-0">
            <p className="text-sm font-semibold text-ink-900">{place.name}</p>
            <KeyframePanel
              projectId={projectId}
              onEnsureProject={onEnsureProject}
              targetType="place"
              targetId={placeGenerationTargetId(place.name)}
              prompt={buildPlaceImagePrompt(place)}
              aspect="landscape"
              actionLabel="生成场景图"
              look={look}
            />
            <dl className="mt-2 space-y-1.5">
              {FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="flex gap-2">
                  <dt className="mt-1 w-16 shrink-0 text-[11px] font-medium text-ink-500">{label}</dt>
                  <dd className="min-w-0 flex-1">
                    <AutoTextarea
                      value={String(place[key] ?? '')}
                      onChange={(value) => update(place.id, { [key]: value } as Partial<VisualPlace>)}
                      ariaLabel={`${place.name} 的${label}`}
                      placeholder={hint}
                      className="text-xs leading-relaxed text-ink-600"
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 min-w-0 rounded-chip bg-ink-50/70 px-2.5 py-1.5">
              <p className="wrap-anywhere font-mono text-[11px] leading-relaxed text-ink-700">
                {place.anchor || '（还没有内容，改上面四个字段或直接写锚点）'}
              </p>
            </div>

            {/*
              场景图：锚点是文字，这张图是它的下一半——把「这个房间长什么样」
              直接喂给图像模型。提示词由锚点派生（纯函数），不让模型再写一遍。
            */}
            <div className="mt-2 min-w-0 rounded-chip border border-ink-200 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10px] font-semibold text-ink-500">场景图（存在你本地，不上传）</span>
                <span className="flex items-center gap-1.5">
                  {place.anchor && (
                    <CopyButton text={buildPlaceImagePrompt(place)} label="复制出图提示词" />
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenPicker(openPicker === place.name ? null : place.name)}
                    disabled={vaultFiles.length === 0 || !onAttach}
                    className="rounded-chip border border-ink-200 px-2 py-1 text-[10px] font-medium text-ink-600
                      transition-colors hover:border-accent-300 hover:bg-accent-50 disabled:opacity-40"
                  >
                    {vaultFiles.length === 0 ? '请先在图库添加图片' : '+ 挂一张图'}
                  </button>
                </span>
              </div>

              {(attached[place.name] ?? []).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(attached[place.name] ?? []).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onDetach?.(place.name, k)}
                      title="点一下摘掉这张图"
                      className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600
                        transition-colors hover:bg-accent-100 hover:text-accent-700"
                    >
                      {k.split('/').pop()?.slice(0, 24)} ×
                    </button>
                  ))}
                </div>
              )}

              {openPicker === place.name && vaultFiles.length > 0 && onAttach && (
                <RefImagePicker
                  files={vaultFiles}
                  characterName={place.name}
                  onPick={(file) => { onAttach(place.name, file); setOpenPicker(null) }}
                  onClose={() => setOpenPicker(null)}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
