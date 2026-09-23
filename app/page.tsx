'use client'

import { useMemo, useRef, useState } from 'react'
import ActList from '@/components/ActList'
import CharacterList from '@/components/CharacterList'
import EpisodeList from '@/components/EpisodeList'
import IdeaPanel from '@/components/IdeaPanel'
import StepIndicator from '@/components/StepIndicator'
import StepSection from '@/components/StepSection'
import { postJson, postSse } from '@/lib/api'
import { buildMarkdown, copyText, downloadMarkdown } from '@/lib/export'
import { STEPS, type Act, type Character, type Episode, type StepKey, type StepStatus } from '@/lib/types'

const IDLE_STATUS: Record<StepKey, StepStatus> = {
  characters: 'idle',
  acts: 'idle',
  episodes: 'idle',
}

const IDLE_ERRORS: Record<StepKey, string | null> = {
  characters: null,
  acts: null,
  episodes: null,
}

export default function Home() {
  // ── 数据（全部存在内存里，没有数据库）──
  const [idea, setIdea] = useState('')
  const [characters, setCharacters] = useState<Character[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])

  // ── 每一步的运行状态 ──
  const [status, setStatus] = useState(IDLE_STATUS)
  const [errors, setErrors] = useState(IDLE_ERRORS)

  // 生成时把当时的「输入指纹」记下来，之后输入一变就知道这份结果已经过期了。
  // 用指纹推导而不是用 flag，避免生成完回写时把用户中途的编辑标记冲掉。
  const [actsBuiltFrom, setActsBuiltFrom] = useState<string | null>(null)
  const [episodesBuiltFrom, setEpisodesBuiltFrom] = useState<string | null>(null)

  // 正在「换一个」的角色 id / 正在补充新角色
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [addingCharacter, setAddingCharacter] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 「清空重来」时 +1。请求返回时若纪元变了，说明结果已经不该要了，直接丢弃
  const resetEpoch = useRef(0)

  // 输入指纹
  const charactersSig = useMemo(() => JSON.stringify(characters), [characters])
  const actsSig = useMemo(() => JSON.stringify(acts), [acts])

  const hasCharacters = characters.length > 0
  const hasActs = acts.length > 0
  const hasEpisodes = episodes.length > 0
  const hasResult = hasCharacters || hasActs || hasEpisodes

  const currentStep = !hasCharacters ? 1 : !hasActs ? 2 : 3

  // 上游改过之后，下游结果就是基于旧版本生成的
  const actsStale = hasActs && actsBuiltFrom !== charactersSig
  const episodesStale = hasEpisodes && episodesBuiltFrom !== `${charactersSig}|${actsSig}`

  const isCleared = (epoch: number) => resetEpoch.current !== epoch

  // ── 通用：跑一个步骤，统一处理 loading / error / 被清空 ──
  async function runStep<T>(step: StepKey, task: () => Promise<T>, onSuccess: (data: T) => void) {
    const epoch = resetEpoch.current
    setStatus((s) => ({ ...s, [step]: 'loading' }))
    setErrors((e) => ({ ...e, [step]: null }))
    try {
      const data = await task()
      if (isCleared(epoch)) return // 生成期间点了「清空重来」，不要把结果塞回去
      onSuccess(data)
      setStatus((s) => ({ ...s, [step]: 'done' }))
    } catch (error) {
      if (isCleared(epoch)) return
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      setErrors((e) => ({ ...e, [step]: message }))
      setStatus((s) => ({ ...s, [step]: 'error' }))
    }
  }

  // ── 第一步：生成人物 ──
  const generateCharacters = () =>
    runStep(
      'characters',
      () => postJson<{ characters: Character[] }>('/api/characters', { idea: idea.trim() }),
      ({ characters: list }) => setCharacters(list),
    )

  /** 只换掉某一个角色 */
  const regenerateCharacter = async (id: string) => {
    const epoch = resetEpoch.current
    setRegeneratingId(id)
    setErrors((e) => ({ ...e, characters: null }))
    try {
      const data = await postJson<{ characters: Character[] }>('/api/characters', {
        idea: idea.trim(),
        mode: 'single',
        existing: characters.filter((c) => c.id !== id),
      })
      if (isCleared(epoch)) return
      const fresh = data.characters[0]
      if (!fresh) throw new Error('AI 没有生成出新的角色，请重试')
      // 复用原来的 id，避免 React 重建整张卡片、丢掉正在编辑的焦点
      setCharacters((list) => list.map((c) => (c.id === id ? { ...fresh, id } : c)))
    } catch (error) {
      if (isCleared(epoch)) return
      setErrors((e) => ({ ...e, characters: error instanceof Error ? error.message : '生成失败' }))
    } finally {
      setRegeneratingId(null)
    }
  }

  /** 往现有阵容里再加一个角色（上限 5 个） */
  const addCharacter = async () => {
    const epoch = resetEpoch.current
    setAddingCharacter(true)
    setErrors((e) => ({ ...e, characters: null }))
    try {
      const data = await postJson<{ characters: Character[] }>('/api/characters', {
        idea: idea.trim(),
        mode: 'single',
        existing: characters,
      })
      if (isCleared(epoch)) return
      const fresh = data.characters[0]
      if (!fresh) throw new Error('AI 没有生成出新的角色，请重试')
      setCharacters((list) => [...list, fresh])
    } catch (error) {
      if (isCleared(epoch)) return
      setErrors((e) => ({ ...e, characters: error instanceof Error ? error.message : '生成失败' }))
    } finally {
      setAddingCharacter(false)
    }
  }

  // ── 第二步：生成三幕大纲 ──
  const generateActs = () =>
    runStep(
      'acts',
      () => postJson<{ acts: Act[] }>('/api/acts', { idea: idea.trim(), characters }),
      ({ acts: list }) => {
        setActs(list)
        setActsBuiltFrom(charactersSig) // 记下这批大纲是基于哪一版人物生成的
      },
    )

  // ── 第三步：生成分集（流式，一集一集出现）──
  // 这里不复用 runStep：它的 task 只在全部完成时返回一次结果，
  // 而流式需要在接收过程中就反复更新界面。
  const generateEpisodes = async () => {
    const epoch = resetEpoch.current
    const builtFrom = `${charactersSig}|${actsSig}`

    setStatus((s) => ({ ...s, episodes: 'streaming' }))
    setErrors((e) => ({ ...e, episodes: null }))
    // 先清空，重新生成时才看得出是一集集新出现的，而不是新旧混在一起
    setEpisodes([])

    let finished = false
    try {
      await postSse('/api/episodes', { idea: idea.trim(), characters, acts }, (event, data) => {
        if (isCleared(epoch)) return
        if (event !== 'episodes' && event !== 'done') return

        setEpisodes((data as { episodes: Episode[] }).episodes)
        // 拿到的这一份就是基于当前上游生成的，标记一下，免得触发「已过期」提示
        setEpisodesBuiltFrom(builtFrom)

        if (event === 'done') {
          finished = true
          setStatus((s) => ({ ...s, episodes: 'done' }))
        }
      })

      // 连接断了却没收到 done：不能把界面永远停在「生成中…」
      if (!finished) throw new Error('生成中断，请重试')
    } catch (error) {
      if (isCleared(epoch)) return
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      setErrors((e) => ({ ...e, episodes: message }))
      setStatus((s) => ({ ...s, episodes: 'error' }))
    }
  }

  // ── 导出 ──
  const markdown = () => buildMarkdown({ idea: idea.trim(), characters, acts, episodes })

  const handleCopyAll = async () => {
    const done = await copyText(markdown())
    setCopied(done)
    // 清掉上一个计时器，否则连点两次会提前把「已复制」收回去
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (done) copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadMarkdown(`成剧-大纲-${stamp}.md`, markdown())
  }

  const handleReset = () => {
    resetEpoch.current += 1 // 作废所有还在路上的请求
    setCharacters([])
    setActs([])
    setEpisodes([])
    setStatus(IDLE_STATUS)
    setErrors(IDLE_ERRORS)
    setActsBuiltFrom(null)
    setEpisodesBuiltFrom(null)
  }

  // 过期提示条
  const staleNotice = (text: string) => (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
      <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">
        <path
          fillRule="evenodd"
          d="M8.5 2.5a1.75 1.75 0 0 1 3 0l6.2 11a1.75 1.75 0 0 1-1.5 2.6H3.8a1.75 1.75 0 0 1-1.5-2.6l6.2-11ZM10 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 7Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-xs leading-relaxed text-amber-800">{text}</p>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* 顶部标题 */}
      <header className="px-4 pb-6 pt-10 text-center sm:pt-14">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          成剧
        </h1>
        <p className="mt-2 text-sm text-slate-500 sm:text-base">
          一句话成剧 · 输入一个想法，三步生成完整短剧大纲
        </p>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
          {/* 左：输入区（桌面端吸附） */}
          <div className="lg:sticky lg:top-8">
            <IdeaPanel
              idea={idea}
              onIdeaChange={setIdea}
              onGenerate={generateCharacters}
              onReset={handleReset}
              loading={status.characters === 'loading'}
              hasResult={hasResult}
            />
          </div>

          {/* 右：步骤条 + 三步内容 */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 backdrop-blur-sm">
              <StepIndicator
                current={currentStep}
                completed={{ characters: hasCharacters, acts: hasActs, episodes: hasEpisodes }}
              />
            </div>

            {/* 第一步：人物 */}
            <StepSection
              index={1}
              title={STEPS[0].title}
              subtitle={STEPS[0].subtitle}
              status={status.characters}
              error={errors.characters}
              hasContent={hasCharacters}
              locked={false}
              lockedHint="在左侧输入故事想法，然后点「生成人物」"
              actionLabel="生成人物"
              onGenerate={generateCharacters}
              skeletonVariant="characters"
              extraAction={
                characters.length < 5 ? (
                  <button
                    type="button"
                    onClick={addCharacter}
                    disabled={addingCharacter || status.characters === 'loading'}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600
                      transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300
                      disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addingCharacter ? '添加中…' : '+ 添加角色'}
                  </button>
                ) : null
              }
            >
              <CharacterList
                characters={characters}
                onChange={setCharacters}
                onRegenerate={regenerateCharacter}
                regeneratingId={regeneratingId}
              />
            </StepSection>

            {/* 第二步：三幕大纲 */}
            <StepSection
              index={2}
              title={STEPS[1].title}
              subtitle={STEPS[1].subtitle}
              status={status.acts}
              error={errors.acts}
              hasContent={hasActs}
              locked={!hasCharacters}
              lockedHint="请先生成核心人物，三幕大纲会基于人物展开"
              actionLabel="三幕大纲"
              onGenerate={generateActs}
              skeletonVariant="acts"
            >
              {actsStale && staleNotice('人物设定已改动，当前三幕大纲是基于旧人物生成的，建议重新生成一次。')}
              <ActList acts={acts} onChange={setActs} />
            </StepSection>

            {/* 第三步：分集剧情 */}
            <StepSection
              index={3}
              title={STEPS[2].title}
              subtitle={STEPS[2].subtitle}
              status={status.episodes}
              error={errors.episodes}
              hasContent={hasEpisodes}
              locked={!hasActs}
              lockedHint="请先生成三幕大纲，分集剧情会基于大纲拆分"
              actionLabel="分集"
              onGenerate={generateEpisodes}
              skeletonVariant="episodes"
            >
              {episodesStale && staleNotice('上游内容已改动，当前分集是基于旧版本生成的，建议重新生成一次。')}
              <EpisodeList episodes={episodes} onChange={setEpisodes} />
            </StepSection>

            {/* 底部导出 */}
            {hasResult && (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  已生成 {characters.length} 个角色 · {acts.length} 幕 · {episodes.length} 集
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAll}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white
                      transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-slate-400 sm:flex-none"
                  >
                    {copied ? '已复制 ✓' : '复制全部大纲'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700
                      transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-slate-300 sm:flex-none"
                  >
                    导出 .md
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
