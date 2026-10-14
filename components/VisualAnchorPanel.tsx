'use client'

// 角色视觉锚点面板：一份角色的「定妆表」。
//
// 这是产品的配置区（配一次，天天用），不是工作面。
// 三件事：编辑六个视觉字段、看/改英文锚点、把本地角色图挂上来。
import { useEffect, useState } from 'react'
import AutoTextarea from './AutoTextarea'
import CopyButton from './CopyButton'
import RefImagePicker from './RefImagePicker'
import type { VisualCharacter } from '@/lib/assets/types'
import { getPreviewUrl, type VaultFile } from '@/lib/assets/vault'

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
  /** 摘掉一张已挂的图（挂错了要能撤回） */
  onDetach?: (characterName: string, key: string) => void
}

const FIELDS: { key: keyof VisualCharacter; label: string; hint: string }[] = [
  { key: 'age', label: '年龄', hint: '28岁' },
  { key: 'face', label: '脸型五官', hint: '偏长脸、窄眼' },
  { key: 'hair', label: '发色发型', hint: '黑色短发、齐耳' },
  { key: 'marks', label: '辨识特征', hint: '左眉尾浅疤' },
  { key: 'wardrobe', label: '服装', hint: '沙色棉质短夹克' },
  { key: 'props', label: '随身道具', hint: '钴蓝色硬壳笔记本' },
]

/**
 * 批量出图工具箱。
 *
 * 为什么需要它：逐个角色复制提示词去即梦出图，5 个角色就是 5 轮
 * 「复制→切窗口→粘贴→等→下载→改名」，实际耗时可能比生成还长。
 *
 * 即梦支持「模板变量」：提示词里写 〖变量名〗，给变量填一组值，
 * 提交后按顺序逐一出图，每张只替换那个字段、其余复用。
 * 所以只要把「每个角色的完整提示词」整体当作变量值，就能一次出完所有定妆图。
 */
function BatchImageKit({ prompts }: { prompts: ImagePrompt[] }) {
  // 默认展开：这条链路本来就是用来省掉「一个个复制去即梦」的，
  // 折叠起来等于把答案藏了，用户只会继续手动逐个出图
  const [open, setOpen] = useState(true)

  // 母版：整段提示词就是一个变量占位符
  const template = "〖定妆提示词〗"
  // 变量值：一行一个角色的完整提示词
  const values = prompts.map((p) => p.en).join("\n")

  const numbered = prompts
    .map((p, i) => `${i + 1}. ${p.name}\n${p.en}`)
    .join("\n\n")

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-900">
            批量出定妆图 · ${prompts.length} 个角色一次出完
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brand-800/80">
            不用一个个复制粘贴：下面两块各自复制一次，贴进即梦就是一次批量提交。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-[11px]
            font-medium text-brand-800 transition-colors hover:bg-brand-100"
        >
          {open ? "收起步骤" : "怎么做"}
        </button>
      </div>

      <ol className="mt-2.5 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
        <li>
          <span className="font-medium text-slate-700">1.</span> 即梦「创作中心 → 文生图」，
          右上角齿轮里勾选
          <span className="mx-1 rounded bg-amber-100 px-1 font-medium text-amber-800">
            启用批量生成模式
          </span>
          ，保存后
          <span className="font-medium text-slate-700">刷新页面</span>
          （否则「生成数量」滑块不出现）。
        </li>
        <li>
          <span className="font-medium text-slate-700">2.</span> 粘贴下面的
          <span className="font-medium text-slate-700">母版</span>
          ，点提示词框右下角「+ 添加变量」，新建变量
          <code className="mx-1 rounded bg-slate-100 px-1 font-mono">定妆提示词</code>
          。
        </li>
        <li>
          <span className="font-medium text-slate-700">3.</span> 把
          <span className="font-medium text-slate-700">变量值</span>
          整段粘进变量框（${prompts.length} 行，一行一个角色）。
        </li>
        <li>
          <span className="font-medium text-slate-700">4.</span> 确认组合总数 =
          <span className="font-semibold text-brand-800"> ${prompts.length}</span>
          ，提交。即梦会按顺序逐一出图。
        </li>
      </ol>

      <div className="mt-2.5 grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-brand-800">① 复制母版 → 粘进提示词框</span>
            <CopyButton text={template} label="复制母版" />
          </div>
          <code className="break-all font-mono text-[11px] text-slate-700">{template}</code>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-brand-800">
              ② 复制变量值 → 粘进变量框（${prompts.length} 行）
            </span>
            <CopyButton text={values} label="复制变量值" />
          </div>
          <p className="max-h-20 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-500">
            {prompts.map((p) => (
              <span key={p.name} className="block truncate">{p.name}: {p.en.slice(0, 60)}…</span>
            ))}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <CopyButton
          text={numbered}
          label="复制全部提示词（带序号，备用）"
        />
      </div>

      {open && (
        <div className="mt-2 rounded-lg bg-white/80 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
          <p className="font-medium text-slate-700">出图之后</p>
          <p className="mt-1">
            按顺序对应到角色（即梦出的顺序 = 变量值顺序）：第 1 张是
            <span className="font-medium text-slate-800">{prompts[0]?.name}</span>
            {prompts[1] && <>、第 2 张是 <span className="font-medium text-slate-800">{prompts[1].name}</span></>}
            。存文件名建议用角色名，放到以角色名命名的文件夹里，本工具扫描时会自动挂到对应角色上。
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 已挂参考图的预览条。fileUrl 通过 vault 模块按需取回，同样不上传。
 */
function AttachedPreviews({
  keys_, characterName, onRemove,
}: { keys_: string[]; characterName: string; onRemove?: (name: string, key: string) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const made: string[] = []

    ;(async () => {
      const next: Record<string, string> = {}
      for (const key of keys_) {
        const url = await getPreviewUrl(key).catch(() => null)
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) { next[key] = url; made.push(url) }
      }
      if (!cancelled) setUrls(next)
    })()

    return () => {
      cancelled = true
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [keys_])

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {keys_.map((key) => (
        <li key={key} className="relative">
          <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {urls[key] ? (
              <img src={urls[key]} alt={key} title={key} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-slate-400">
                读不到
              </span>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(characterName, key)}
              aria-label={`摘掉 ${key}`}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full
                border border-slate-200 bg-white text-xs text-slate-400 shadow-sm
                transition-colors hover:border-rose-300 hover:text-rose-500"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function VisualAnchorPanel({
  visuals, onChange, imagePrompts, vaultFiles, attached, onAttach, onDetach,
}: Props) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  // 被镜头卡「去挂图」点名的角色：滚动过去并高亮，同时把挂图面板直接展开
  const [highlight, setHighlight] = useState<string | null>(null)

  useEffect(() => {
    const onFocus = (e: Event) => {
      const names = (e as CustomEvent<string[]>).detail ?? []
      const first = names.find((n) => visuals.some((v) => v.name === n))
      if (!first) return
      setHighlight(first)
      setOpenPicker(vaultFiles.length > 0 ? first : null)
      // 等 DOM 更新后再滚，否则目标卡片可能还没渲染
      requestAnimationFrame(() => {
        document.getElementById(`vc-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
      setTimeout(() => setHighlight(null), 2500)
    }
    window.addEventListener("chengju:focus-vc", onFocus)
    return () => window.removeEventListener("chengju:focus-vc", onFocus)
  }, [visuals, vaultFiles.length])

  const update = (id: string, patch: Partial<VisualCharacter>) =>
    onChange(visuals.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  if (visuals.length === 0) return null

  return (
    <div id="visual-anchors" className="min-w-0 space-y-4">
      {/*
        这一步最容易被误解成「又生成了一遍人物」——角色名一样、卡片长得像。
        所以这里先立一块说明：第一步写的是「他是谁」（性格/动机），
        这一步写的是「他长什么样」（脸/发/服装），是同一批角色的第二层，不是新角色。
      */}
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-[11px] font-bold text-white">
          4
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-900">
            这一步不是重新生成人物，是给上面那批角色「上妆」
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800/80">
            下面每一张卡都对应第一步里的同一个人（姓名一致）。第一步写他<span className="font-medium">是谁</span>，
            这里写他<span className="font-medium">长什么样</span>：脸、发型、服装、道具。
            这些字段会被逐镜复用，出图时才不会每张脸都换人。
          </p>
        </div>
      </div>

      {imagePrompts.length > 0 && <BatchImageKit prompts={imagePrompts} />}

      {visuals.map((vc, i) => {
        const prompt = imagePrompts.find((p) => p.name === vc.name)
        const keys = attached[vc.name] ?? []

        return (
          <article
            key={vc.id}
            id={`vc-${vc.name}`}
            className={`min-w-0 rounded-xl border bg-white p-3.5 transition-colors sm:p-4 ${
              highlight === vc.name ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"
            }`}
          >
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <span className="shrink-0 text-xs font-medium text-slate-400">角色 {i + 1}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <AutoTextarea
                  value={vc.name}
                  onChange={(name) => update(vc.id, { name })}
                  ariaLabel={`角色 ${i + 1} 姓名`}
                  placeholder="角色姓名"
                  className="min-w-0 text-base font-semibold text-slate-900"
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
            <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
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
                className="wrap-anywhere min-w-0 font-mono text-xs leading-relaxed text-slate-700"
              />
            </div>

            {/* 定妆图提示词（中英双语，供即梦出图） */}
            {prompt && (
              <div className="mt-2 min-w-0 overflow-hidden rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] font-semibold text-brand-800">定妆图提示词（去即梦出角色图）</span>
                  <CopyButton text={prompt.en} label="复制英文" />
                </div>
                <p className="wrap-anywhere font-mono text-xs leading-relaxed text-slate-700">{prompt.en}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{prompt.zh}</p>

                {/*
                  出图之后要「存成什么文件名」是这条链路最容易崩的地方：
                  从即梦下载下来是「即梦_19700101.png」，攒到几十张就认不出谁是谁。
                  这里直接把建议路径写出来，并在复制提示词时一并带上。
                */}
                <div className="mt-2 rounded-md bg-white/80 px-2 py-1.5">
                  <p className="text-[10px] text-slate-500">
                    出图后建议存为：
                    <code className="ml-1 break-all rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">
                      {vc.name}/正面.png
                    </code>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    放成「角色名/文件名」的目录结构，挂图时会自动排在前面
                  </p>
                </div>

                <div className="mt-1.5">
                  <CopyButton
                    text={`${prompt.en}\n\n— 出图后存为 ${vc.name}/正面.png`}
                    label="复制（含命名提示）"
                  />
                </div>
              </div>
            )}

            {/* 本地角色图：只登记引用，图不上传（原则 P1） */}
            <div className="mt-2 min-w-0 rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
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
                <RefImagePicker
                  files={vaultFiles}
                  characterName={vc.name}
                  onPick={(file) => { onAttach(vc.name, file); setOpenPicker(null) }}
                  onClose={() => setOpenPicker(null)}
                />
              )}

              {/* 已挂的图直接给预览——挂错了要能马上发现 */}
              {keys.length > 0 && <AttachedPreviews keys_={keys} onRemove={onDetach} characterName={vc.name} />}
            </div>
          </article>
        )
      })}
    </div>
  )
}
