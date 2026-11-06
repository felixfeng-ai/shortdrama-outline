'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { GeneratedAsset } from '@/lib/generation/types'
import type { TimelineClip, TimelineDraft, TimelinePayload, TimelineVersion } from '@/lib/timeline/types'
import { fetchBgmTracks, uploadBgmTrack } from '@/lib/audio/bgm-client'
import type { BgmTrack } from '@/lib/audio/bgm-types'
import { fetchAudioState } from '@/lib/audio/client'
import type { TimelineDialogueLine, VideoRenderDto } from '@/lib/video/render-types'
import {
  enqueueFrozenEpisodeQueue,
  enqueueVideoRender,
  fetchVideoRenders,
} from '@/lib/video/render-client'
import { RENDER_UNITS } from '@/lib/model-pricing'
import {
  inspectTimelineDialogue,
  type TimelineShotInput,
} from '@/lib/video/render-plan'
import {
  fetchTimeline,
  freezeTimelineVersion,
  initializeTimeline,
  saveTimelineDraft,
} from '@/lib/timeline/client'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  episodes: number[]
  preferredEpisode: number | null
  videos: GeneratedAsset[]
  shots: TimelineShotInput[]
}

function episodeLabel(episode: number): string {
  return episode === 0 ? '未标注镜头' : `第 ${episode} 集`
}

function durationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function clipStatus(clip: TimelineClip): string {
  if (clip.status === 'missing-video') return '缺视频'
  if (clip.status === 'missing-duration') return '缺时长'
  if (clip.status === 'duration-mismatch') return '时长不一致'
  return '可渲染'
}

function secondsText(milliseconds: number): string {
  return (Math.max(0, milliseconds) / 1000).toFixed(1)
}

function videoCandidatesFor(clip: TimelineClip, videos: GeneratedAsset[]): GeneratedAsset[] {
  return videos
    .filter((video) =>
      (video.mediaKind ?? 'image') === 'video'
      && video.targetType === 'shot'
      && video.targetId === clip.shotId
    )
    .sort((left, right) => {
      if (left.id === clip.sourceAssetId) return -1
      if (right.id === clip.sourceAssetId) return 1
      return right.createdAt - left.createdAt
    })
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={direction === 'up' ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} />
    </svg>
  )
}

function MutedIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6.5h2.3L8 4v8L5.3 9.5H3z" />
      {muted
        ? <path d="m10.3 6.2 3.4 3.6M13.7 6.2l-3.4 3.6" />
        : <path d="M10.4 6.1a3 3 0 0 1 0 3.8M12.2 4.8a5 5 0 0 1 0 6.4" />}
    </svg>
  )
}

function AdjustIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 5h10M3 11h10" />
      <circle cx="6" cy="5" r="1.7" />
      <circle cx="10.5" cy="11" r="1.7" />
    </svg>
  )
}

function DialoguePreview({ line }: { line: TimelineDialogueLine }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  async function replay() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      // 浏览器拒绝自动播放时保留原生 controls，让用户自己点播放即可。
    }
  }

  if (line.muted) {
    return <span className="episode-timeline-dialogue-state">这一镜已静音，不播放对白</span>
  }
  if (!line.previewUrl) {
    return <span className="episode-timeline-dialogue-state is-blocked">缺当前台词的对白音频</span>
  }
  return (
    <div className="episode-timeline-dialogue-preview">
      <span>
        对白 · {line.speaker || '未标注说话人'} · {secondsText(line.durationMs ?? 0)}s
      </span>
      <audio
        ref={audioRef}
        controls
        preload="none"
        src={line.previewUrl}
        aria-label={`第 ${line.shotNumber} 镜对白试听`}
      />
      <button type="button" onClick={() => void replay()}>
        从头重放
      </button>
    </div>
  )
}

function TimelineClipEditor({
  clip,
  candidates,
  dialogue,
  working,
  onTrim,
  onReplace,
}: {
  clip: TimelineClip
  candidates: GeneratedAsset[]
  dialogue: TimelineDialogueLine | undefined
  working: boolean
  onTrim: (inMs: number, outMs: number) => void
  onReplace: (asset: GeneratedAsset) => void
}) {
  const [inSeconds, setInSeconds] = useState(secondsText(clip.inMs))
  const [outSeconds, setOutSeconds] = useState(secondsText(clip.outMs))

  useEffect(() => {
    setInSeconds(secondsText(clip.inMs))
    setOutSeconds(secondsText(clip.outMs))
  }, [clip.id, clip.inMs, clip.outMs, clip.sourceAssetId])

  const inMs = Math.round(Number(inSeconds) * 1000)
  const outMs = Math.round(Number(outSeconds) * 1000)
  const sourceDurationMs = clip.sourceDurationMs ?? 0
  const validTrim = clip.sourceAssetId !== null
    && Number.isFinite(inMs)
    && Number.isFinite(outMs)
    && inMs >= 0
    && outMs <= sourceDurationMs
    && outMs - inMs >= 500

  return (
    <div className="episode-timeline-editor">
      <div className="episode-timeline-trim">
        <span>裁剪范围</span>
        <label>
          <span>入点</span>
          <input
            type="number"
            min="0"
            max={secondsText(sourceDurationMs)}
            step="0.1"
            value={inSeconds}
            disabled={working || !clip.sourceAssetId}
            onChange={(event) => setInSeconds(event.target.value)}
          />
          <em>秒</em>
        </label>
        <label>
          <span>出点</span>
          <input
            type="number"
            min="0.5"
            max={secondsText(sourceDurationMs)}
            step="0.1"
            value={outSeconds}
            disabled={working || !clip.sourceAssetId}
            onChange={(event) => setOutSeconds(event.target.value)}
          />
          <em>秒</em>
        </label>
        <button
          type="button"
          disabled={working || !validTrim}
          onClick={() => onTrim(inMs, outMs)}
        >
          应用裁剪
        </button>
      </div>
      <label className="episode-timeline-replace">
        <span>替换素材</span>
        <select
          value={clip.sourceAssetId ?? ''}
          disabled={working || candidates.length === 0}
          onChange={(event) => {
            const asset = candidates.find((candidate) => candidate.id === event.target.value)
            if (asset) onReplace(asset)
          }}
        >
          {candidates.length === 0 && <option value="">没有可替换的视频</option>}
          {candidates.map((candidate, index) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.id === clip.sourceAssetId ? '当前 · ' : ''}
              视频 {index + 1} · {candidate.durationMs ? `${(candidate.durationMs / 1000).toFixed(1)}s` : '时长未知'}
            </option>
          ))}
        </select>
      </label>
      {dialogue && (
        <div className={`episode-timeline-dialogue ${dialogue.overflow ? 'is-overflow' : ''}`}>
          <b>{dialogue.overflow ? '对白超出镜头时长' : '本镜对白'}</b>
          <p>{dialogue.speaker ? `${dialogue.speaker}：` : ''}{dialogue.dialogue}</p>
          <DialoguePreview line={dialogue} />
        </div>
      )}
    </div>
  )
}

export default function EpisodeTimelinePanel({
  projectId,
  onEnsureProject,
  episodes,
  preferredEpisode,
  videos,
  shots,
}: Props) {
  const options = useMemo(
    () => [...new Set(episodes)].sort((left, right) => left - right),
    [episodes],
  )
  const [episode, setEpisode] = useState(options[0] ?? 0)
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(projectId)
  const [draft, setDraft] = useState<TimelineDraft | null>(null)
  const [versions, setVersions] = useState<TimelineVersion[]>([])
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([])
  const [bgmAssetId, setBgmAssetId] = useState('')
  const [bgmVolume, setBgmVolume] = useState(0.2)
  const [bgmFile, setBgmFile] = useState<File | null>(null)
  const [bgmLicensed, setBgmLicensed] = useState(false)
  const [uploadingBgm, setUploadingBgm] = useState(false)
  const [audioTasks, setAudioTasks] = useState<Awaited<ReturnType<typeof fetchAudioState>>['tasks']>([])
  const [audioAssets, setAudioAssets] = useState<Awaited<ReturnType<typeof fetchAudioState>>['assets']>([])
  const [renders, setRenders] = useState<VideoRenderDto[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [enqueueingRender, setEnqueueingRender] = useState(false)
  const [queueingAllEpisodes, setQueueingAllEpisodes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingClipId, setEditingClipId] = useState<string | null>(null)
  const currentProjectId = projectId ?? resolvedProjectId

  useEffect(() => {
    setResolvedProjectId(projectId)
  }, [projectId])

  useEffect(() => {
    if (preferredEpisode !== null) setEpisode(preferredEpisode)
  }, [preferredEpisode])

  useEffect(() => {
    if (options.length === 0) {
      setEpisode(0)
      return
    }
    if (!options.includes(episode)) setEpisode(options[0])
  }, [episode, options])

  const load = useCallback(async (targetEpisode = episode, projectOverride?: string) => {
    const targetProjectId = projectOverride ?? currentProjectId
    if (!targetProjectId) {
      setDraft(null)
      setVersions([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [state, tracks, audioState, renderState] = await Promise.all([
        fetchTimeline(targetProjectId, targetEpisode),
        fetchBgmTracks(targetProjectId).catch(() => []),
        fetchAudioState(targetProjectId).catch(() => ({
          tasks: [],
          assets: [],
          batches: [],
        })),
        fetchVideoRenders(targetProjectId, targetEpisode).catch(() => []),
      ])
      setDraft(state.draft)
      setVersions(state.versions)
      setBgmTracks(tracks)
      setAudioTasks(audioState.tasks)
      setAudioAssets(audioState.assets)
      setRenders(renderState)
      setSelectedVersionId((current) =>
        state.versions.some((version) => version.id === current)
          ? current
          : state.versions[0]?.id ?? ''
      )
      setBgmAssetId(state.draft?.payload.audio.bgmAssetId ?? '')
      setBgmVolume(state.draft?.payload.audio.bgmVolume ?? 0.2)
    } catch (cause) {
      setDraft(null)
      setVersions([])
      setError(cause instanceof Error ? cause.message : '时间线读取失败')
    } finally {
      setLoading(false)
    }
  }, [currentProjectId, episode])

  useEffect(() => {
    setNotice(null)
    void load(episode)
  }, [episode, load])

  useEffect(() => {
    if (
      !currentProjectId
      || !renders.some((render) => render.status === 'queued' || render.status === 'running')
    ) return
    // 队列状态由服务端持久化；这里只轮询当前集，切换菜单后回来仍能恢复。
    const timer = window.setTimeout(() => {
      void fetchVideoRenders(currentProjectId, episode)
        .then(setRenders)
        .catch(() => {})
    }, 2_500)
    return () => window.clearTimeout(timer)
  }, [currentProjectId, episode, renders])

  async function initialize() {
    if (working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const pid = currentProjectId ?? await onEnsureProject()
      if (!pid) throw new Error('项目还没有保存成功，请重试')
      setResolvedProjectId(pid)
      const result = await initializeTimeline(pid, episode)
      setDraft(result.draft)
      setVersions([])
      setNotice(result.created ? '已按当前采用视频生成时间线草稿。' : '已恢复现有时间线草稿。')
      await load(episode, pid)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '时间线生成失败')
    } finally {
      setWorking(false)
    }
  }

  async function freeze() {
    if (!currentProjectId || !draft || working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const result = await freezeTimelineVersion({
        projectId: currentProjectId,
        episode,
        expectedRevision: draft.revision,
      })
      setVersions((current) => [
        result.version,
        ...current.filter((version) => version.id !== result.version.id),
      ])
      setSelectedVersionId(result.version.id)
      setNotice(`已固化 v${result.version.revision}，后续草稿修改不会改写此版本。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '时间线版本固化失败')
    } finally {
      setWorking(false)
    }
  }

  async function saveClips(nextClips: TimelineClip[], message: string) {
    if (!currentProjectId || !draft || working) return
    const payload: TimelinePayload = { ...draft.payload, clips: nextClips }
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      // 每次编辑都携带打开时的 revision；服务端拒绝覆盖其他页面已保存的草稿。
      const result = await saveTimelineDraft({
        projectId: currentProjectId,
        episode,
        expectedRevision: draft.revision,
        payload,
      })
      setDraft(result.draft)
      setNotice(message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '时间线草稿保存失败')
    } finally {
      setWorking(false)
    }
  }

  function moveClip(index: number, direction: -1 | 1) {
    if (!draft) return
    const target = index + direction
    if (target < 0 || target >= draft.payload.clips.length) return
    const clips = [...draft.payload.clips]
    const current = clips[index]
    clips[index] = clips[target]
    clips[target] = current
    void saveClips(clips, `已调整镜头顺序，草稿 v${draft.revision + 1}。`)
  }

  function toggleMute(index: number) {
    if (!draft) return
    const clips = draft.payload.clips.map((clip, clipIndex) =>
      clipIndex === index ? { ...clip, muted: !clip.muted } : clip
    )
    void saveClips(clips, `已更新镜头静音状态，草稿 v${draft.revision + 1}。`)
  }

  async function saveBgm() {
    if (!currentProjectId || !draft || working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const result = await saveTimelineDraft({
        projectId: currentProjectId,
        episode,
        expectedRevision: draft.revision,
        payload: {
          ...draft.payload,
          audio: {
            ...draft.payload.audio,
            bgmAssetId: bgmAssetId || null,
            bgmVolume,
          },
        },
      })
      setDraft(result.draft)
      setNotice('已更新本集配乐和音量。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '配乐保存失败')
    } finally {
      setWorking(false)
    }
  }

  async function uploadBgm() {
    if (!currentProjectId || !bgmFile || !bgmLicensed || uploadingBgm) return
    setUploadingBgm(true)
    setError(null)
    try {
      const track = await uploadBgmTrack({
        projectId: currentProjectId,
        file: bgmFile,
        licenseConfirmed: true,
      })
      setBgmTracks((current) => [track, ...current])
      setBgmAssetId(track.id)
      setBgmFile(null)
      setNotice('BGM 已上传，点击“应用配乐”保存到本集。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'BGM 上传失败')
    } finally {
      setUploadingBgm(false)
    }
  }

  function trimClip(index: number, inMs: number, outMs: number) {
    if (!draft) return
    const clips = draft.payload.clips.map((clip, clipIndex) =>
      clipIndex === index ? { ...clip, inMs, outMs } : clip
    )
    void saveClips(clips, `已裁剪第 ${draft.payload.clips[index].shotNumber} 镜，草稿 v${draft.revision + 1}。`)
  }

  function replaceClip(index: number, asset: GeneratedAsset) {
    if (!draft) return
    const sourceDurationMs = asset.durationMs && asset.durationMs > 0
      ? Math.round(asset.durationMs)
      : 0
    const clips = draft.payload.clips.map((clip, clipIndex) =>
      clipIndex === index
        ? {
            ...clip,
            sourceAssetId: asset.id,
            sourceDurationMs,
            durationMs: sourceDurationMs || clip.expectedDurationMs,
            inMs: 0,
            outMs: sourceDurationMs || clip.expectedDurationMs,
          }
        : clip
    )
    void saveClips(clips, `已替换第 ${draft.payload.clips[index].shotNumber} 镜素材，草稿 v${draft.revision + 1}。`)
  }

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [selectedVersionId, versions],
  )
  const timelineForInspection = selectedVersion?.payload ?? draft?.payload ?? null
  const dialogueInspection = useMemo(
    () => timelineForInspection
      ? inspectTimelineDialogue({
          timeline: timelineForInspection,
          shots,
          tasks: audioTasks,
          assets: audioAssets,
        })
      : { lines: [], issues: [] },
    [audioAssets, audioTasks, shots, timelineForInspection],
  )
  const dialogueByClip = useMemo(
    () => new Map(dialogueInspection.lines.map((line) => [line.clipId, line])),
    [dialogueInspection.lines],
  )
  const overflowCount = dialogueInspection.issues
    .filter((issue) => issue.code === 'dialogue-overflow').length

  async function enqueueRender() {
    if (!currentProjectId || !selectedVersion || enqueueingRender) return
    setEnqueueingRender(true)
    setError(null)
    setNotice(null)
    try {
      const result = await enqueueVideoRender({
        projectId: currentProjectId,
        episode,
        timelineVersionId: selectedVersion.id,
      })
      setRenders((current) => [
        result.render,
        ...current.filter((render) => render.id !== result.render.id),
      ])
      setNotice(`${episodeLabel(episode)}已加入渲染队列，单实例会按创建顺序逐集执行。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加入渲染队列失败')
    } finally {
      setEnqueueingRender(false)
    }
  }

  async function enqueueAllFrozenEpisodes() {
    if (!currentProjectId || queueingAllEpisodes) return
    setQueueingAllEpisodes(true)
    setError(null)
    setNotice(null)
    try {
      const result = await enqueueFrozenEpisodeQueue({
        projectId: currentProjectId,
        episodes: options,
      })
      setRenders((current) => {
        const merged = new Map(current.map((render) => [render.id, render]))
        for (const render of result.renders) merged.set(render.id, render)
        return [...merged.values()]
      })
      setNotice(
        `已排队 ${result.renders.length} 集${
          result.blocked.length > 0
            ? `，${result.blocked.length} 集因未固化或预检未通过被跳过`
            : ''
        }。`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量排队失败')
    } finally {
      setQueueingAllEpisodes(false)
    }
  }

  if (options.length === 0) return null

  const actionLabel = draft ? '固化当前版本' : '生成这一集时间线'
  return (
    <section className="episode-timeline-panel" aria-label={`${episodeLabel(episode)}时间线`}>
      <header className="episode-timeline-head">
        <div className="episode-timeline-heading">
          <span className="episode-timeline-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="M3 5.5h14M3 10h14M3 14.5h14" />
              <path d="M6 3.5v13M14 3.5v13" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="episode-timeline-title">
              <h3>{episodeLabel(episode)} · 时间线</h3>
              {draft && <span>草稿 v{draft.revision}</span>}
            </div>
            <p>只读取这一集当前已采用的视频；缺镜会保留为阻断项，不伪装成完整成片。</p>
          </div>
        </div>
        <div className="episode-timeline-actions">
          <label>
            <span>集</span>
            <select
              value={episode}
              disabled={working || loading}
              onChange={(event) => setEpisode(Number(event.target.value))}
            >
              {options.map((option) => (
                <option key={option} value={option}>{episodeLabel(option)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={working || loading}
            onClick={() => void (draft ? freeze() : initialize())}
          >
            {working ? '处理中…' : actionLabel}
          </button>
        </div>
      </header>

      {draft && (
        <div className="episode-timeline-summary" role="status">
          <span><b>{draft.payload.readyCount}</b>/{draft.payload.clips.length} 镜可渲染</span>
          <span>{draft.payload.blockedCount > 0 ? `${draft.payload.blockedCount} 镜阻断` : '没有阻断项'}</span>
          <span>{durationLabel(draft.payload.totalDurationMs)} 总时长</span>
          <span>{versions.length > 0 ? `已固化 ${versions.length} 版` : '尚未固化版本'}</span>
        </div>
      )}

      {loading ? (
        <div className="episode-timeline-empty">正在读取时间线…</div>
      ) : !draft ? (
        <div className="episode-timeline-empty">
          <b>还没有这一集的时间线</b>
          <p>生成后可以检查镜头顺序、缺视频和时长问题，再固化为不可变版本。</p>
        </div>
      ) : (
        <>
          <div className="episode-timeline-clips" aria-label="镜头顺序">
            {draft.payload.clips.map((clip, index) => (
              <article
                key={clip.id}
                className={`episode-timeline-clip is-${clip.status} ${clip.muted ? 'is-muted' : ''}`}
              >
                <div className="episode-timeline-sequence">
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>镜 {clip.shotNumber}</span>
                </div>
                <div className="episode-timeline-copy">
                  <b>{clip.scene}</b>
                  <span>{clipStatus(clip)}</span>
                  {clip.reason && <p>{clip.reason}</p>}
                </div>
                <div className="episode-timeline-time">
                  {durationLabel(Math.max(0, clip.outMs - clip.inMs))}
                </div>
                <div className="episode-timeline-controls">
                  <button
                    type="button"
                    title={clip.muted ? '恢复声音' : '静音这一镜'}
                    aria-label={clip.muted ? `恢复第 ${clip.shotNumber} 镜声音` : `静音第 ${clip.shotNumber} 镜`}
                    disabled={working}
                    onClick={() => toggleMute(index)}
                  >
                    <MutedIcon muted={clip.muted} />
                  </button>
                  <button
                    type="button"
                    title="裁剪或替换素材"
                    aria-label={`调整第 ${clip.shotNumber} 镜`}
                    aria-expanded={editingClipId === clip.id}
                    disabled={working}
                    onClick={() => setEditingClipId((current) => current === clip.id ? null : clip.id)}
                  >
                    <AdjustIcon />
                  </button>
                  <button
                    type="button"
                    title="向前移动"
                    aria-label={`第 ${clip.shotNumber} 镜向前移动`}
                    disabled={working || index === 0}
                    onClick={() => moveClip(index, -1)}
                  >
                    <ArrowIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    title="向后移动"
                    aria-label={`第 ${clip.shotNumber} 镜向后移动`}
                    disabled={working || index === draft.payload.clips.length - 1}
                    onClick={() => moveClip(index, 1)}
                  >
                    <ArrowIcon direction="down" />
                  </button>
                </div>
                {editingClipId === clip.id && (
                  <TimelineClipEditor
                    clip={clip}
                    candidates={videoCandidatesFor(clip, videos)}
                    dialogue={dialogueByClip.get(clip.id)}
                    working={working}
                    onTrim={(inMs, outMs) => trimClip(index, inMs, outMs)}
                    onReplace={(asset) => replaceClip(index, asset)}
                  />
                )}
              </article>
            ))}
          </div>
          <div className="episode-timeline-audio">
            <div className="episode-timeline-audio-controls">
              <b>本集配乐</b>
              <label>
                <span>曲目</span>
                <select
                  aria-label="配乐曲目"
                  value={bgmAssetId}
                  onChange={(event) => setBgmAssetId(event.target.value)}
                >
                  <option value="">无配乐</option>
                  {bgmTracks.map((track) => (
                    <option key={track.id} value={track.id}>{track.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>音量</span>
                <input
                  type="range"
                  aria-label="配乐音量"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bgmVolume}
                  onChange={(event) => setBgmVolume(Number(event.target.value))}
                />
                <em>{Math.round(bgmVolume * 100)}%</em>
              </label>
              <button type="button" disabled={working} onClick={() => void saveBgm()}>
                应用配乐
              </button>
            </div>
            <details className="episode-timeline-bgm-upload">
              <summary>上传授权 BGM</summary>
              <div>
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav"
                  onChange={(event) => setBgmFile(event.target.files?.[0] ?? null)}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={bgmLicensed}
                    onChange={(event) => setBgmLicensed(event.target.checked)}
                  />
                  我确认拥有该配乐的使用授权
                </label>
                <button
                  type="button"
                  disabled={!bgmFile || !bgmLicensed || uploadingBgm}
                  onClick={() => void uploadBgm()}
                >
                  {uploadingBgm ? '上传中…' : '上传 BGM'}
                </button>
              </div>
            </details>
          </div>
          <section className="episode-render-workbench" aria-label="成片渲染">
            <header>
              <div>
                <b>成片渲染</b>
                <span>使用固化版本，不改写后续草稿 · 每集约 {RENDER_UNITS} 创作额度</span>
              </div>
              <span className={renders.some((render) => render.status === 'running') ? 'is-running' : ''}>
                {renders.some((render) => render.status === 'running')
                  ? '正在渲染一集'
                  : renders.some((render) => render.status === 'queued')
                    ? '有任务排队中'
                    : '队列空闲'}
              </span>
            </header>
            <div className="episode-render-controls">
              <label>
                <span>时间线版本</span>
                <select
                  value={selectedVersion?.id ?? ''}
                  disabled={working || versions.length === 0}
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                >
                  {versions.length === 0 && <option value="">先固化当前草稿</option>}
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.revision} · {version.payload.readyCount}/{version.payload.clips.length} 镜
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={
                  !selectedVersion
                  || enqueueingRender
                  || dialogueInspection.issues.length > 0
                }
                title={dialogueInspection.issues[0]?.message}
                onClick={() => void enqueueRender()}
              >
                {enqueueingRender ? '提交中…' : '加入渲染队列'}
              </button>
              <button
                type="button"
                className="is-secondary"
                disabled={queueingAllEpisodes || options.length === 0}
                onClick={() => void enqueueAllFrozenEpisodes()}
              >
                {queueingAllEpisodes ? '批量排队中…' : '全部已固化集排队'}
              </button>
            </div>
            {dialogueInspection.issues.length > 0 && (
              <div className="episode-render-blockers" role="status">
                <b>渲染前还有 {dialogueInspection.issues.length} 项需要处理</b>
                {overflowCount > 0 && (
                  <p>对白超出镜头时长：请调整台词、裁剪或重新生成更短音频。</p>
                )}
                <ul>
                  {dialogueInspection.issues.slice(0, 5).map((issue, index) => (
                    <li key={`${issue.code}-${issue.clipId ?? 'project'}-${index}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {renders.length > 0 && (
              <div className="episode-render-list">
                {renders.map((render) => (
                  <article key={render.id} className={`is-${render.status}`}>
                    <div>
                      <b>v{render.timelineRevision}</b>
                      <span>
                        {render.status === 'queued'
                          ? '排队中'
                          : render.status === 'running'
                            ? `渲染中 ${render.progress}%`
                            : render.status === 'succeeded'
                              ? `已完成${render.durationMs ? ` · ${durationLabel(render.durationMs)}` : ''}`
                              : '渲染失败'}
                      </span>
                      {render.error && <p>{render.error}</p>}
                    </div>
                    {render.status === 'succeeded' && (
                      <div className="episode-render-downloads">
                        <a href={render.videoUrl ?? '#'}>下载 MP4</a>
                        <a href={render.subtitleUrl ?? '#'}>下载 SRT</a>
                        <a href={render.manifestUrl ?? '#'}>下载 manifest</a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <footer className="episode-timeline-footer">
            <p>时间线基于创建时采用的视频，不在每次打开时静默换源。</p>
            <div>
              {versions.slice(0, 4).map((version) => (
                <span key={version.id}>已固化 v{version.revision}</span>
              ))}
            </div>
          </footer>
        </>
      )}

      {notice && <p className="episode-timeline-notice" role="status">{notice}</p>}
      {error && <p className="episode-timeline-error" role="alert">{error}</p>}
    </section>
  )
}
