'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  deleteVoiceProfile,
  fetchAudioState,
  fetchVoiceProfiles,
  generateShotTts,
  generateShotTtsBatch,
  saveVoiceProfile,
} from '@/lib/audio/client'
import type {
  ProjectVoiceCharacter,
  SystemVoice,
  VoiceProfile,
} from '@/lib/audio/types'
import { countSpeechCharacters } from '@/lib/audio/text'
import type { GenerationTask } from '@/lib/generation/types'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  characters: ProjectVoiceCharacter[]
  speakerNames: string[]
  dialogueShots: Array<{ shotId: string; speaker: string; dialogue: string }>
  episode: number | null
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 10h2l1.5-4 2.5 8 2.2-6 1.8 4H17" />
    </svg>
  )
}

function costLabel(micros: number): string {
  if (micros <= 0) return '0.00'
  if (micros < 10_000) return (micros / 1_000_000).toFixed(4)
  return (micros / 1_000_000).toFixed(2)
}

export default function VoiceProfilePanel({
  projectId,
  onEnsureProject,
  characters,
  speakerNames,
  dialogueShots,
  episode,
}: Props) {
  const [voices, setVoices] = useState<SystemVoice[]>([])
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [audioTasks, setAudioTasks] = useState<GenerationTask[]>([])
  const [tts, setTts] = useState<{
    enabled: boolean
    model: string
    pricePer1kCharsMicros: number | null
    reason: string | null
  }>({ enabled: false, model: '', pricePer1kCharsMicros: null, reason: null })
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(projectId)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [batching, setBatching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const currentProjectId = projectId ?? resolvedProjectId
  const speaking = useMemo(() => new Set(speakerNames), [speakerNames])
  const profileByCharacter = useMemo(
    () => new Map(profiles.map((profile) => [profile.characterEntityId, profile])),
    [profiles],
  )
  const orderedCharacters = useMemo(
    () => [...characters].sort((left, right) => {
      const speakingOrder = Number(speaking.has(right.name)) - Number(speaking.has(left.name))
      return speakingOrder || left.name.localeCompare(right.name, 'zh-CN')
    }),
    [characters, speaking],
  )
  const batchLines = useMemo(
    () => dialogueShots.filter((shot) => {
      if (!shot.dialogue.trim() || !shot.speaker.trim()) return false
      const character = characters.find((item) => item.name === shot.speaker)
      return Boolean(character && profileByCharacter.get(character.id))
    }),
    [characters, dialogueShots, profileByCharacter],
  )
  const batchCharacters = batchLines.reduce(
    (sum, line) => sum + countSpeechCharacters(line.dialogue),
    0,
  )
  const batchEstimatedCost = tts.pricePer1kCharsMicros
    ? Math.ceil(batchCharacters / 1000 * tts.pricePer1kCharsMicros)
    : 0

  useEffect(() => {
    setResolvedProjectId(projectId)
  }, [projectId])

  useEffect(() => {
    if (!currentProjectId) {
      setVoices([])
      setProfiles([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    // 目录与已绑定项都以服务端为准，避免旧页面把已下架音色继续显示为可选。
    Promise.all([
      fetchVoiceProfiles(currentProjectId),
      // 音频任务从服务端恢复，组件卸载或切换菜单不会丢失已完成结果。
      fetchAudioState(currentProjectId).catch(() => ({
        tasks: [],
        assets: [],
        batches: [],
      })),
    ])
      .then(([state, audioState]) => {
        if (!active) return
        setVoices(state.voices)
        setProfiles(state.profiles)
        setTts(state.tts)
        setAudioTasks(audioState.tasks)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : '音色配置读取失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [currentProjectId])

  async function ensureProject(): Promise<string | null> {
    const pid = currentProjectId ?? await onEnsureProject()
    if (!pid) {
      setError('项目还没有保存成功，请重试')
      return null
    }
    setResolvedProjectId(pid)
    return pid
  }

  async function changeVoice(characterId: string, voiceId: string) {
    if (savingId) return
    const pid = await ensureProject()
    if (!pid) return
    setSavingId(characterId)
    setError(null)
    try {
      // 清空选择等价于解除绑定；正常选择则直接保存为项目级当前音色。
      if (!voiceId) {
        await deleteVoiceProfile(pid, characterId)
        setProfiles((current) =>
          current.filter((profile) => profile.characterEntityId !== characterId)
        )
        return
      }
      const existing = profileByCharacter.get(characterId)
      const result = await saveVoiceProfile({
        projectId: pid,
        characterId,
        voiceId,
        speed: existing?.speed ?? 1,
        volume: existing?.volume ?? 1,
      })
      setProfiles((current) => [
        result.profile,
        ...current.filter((profile) => profile.characterEntityId !== characterId),
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '音色绑定保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function generateDialogue(character: ProjectVoiceCharacter) {
    if (!tts.enabled || !tts.pricePer1kCharsMicros || generatingId) return
    const profile = profileByCharacter.get(character.id)
    if (!profile) return
    const pid = await ensureProject()
    if (!pid) return
    const lines = dialogueShots.filter((shot) =>
      shot.speaker === character.name && shot.dialogue.trim()
    )
    if (lines.length === 0) return
    setGeneratingId(character.id)
    setError(null)
    setNotice(null)
    let completed = 0
    try {
      // 逐句提交，前面的句子成功后即使后续失败，也能明确报告已完成数量。
      for (const line of lines) {
        const characters = countSpeechCharacters(line.dialogue)
        const budget = Math.max(1, Math.ceil(
          characters / 1000 * tts.pricePer1kCharsMicros,
        ))
        const generated = await generateShotTts({
          projectId: pid,
          shotId: line.shotId,
          maxBudgetMicros: budget,
        })
        setAudioTasks((current) => [
          generated.task,
          ...current.filter((task) => task.id !== generated.task.id),
        ])
        completed += 1
      }
      setNotice(`已为${character.name}生成 ${completed} 句对白。`)
    } catch (cause) {
      setError(
        `${completed > 0 ? `已完成 ${completed} 句；` : ''}${
          cause instanceof Error ? cause.message : '对白生成失败'
        }`,
      )
    } finally {
      setGeneratingId(null)
    }
  }

  async function generateEpisodeBatch() {
    if (
      batching
      || generatingId
      || episode === null
      || !tts.enabled
      || batchLines.length === 0
    ) return
    const pid = await ensureProject()
    if (!pid) return
    setBatching(true)
    setError(null)
    setNotice(null)
    try {
      // 批量入口一次确认整集预算；单项失败由服务端返回并保留其他成功结果。
      const result = await generateShotTtsBatch({
        projectId: pid,
        episode,
        maxBudgetMicros: Math.max(1, batchEstimatedCost),
        idempotencyKey: crypto.randomUUID(),
      })
      setAudioTasks((current) => {
        const merged = new Map(current.map((task) => [task.id, task]))
        for (const task of result.tasks) merged.set(task.id, task)
        return [...merged.values()]
      })
      setNotice(
        `已生成 ${result.tasks.length} 句对白${
          result.blocked.length + result.failures.length > 0
            ? `，${result.blocked.length + result.failures.length} 句未生成`
            : ''
        }。`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量对白生成失败')
    } finally {
      setBatching(false)
    }
  }

  if (characters.length === 0) return null

  return (
    <section className="voice-profile-panel" aria-label="角色音色">
      <header className="voice-profile-head">
        <div className="voice-profile-heading">
          <span className="voice-profile-mark"><WaveIcon /></span>
          <div className="min-w-0">
            <div className="voice-profile-title">
              <h3>角色音色</h3>
              <span>{profiles.length}/{characters.length} 已绑定</span>
            </div>
            <p>系统音色只用于当前项目对白；不支持声音克隆、声音样本上传或声音复刻。</p>
          </div>
        </div>
        <div className="voice-profile-policy">
          <span>系统预置</span>
          <span>按角色绑定</span>
          <span>项目隔离</span>
          <span className={tts.enabled ? 'is-enabled' : ''}>
            {tts.enabled ? tts.model : 'TTS 未启用'}
          </span>
        </div>
      </header>

      <div className="voice-profile-list">
        {orderedCharacters.map((character) => {
          const profile = profileByCharacter.get(character.id)
          const isSpeaking = speaking.has(character.name)
          const dialogueLines = dialogueShots.filter((shot) =>
            shot.speaker === character.name && shot.dialogue.trim()
          )
          const dialogueCharacters = dialogueLines.reduce(
            (sum, line) => sum + countSpeechCharacters(line.dialogue),
            0,
          )
          const estimatedCost = tts.pricePer1kCharsMicros
            ? Math.ceil(dialogueCharacters / 1000 * tts.pricePer1kCharsMicros)
            : 0
          const generatedCount = dialogueLines.filter((line) =>
            audioTasks.some((task) =>
              task.targetId === line.shotId && task.status === 'succeeded'
            )
          ).length
          return (
            <div key={character.id} className="voice-profile-row">
              <div className="voice-profile-character">
                <b>{character.name}</b>
                <span className={isSpeaking ? 'is-speaking' : ''}>
                  {isSpeaking ? '本集有声' : '本集无对白'}
                </span>
              </div>
              <label className="voice-profile-select">
                <span>系统音色</span>
                <select
                  aria-label={`${character.name}的系统音色`}
                  value={profile?.voiceId ?? ''}
                  disabled={loading || savingId === character.id}
                  title={voices.find((voice) => voice.id === profile?.voiceId)?.description}
                  onChange={(event) => void changeVoice(character.id, event.target.value)}
                >
                  <option value="">未绑定</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id} title={voice.description}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={`voice-profile-state ${profile ? 'is-bound' : ''}`}>
                <span>
                  {savingId === character.id
                    ? '保存中…'
                    : profile
                      ? `已绑定 · ${profile.label}`
                      : '未绑定'}
                  {generatedCount > 0 ? ` · 已生成 ${generatedCount}/${dialogueLines.length}` : ''}
                </span>
                {isSpeaking && (
                  <button
                    type="button"
                    disabled={!profile || !tts.enabled || generatingId !== null}
                    title={tts.reason ?? undefined}
                    onClick={() => void generateDialogue(character)}
                  >
                    {generatingId === character.id
                      ? '生成中…'
                      : `生成 ${dialogueLines.length} 句 · ¥${costLabel(estimatedCost)}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="voice-profile-batch">
        <div>
          <b>本集对白</b>
          <span>
            {episode === null
              ? '先选择单集'
              : `${batchLines.length} 句可生成 · ${batchCharacters} 字符 · ¥${costLabel(batchEstimatedCost)}`}
          </span>
        </div>
        <button
          type="button"
          disabled={
            batching
            || generatingId !== null
            || episode === null
            || !tts.enabled
            || batchLines.length === 0
          }
          title={tts.reason ?? undefined}
          onClick={() => void generateEpisodeBatch()}
        >
          {batching ? '批量生成中…' : `生成本集 ${batchLines.length} 句`}
        </button>
      </div>
      {loading && <p className="voice-profile-loading">正在读取系统音色…</p>}
      {tts.reason && <p className="voice-profile-loading">{tts.reason}</p>}
      {notice && <p className="voice-profile-notice" role="status">{notice}</p>}
      {error && <p className="voice-profile-error" role="alert">{error}</p>}
    </section>
  )
}
