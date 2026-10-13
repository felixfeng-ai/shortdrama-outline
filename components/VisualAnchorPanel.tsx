'use client'

// 角色视觉锚点面板：一份角色的「定妆表」。
//
// 这是产品的配置区（配一次，天天用），不是工作面。
// 三件事：编辑六个视觉字段、看/改英文锚点、把本地角色图挂上来。
import { useRef, useState } from 'react'
import AutoTextarea from './AutoTextarea'
import CopyButton from './CopyButton'
import type { VisualCharacter } from '@/lib/assets/types'
import type { VaultFile } from '@/lib/assets/vault'

interface ImagePrompt { name: string; zh: string; en: string }

interface Props {
  visuals: VisualCharacter[]
  onChange: (next: VisualCharacter[]) => void
  imagePrompts: ImagePrompt[]
  /** 本地图库中已有的图，用于挂到角色上 */
  vaultFiles: VaultFile[]
  /** 角色名 -> 已挂的图 key 列表 */
  attached: Record<string, string[]>
  onAttach: (characterName: string, file: VaultFile) => void
}

const FIELDS: { key: keyof VisualCharacter; label: string; hint: string }[] = [
  { key: 'age', label: '年龄', hint: '28岁' },
  { key: 'face', label: '脸型五官', hint: '偏长脸、窄眼' },
  { key: 'hair', label: '发色发型', hint: '黑色短发、齐耳' },
  { key: 'marks', label: '辨识特征', hint: '左眉尾浅疤' },
  { key: 'wardrobe', label: '服装', hint: '沙色棉质短夹克' },
  { key: 'props', label: '随身道具', hint: '钴蓝色硬壳笔记本' },
]

export default function VisualAnchorPanel({ visuals, onChange, imagePrompts, vaultFiles, attached, onAttach }: Props) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const pickerRef = useRef<HTMLSelectElement | null>(null)

  const update = (id: string, patch: Partial<VisualCharacter>) =>
    onChange(visuals.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  if (visuals.length === 0) return null

  return (
    <div className="space-y-4">
      {visuals.map((vc, i) => {
        const prompt = imagePrompts.find((p) => p.name === vc.name)
        const keys = attached[vc.name] ?? []

        return (
          <article key={vc.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">角色 {i + 1}</span>
              <div className="flex items-center gap-2">
                <AutoTextarea
                  value={vc.name}
                  onChange={(name) => update(vc.id, { name })}
                  ariaLabel={`角色 ${i + 1} 姓名`}
                  placeholder="角色姓名"
                  className="text-base font-semibold text-slate-900"
                />
              </div>
            </div>

            <dl className="space-y-2">
              {FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="flex gap-2">
                  <dt className="mt-1 w-20 shrink-0 text-xs font-medium text-slate-500">{label}</dt>
                  <dd className="min-w-0 flex-1">
                    <AutoTextarea
                      value={String(vc[key] ?? '')}
                      onChange={(value) => update(vc.id, { [key]: value } as Partial<VisualCharacter>)}
                      ariaLabel={`${vc.name} 的${label}`}
                      placeholder={hint}
                      className="text-sm leading-relaxed text-slate-600"
                    />
                  </dd>
                </div>
              ))}
            </dl>

            {/* 英文锚点：会被逐镜复用，所以单独展示且可手改 */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500">
                  英文锚点（逐镜复用，改动会触发下游过期）
                </span>
                <CopyButton text={vc.anchor} label="复制锚点" />
              </div>
              <AutoTextarea
                value={vc.anchor}
                onChange={(anchor) => update(vc.id, { anchor })}
                ariaLabel={`${vc.name} 的英文锚点`}
                placeholder="age: ..., wearing: ..."
                className="font-mono text-xs leading-relaxed text-slate-700"
              />
            </div>

            {/* 定妆图提示词（中英双语，供即梦出图） */}
            {prompt && (
              <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-brand-800">定妆图提示词（去即梦出角色图）</span>
                  <CopyButton text={prompt.en} label="复制英文" />
                </div>
                <p className="font-mono text-xs leading-relaxed text-slate-700">{prompt.en}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{prompt.zh}</p>
              </div>
            )}

            {/* 本地角色图：只登记引用，图不上传（原则 P1） */}
            <div className="mt-2 rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500">
                  角色参考图（存在你本地，不上传）
                </span>
                <button
                  type="button"
                  onClick={() => setOpenPicker(openPicker === vc.name ? null : vc.name)}
                  disabled={vaultFiles.length === 0}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600
                    transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40"
                >
                  {vaultFiles.length === 0 ? '请先在图库添加图片' : '+ 挂一张图'}
                </button>
              </div>

              {keys.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {keys.map((k) => (
                    <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {k.split('/').pop()?.slice(0, 24)}
                    </span>
                  ))}
                </div>
              )}

              {openPicker === vc.name && vaultFiles.length > 0 && (
                <div className="mt-2 flex gap-2">
                  <select
                    ref={pickerRef}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                    defaultValue=""
                  >
                    <option value="" disabled>选择一张图…</option>
                    {vaultFiles.map((f) => (
                      <option key={f.key} value={f.key}>{f.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const key = pickerRef.current?.value
                      const file = vaultFiles.find((f) => f.key === key)
                      if (file) { onAttach(vc.name, file); setOpenPicker(null) }
                    }}
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                  >
                    挂上
                  </button>
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
