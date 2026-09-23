'use client'

/** 几个示例想法，降低「不知道写什么」的启动成本 */
const SAMPLES = [
  '一个快递员意外继承了百万遗产',
  '外卖小哥发现自己是首富失散的儿子',
  '保洁阿姨其实是隐退的商业女王',
  '被退婚的赘婿三年后带资归来',
]

interface Props {
  idea: string
  onIdeaChange: (value: string) => void
  onGenerate: () => void
  onReset: () => void
  loading: boolean
  /** 是否已经有任意结果，决定「重新开始」按钮是否可用 */
  hasResult: boolean
}

export default function IdeaPanel({ idea, onIdeaChange, onGenerate, onReset, loading, hasResult }: Props) {
  const canGenerate = idea.trim().length >= 4 && !loading

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <label htmlFor="idea" className="mb-2 block text-sm font-semibold text-slate-900">
        一句话故事想法
      </label>
      <textarea
        id="idea"
        value={idea}
        onChange={(e) => onIdeaChange(e.target.value)}
        rows={4}
        maxLength={500}
        placeholder="例如：一个快递员意外继承了百万遗产"
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm leading-relaxed
          text-slate-800 placeholder:text-slate-400
          focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <div className="mt-1.5 text-right text-xs text-slate-500">{idea.length} / 500</div>

      {/* 示例想法 */}
      <div className="mt-3">
        <p className="mb-2 text-xs font-medium text-slate-500">没灵感？试试这些</p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => onIdeaChange(sample)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600
                transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="mt-5 w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white
          transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-300
          disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {loading ? '正在生成人物…' : '生成人物'}
      </button>

      {hasResult && (
        <button
          type="button"
          onClick={onReset}
          disabled={loading}
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600
            transition-colors hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
        >
          清空重来
        </button>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        三步工作流：先定人物，再搭三幕结构，最后拆成 10 集。每一步都可以手动修改，改完再进入下一步。
      </p>
    </div>
  )
}
