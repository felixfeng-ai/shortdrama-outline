'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { GeneratedAsset } from '@/lib/generation/types'
import type { TimelineClip, TimelineDraft, TimelinePayload, TimelineVersion } from '@/lib/timeline/types'
import {
  fetchBgmLibrary,
  setBgmFavorite,
  uploadBgmTrack,
} from '@/lib/audio/bgm-client'
import type { BgmTrack } from '@/lib/audio/bgm-types'
import { fetchAudioState } from '@/lib/audio/client'
import type {
  RenderExportPreset,
  RenderQualityProfile,
  TimelineDialogueLine,
  VideoRenderDto,
} from '@/lib/video/render-types'
import {
  enqueueFrozenEpisodeQueue,
  enqueueVideoRender,
  fetchVideoRenders,
  smartRenderEpisode,
  updateRenderApproval,
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
import { syncTimelineSelectedVideoSources } from '@/lib/timeline/initial'

interface Props {
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  episodes: number[]
  preferredEpisode: number | null
  videos: GeneratedAsset[]
  shots: TimelineShotInput[]
  onOpenVideo?: () => void
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

function BgmWaveform({ values }: { values?: number[] }) {
  const bars = values?.length ? values : [0.25, 0.4, 0.3, 0.55, 0.42, 0.7, 0.5, 0.34]
  return (
    <span className="episode-bgm-waveform" aria-hidden="true">
      {bars.map((value, index) => (
        <i key={index} style={{ height: `${Math.max(12, Math.round(value * 100))}%` }} />
      ))}
    </span>
  )
}

function BgmTrackCard({
  track,
  selected,
  favorite,
  previewing,
  onSelect,
  onPreview,
  onFavorite,
}: {
  track: BgmTrack
  selected: boolean
  favorite: boolean
  previewing: boolean
  onSelect: () => void
  onPreview: () => void
  onFavorite: () => void
}) {
  return (
    <article className={`episode-bgm-card ${selected ? 'is-selected' : ''}`}>
      <div className="episode-bgm-card-head">
        <div>
          <b>{track.name}</b>
          <span>{track.genre || '配乐'} · {track.bpm || '--'} BPM</span>
        </div>
        <button
          type="button"
          className={favorite ? 'is-favorite' : ''}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          {favorite ? '已收藏' : '收藏'}
        </button>
      </div>
      <BgmWaveform values={track.waveform} />
      <div className="episode-bgm-tags">
        {(track.tags ?? []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="episode-bgm-card-meta">
        <span>{track.durationMs ? durationLabel(track.durationMs) : '--:--'}</span>
        <span>{track.licenseName || '授权信息'}</span>
      </div>
      <div className="episode-bgm-card-actions">
        <button type="button" onClick={onPreview}>
          {previewing ? '收起试听' : '试听'}
        </button>
        <button type="button" disabled={selected} onClick={onSelect}>
          {selected ? '已选中' : '选择'}
        </button>
      </div>
      {previewing && track.previewUrl && (
        <audio
          controls
          autoPlay
          preload="metadata"
          src={track.previewUrl}
          aria-label={`试听 ${track.name}`}
        />
      )}
    </article>
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
  onOpenVideo,
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
  const [systemBgmTracks, setSystemBgmTracks] = useState<BgmTrack[]>([])
  const [recommendedBgmTracks, setRecommendedBgmTracks] = useState<BgmTrack[]>([])
  const [bgmFavoriteIds, setBgmFavoriteIds] = useState<string[]>([])
  const [bgmCategories, setBgmCategories] = useState<string[]>([])
  const [bgmMode, setBgmMode] = useState<'recommend' | 'library' | 'upload'>('recommend')
  const [bgmQuery, setBgmQuery] = useState('')
  const [bgmCategory, setBgmCategory] = useState('全部')
  const [bgmPreviewId, setBgmPreviewId] = useState('')
  const [bgmAssetId, setBgmAssetId] = useState('')
  const [bgmVolume, setBgmVolume] = useState(0.3)
  const [bgmFadeInSeconds, setBgmFadeInSeconds] = useState(0.6)
  const [bgmFadeOutSeconds, setBgmFadeOutSeconds] = useState(1)
  const [bgmFile, setBgmFile] = useState<File | null>(null)
  const [bgmLicensed, setBgmLicensed] = useState(false)
  const [bgmUploadOpen, setBgmUploadOpen] = useState(false)
  const [uploadingBgm, setUploadingBgm] = useState(false)
  const [bgmStatus, setBgmStatus] = useState<{
    kind: 'idle' | 'working' | 'success' | 'error'
    message: string
  }>({ kind: 'idle', message: '' })
  const [audioTasks, setAudioTasks] = useState<Awaited<ReturnType<typeof fetchAudioState>>['tasks']>([])
  const [audioAssets, setAudioAssets] = useState<Awaited<ReturnType<typeof fetchAudioState>>['assets']>([])
  const [renders, setRenders] = useState<VideoRenderDto[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [renderQuality, setRenderQuality] = useState<RenderQualityProfile>('preview')
  const [exportPreset, setExportPreset] = useState<RenderExportPreset>('vertical')
  const [transitionType, setTransitionType] = useState<'cut' | 'fade'>('fade')
  const [transitionDuration, setTransitionDuration] = useState(0.2)
  const [subtitleStyle, setSubtitleStyle] = useState<'clean' | 'cinematic' | 'bold'>('clean')
  const [bgmDucking, setBgmDucking] = useState(true)
  const [enqueueingRender, setEnqueueingRender] = useState(false)
  const [smartRendering, setSmartRendering] = useState(false)
  const [queueingAllEpisodes, setQueueingAllEpisodes] = useState(false)
  const [approvalWorkingId, setApprovalWorkingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingClipId, setEditingClipId] = useState<string | null>(null)
  const [timelineSection, setTimelineSection] = useState<'clips' | 'audio' | 'render'>('render')
  const [renderPreviewStarted, setRenderPreviewStarted] = useState(false)
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
        fetchBgmLibrary(targetProjectId).catch(() => ({
          tracks: [],
          systemTracks: [],
          recommendations: [],
          favoriteIds: [],
          categories: [],
        })),
        fetchAudioState(targetProjectId).catch(() => ({
          tasks: [],
          assets: [],
          batches: [],
        })),
        fetchVideoRenders(targetProjectId, targetEpisode).catch(() => []),
      ])
      setDraft(state.draft)
      setVersions(state.versions)
      setBgmTracks(tracks.tracks)
      setSystemBgmTracks(tracks.systemTracks)
      setRecommendedBgmTracks(tracks.recommendations)
      setBgmFavoriteIds(tracks.favoriteIds)
      setBgmCategories(tracks.categories)
      setBgmUploadOpen(tracks.tracks.length === 0 && tracks.systemTracks.length === 0)
      setAudioTasks(audioState.tasks)
      setAudioAssets(audioState.assets)
      setRenders(renderState)
      setSelectedVersionId((current) =>
        state.versions.some((version) => version.id === current)
          ? current
          : state.versions[0]?.id ?? ''
      )
      setBgmAssetId(state.draft?.payload.audio.bgmAssetId ?? '')
      setBgmVolume(state.draft?.payload.audio.bgmVolume ?? 0.3)
      setBgmFadeInSeconds((state.draft?.payload.audio.bgmFadeInMs ?? 600) / 1000)
      setBgmFadeOutSeconds((state.draft?.payload.audio.bgmFadeOutMs ?? 1_000) / 1000)
      setTransitionType(state.draft?.payload.video?.transition === 'cut' ? 'cut' : 'fade')
      setTransitionDuration((state.draft?.payload.video?.transitionDurationMs ?? 200) / 1000)
      setSubtitleStyle(state.draft?.payload.subtitle.style ?? 'clean')
      setBgmDucking(state.draft?.payload.audio.bgmDucking !== false)
      setBgmStatus({ kind: 'idle', message: '' })
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

  function syncAdoptedVideos() {
    if (!draft || working) return
    const synced = syncTimelineSelectedVideoSources(draft.payload, videos)
    void saveClips(synced.clips, '已把当前采用的视频同步到时间线草稿。')
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
    if (bgmAssetId && !allBgmTracks.some((track) => track.id === bgmAssetId)) {
      setBgmStatus({ kind: 'error', message: '所选配乐已失效，请重新选择。' })
      return
    }
    setWorking(true)
    setError(null)
    setNotice(null)
    setBgmStatus({ kind: 'working', message: '正在保存本集配乐…' })
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
            bgmFadeInMs: Math.round(bgmFadeInSeconds * 1000),
            bgmFadeOutMs: Math.round(bgmFadeOutSeconds * 1000),
          },
        },
      })
      setDraft(result.draft)
      setBgmStatus({
        kind: 'success',
        message: bgmAssetId
          ? `已应用到${episodeLabel(episode)}，音量 ${Math.round(bgmVolume * 100)}%。`
          : `已移除${episodeLabel(episode)}配乐。`,
      })
    } catch (cause) {
      setBgmStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : '配乐保存失败',
      })
    } finally {
      setWorking(false)
    }
  }

  async function savePostSettings() {
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
          subtitle: { enabled: true, style: subtitleStyle },
          video: {
            transition: transitionType,
            transitionDurationMs: Math.round(transitionDuration * 1000),
          },
          audio: {
            ...draft.payload.audio,
            bgmDucking,
          },
        },
      })
      setDraft(result.draft)
      setNotice('后期设置已保存。请固化当前草稿后再渲染新版本。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '后期设置保存失败')
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
      setBgmUploadOpen(false)
      setBgmStatus({ kind: 'success', message: 'BGM 已上传，点击“应用配乐”保存到本集。' })
    } catch (cause) {
      setBgmStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'BGM 上传失败',
      })
    } finally {
      setUploadingBgm(false)
    }
  }

  async function toggleBgmFavorite(track: BgmTrack) {
    if (!currentProjectId) return
    const favorite = !bgmFavoriteIds.includes(track.id)
    try {
      const next = await setBgmFavorite({
        projectId: currentProjectId,
        trackId: track.id,
        favorite,
      })
      setBgmFavoriteIds(next)
    } catch (cause) {
      setBgmStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'BGM 收藏失败',
      })
    }
  }

  function selectBgmTrack(track: BgmTrack) {
    setBgmAssetId(track.id)
    if (!currentBgm && bgmVolume <= 0.2) setBgmVolume(0.3)
    setBgmStatus({ kind: 'idle', message: '' })
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
  const missingClipsWithUnselectedCandidates = draft
    ? draft.payload.clips.filter((clip) =>
        clip.status === 'missing-video'
        && videoCandidatesFor(clip, videos).some((video) => video.selectedAt === null)
      )
    : []
  const staleAdoptedClips = draft
    ? draft.payload.clips.filter((clip) =>
        clip.status === 'missing-video'
        && videoCandidatesFor(clip, videos).some((video) => video.selectedAt !== null)
      )
    : []
  const selectedVersionStaleAdoptedClips = selectedVersion
    ? selectedVersion.payload.clips.filter((clip) =>
        clip.status === 'missing-video'
        && videoCandidatesFor(clip, videos).some((video) => video.selectedAt !== null)
      )
    : []
  const selectedVersionBlockedCount = selectedVersion?.payload.blockedCount ?? 0
  const allBgmTracks = useMemo(
    () => [...systemBgmTracks, ...bgmTracks],
    [bgmTracks, systemBgmTracks],
  )
  const selectedBgm = allBgmTracks.find((track) => track.id === bgmAssetId) ?? null
  const filteredSystemBgmTracks = useMemo(() => {
    const query = bgmQuery.trim().toLowerCase()
    return systemBgmTracks.filter((track) => {
      const categoryMatches = bgmCategory === '全部' || track.mood === bgmCategory
      const text = [track.name, track.mood, track.genre, ...(track.tags ?? [])]
        .join(' ')
        .toLowerCase()
      return categoryMatches && (!query || text.includes(query))
    })
  }, [bgmCategory, bgmQuery, systemBgmTracks])
  const currentBgm = draft?.payload.audio.bgmAssetId ?? ''
  const selectedBgmName = selectedBgm?.name ?? '无配乐'
  const bgmHasChanges = Boolean(draft && (
    bgmAssetId !== currentBgm
    || Math.abs(bgmVolume - draft.payload.audio.bgmVolume) > 0.001
    || Math.abs(bgmFadeInSeconds * 1000 - (draft.payload.audio.bgmFadeInMs ?? 600)) > 1
    || Math.abs(bgmFadeOutSeconds * 1000 - (draft.payload.audio.bgmFadeOutMs ?? 1_000)) > 1
  ))
  const postSettingsDirty = Boolean(draft && (
    transitionType !== (draft.payload.video?.transition ?? 'fade')
    || Math.abs(transitionDuration * 1000 - (draft.payload.video?.transitionDurationMs ?? 200)) > 1
    || subtitleStyle !== (draft.payload.subtitle.style ?? 'clean')
    || bgmDucking !== (draft.payload.audio.bgmDucking !== false)
  ))
  const bgmCanApply = Boolean(
    draft
    && !working
    && bgmHasChanges
    && (bgmAssetId || currentBgm),
  )
  const orderedRenders = [...renders].sort((left, right) => right.createdAt - left.createdAt)
  const latestSuccessfulRender = orderedRenders.find((render) =>
    render.status === 'succeeded' && Boolean(render.videoUrl)
  ) ?? null
  const activeRender = orderedRenders.find((render) =>
    render.status === 'queued' || render.status === 'running'
  ) ?? null
  const latestRender = orderedRenders[0] ?? null
  useEffect(() => {
    setRenderPreviewStarted(false)
  }, [episode, latestSuccessfulRender?.id])
  const renderSectionStatus = activeRender
    ? '渲染中'
    : latestSuccessfulRender
      ? '可下载'
      : versions.length > 0
        ? '待生成'
        : '未固化'
  const blockedClipCount = draft?.payload.blockedCount ?? 0
  const outputBlocked = blockedClipCount > 0 || dialogueInspection.issues.length > 0
  const staleAdoptedCount = staleAdoptedClips.length
  const selectedVersionStaleCount = selectedVersionStaleAdoptedClips.length
  const renderStateLabel = latestSuccessfulRender
    ? '成片成功'
    : activeRender
      ? activeRender.status === 'queued'
        ? '排队中'
        : '渲染中'
      : latestRender?.status === 'failed'
        ? '渲染失败'
        : selectedVersionStaleCount > 0
          ? '版本待重固化'
        : staleAdoptedCount > 0
          ? '待同步'
        : outputBlocked
          ? '被阻断'
          : versions.length > 0
            ? '待渲染'
            : '未创建'
  const outputTitle = latestSuccessfulRender
    ? `${episodeLabel(episode)}成片已就绪`
    : activeRender
      ? `${episodeLabel(episode)}正在生成成片`
      : latestRender?.status === 'failed'
        ? '最近一次渲染失败'
        : selectedVersionStaleCount > 0
          ? '当前固化版本还未包含已采用视频'
        : staleAdoptedCount > 0
          ? `${staleAdoptedCount} 个已采用视频尚未同步`
        : blockedClipCount > 0
          ? `还有 ${blockedClipCount} 个镜头未就绪`
          : versions.length === 0
            ? '先固化一个可渲染版本'
            : '版本已锁定，可以开始生成成片'
  const outputDescription = latestSuccessfulRender
    ? outputBlocked
      ? `当前可下载的是 v${latestSuccessfulRender.timelineRevision}；当前草稿仍有 ${blockedClipCount || dialogueInspection.issues.length} 项未就绪，修改后需重新固化并渲染。`
      : '可直接播放、下载 MP4，或继续保留同版本的 SRT 字幕与交付清单。'
    : activeRender
      ? `渲染进度 ${activeRender.progress}% ，完成后会自动显示在这里。`
      : latestRender?.status === 'failed'
        ? latestRender.error || '渲染失败，请检查阻断项后重新加入渲染队列。'
        : selectedVersionStaleCount > 0
          ? '视频已经采用，但固化版本不会自动变化；需要同步当前视频并创建一个新版本。'
        : staleAdoptedCount > 0
          ? '视频候选已经采用，只需同步到当前时间线草稿，不需要重新生成或重新采用。'
        : blockedClipCount > 0
          ? '先回到镜头视频采用可用版本，或在时间线同步已采用视频。'
          : dialogueInspection.issues.length > 0
            ? `还有 ${dialogueInspection.issues.length} 个对白或音频问题需要处理。`
            : versions.length === 0
              ? '固化会把当前镜头顺序、裁剪、静音和配乐保存为不可变版本。'
              : '生成后会在顶部直接出现可播放的竖屏成片。'

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
        qualityProfile: renderQuality,
        exportPreset,
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

  async function runSmartFilm() {
    if (!currentProjectId || smartRendering) return
    setSmartRendering(true)
    setError(null)
    setNotice(null)
    try {
      const result = await smartRenderEpisode({
        projectId: currentProjectId,
        episode,
        qualityProfile: renderQuality,
        exportPreset,
      })
      setRenders((current) => [
        result.render,
        ...current.filter((render) => render.id !== result.render.id),
      ])
      setVersions((current) => [
        result.version,
        ...current.filter((version) => version.id !== result.version.id),
      ])
      setSelectedVersionId(result.version.id)
      await load(episode, currentProjectId)
      const summary = [
        `已自动采用 ${result.adoptedVideoCount} 条视频`,
        result.generatedTtsCount > 0 ? `补齐 ${result.generatedTtsCount} 条配音` : null,
        result.bgmTrackId ? '已匹配系统配乐' : null,
        `已固化 v${result.version.revision} 并加入${result.qualityProfile === 'delivery' ? '交付版' : '预览版'}渲染`,
        ...result.warnings,
      ].filter(Boolean)
      setNotice(summary.join('；'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '智能成片失败')
    } finally {
      setSmartRendering(false)
    }
  }

  async function syncAndFreezeLatestVideos() {
    if (!currentProjectId || !draft || working) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const synced = syncTimelineSelectedVideoSources(draft.payload, videos)
      const saved = await saveTimelineDraft({
        projectId: currentProjectId,
        episode,
        expectedRevision: draft.revision,
        payload: synced,
      })
      setDraft(saved.draft)
      const frozen = await freezeTimelineVersion({
        projectId: currentProjectId,
        episode,
        expectedRevision: saved.draft.revision,
      })
      setVersions((current) => [
        frozen.version,
        ...current.filter((version) => version.id !== frozen.version.id),
      ])
      setSelectedVersionId(frozen.version.id)
      setNotice(`已同步当前采用视频并固化 v${frozen.version.revision}，现在可以使用新版本渲染。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步并固化新版本失败')
    } finally {
      setWorking(false)
    }
  }

  function openTimelineSection(
    section: 'clips' | 'audio' | 'render',
    scroll = false,
  ) {
    setTimelineSection(section)
    if (!scroll) return
    requestAnimationFrame(() => {
      document.getElementById('episode-timeline-sections')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
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

  async function changeRenderApproval(
    render: VideoRenderDto,
    action: 'request' | 'approve' | 'request_changes',
  ) {
    if (!currentProjectId || approvalWorkingId) return
    setApprovalWorkingId(render.id)
    setError(null)
    try {
      const approval = await updateRenderApproval({
        projectId: currentProjectId,
        renderId: render.id,
        action,
        note: action === 'request_changes' ? '请根据交付审核意见修改。' : '',
      })
      setRenders((current) => current.map((item) =>
        item.id === render.id
          ? {
              ...item,
              approvalStatus: approval.status,
              approvalNote: approval.note,
              approvalReviewedAt: approval.reviewedAt,
            }
          : item
      ))
      setNotice(
        approval.status === 'approved'
          ? '交付审核已通过。'
          : approval.status === 'changes_requested'
            ? '已退回修改。'
            : '已提交交付审核。',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '交付审核操作失败')
    } finally {
      setApprovalWorkingId(null)
    }
  }

  if (options.length === 0) return null

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
        </div>
      </header>

      <section
        className={`episode-timeline-output ${latestSuccessfulRender ? 'has-output' : latestRender?.status === 'failed' ? 'is-failed' : outputBlocked ? 'is-blocked' : 'is-pending'}`}
        aria-label="成片输出"
      >
        <div className="episode-timeline-output-stage">
          {latestSuccessfulRender?.videoUrl ? (
            <>
              <video
                controls
                playsInline
                preload="auto"
                src={latestSuccessfulRender.videoUrl}
                aria-label={`${episodeLabel(episode)}成片预览`}
                onLoadedMetadata={(event) => {
                  if (event.currentTarget.currentTime === 0) {
                    event.currentTarget.currentTime = 0.05
                  }
                }}
                onPlay={() => setRenderPreviewStarted(true)}
              />
              {!renderPreviewStarted && (
                <div className="episode-timeline-video-hint" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m10 8 6 4-6 4V8Z" />
                  </svg>
                  <span>点击播放成片</span>
                </div>
              )}
            </>
          ) : (
            <div className="episode-timeline-output-empty">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <rect x="4" y="7" width="24" height="18" rx="3" />
                <path d="m13 12 7 4-7 4v-8Z" />
              </svg>
              <b>{activeRender ? `正在渲染 ${activeRender.progress}%` : '尚无可播放成片'}</b>
              <span>{activeRender ? '完成后会自动出现在这里。' : '先完成下面的阻断项，再生成成片。'}</span>
            </div>
          )}
        </div>

        <div className="episode-timeline-output-summary">
          <div className="episode-timeline-output-kicker">
            <span>成片交付</span>
            <em>{renderStateLabel}</em>
          </div>
          <h4>{loading ? '正在读取时间线…' : outputTitle}</h4>
          <p>{loading ? '读取完成后会显示当前版本与成片状态。' : outputDescription}</p>

          <ol className="episode-timeline-output-steps" aria-label="成片生成步骤">
            <li className={draft && blockedClipCount === 0 ? 'is-done' : draft ? 'is-blocked' : ''}>
              <span aria-hidden="true" />
              镜头 {draft ? `${draft.payload.readyCount}/${draft.payload.clips.length}` : '未建立'}
            </li>
            <li className={versions.length > 0 ? 'is-done' : ''}>
              <span aria-hidden="true" />
              {versions.length > 0 ? `已固化 v${versions[0].revision}` : '待固化版本'}
            </li>
            <li className={latestSuccessfulRender ? 'is-done' : activeRender ? 'is-running' : ''}>
              <span aria-hidden="true" />
              {latestSuccessfulRender ? '成片完成' : activeRender ? '渲染中' : '待渲染'}
            </li>
          </ol>

          <div className="episode-timeline-output-attempts" aria-label="最近渲染记录">
            <span>最近渲染</span>
            {orderedRenders.length === 0 ? (
              <em>尚无渲染记录</em>
            ) : orderedRenders.slice(0, 3).map((render) => (
              <b key={render.id} className={`is-${render.status}`}>
                v{render.timelineRevision} · {
                  render.status === 'succeeded'
                    ? '成功'
                    : render.status === 'running'
                      ? `${render.progress}%`
                      : render.status === 'queued'
                        ? '排队'
                        : '失败'
                }
              </b>
            ))}
          </div>

          <div className="episode-timeline-output-actions">
            {draft && !latestSuccessfulRender && !activeRender && (
              <button
                type="button"
                disabled={smartRendering || working || loading}
                onClick={() => void runSmartFilm()}
              >
                {smartRendering ? '智能处理中…' : '一键智能成片'}
              </button>
            )}
            {latestSuccessfulRender ? (
              <>
                <a href={latestSuccessfulRender.videoUrl ?? '#'} download>下载 MP4</a>
                {latestSuccessfulRender.subtitleUrl && (
                  <a href={latestSuccessfulRender.subtitleUrl} download>下载 SRT</a>
                )}
                <button
                  type="button"
                  onClick={() => openTimelineSection('render', true)}
                >
                  查看版本与交付历史
                </button>
              </>
            ) : activeRender ? (
              <button type="button" disabled>
                渲染中 · {activeRender.progress}%
              </button>
            ) : !draft ? (
              <button type="button" disabled={working || loading} onClick={() => void initialize()}>
                {working ? '处理中…' : '生成这一集时间线'}
              </button>
            ) : selectedVersionStaleCount > 0 ? (
              <button type="button" disabled={working} onClick={() => void syncAndFreezeLatestVideos()}>
                {working ? '处理中…' : '同步并固化新版本'}
              </button>
            ) : staleAdoptedCount > 0 ? (
              <button type="button" disabled={working} onClick={syncAdoptedVideos}>
                {working ? '同步中…' : `同步 ${staleAdoptedClips.length} 个已采用视频`}
              </button>
            ) : blockedClipCount > 0 ? (
              <button type="button" disabled={!onOpenVideo || working} onClick={onOpenVideo}>
                {onOpenVideo ? '去处理镜头视频' : '先处理缺视频镜头'}
              </button>
            ) : dialogueInspection.issues.length > 0 ? (
              <button
                type="button"
                onClick={() => openTimelineSection('render', true)}
              >
                查看 {dialogueInspection.issues.length} 个音频问题
              </button>
            ) : versions.length === 0 ? (
              <button type="button" disabled={working} onClick={() => void freeze()}>
                {working ? '处理中…' : '固化当前版本'}
              </button>
            ) : (
              <button
                type="button"
                disabled={!selectedVersion || enqueueingRender}
                onClick={() => void enqueueRender()}
              >
                {enqueueingRender ? '提交中…' : '生成成片'}
              </button>
            )}
            {latestSuccessfulRender && draft && !activeRender && (
              <button
                type="button"
                disabled={smartRendering || working || loading}
                onClick={() => void runSmartFilm()}
              >
                {smartRendering ? '智能处理中…' : '重新智能成片'}
              </button>
            )}
          </div>
        </div>
      </section>

      {draft && (
        <div className="episode-timeline-summary" role="status">
          <span><b>{draft.payload.readyCount}</b>/{draft.payload.clips.length} 镜可渲染</span>
          <span>{draft.payload.blockedCount > 0 ? `${draft.payload.blockedCount} 镜阻断` : '没有阻断项'}</span>
          <span>{durationLabel(draft.payload.totalDurationMs)} 总时长</span>
          <span>{versions.length > 0 ? `已固化 ${versions.length} 版` : '尚未固化版本'}</span>
        </div>
      )}

      {draft && staleAdoptedClips.length > 0 && (
        <div className="episode-timeline-candidate-hint" role="status">
          <span>
            <b>{staleAdoptedClips.length} 个镜头已采用视频，但当前草稿仍是旧素材</b>
            <small>同步只替换这些镜头的视频源，不重置镜头顺序和静音设置。</small>
          </span>
          <button type="button" disabled={working} onClick={syncAdoptedVideos}>
            {working ? '同步中…' : '同步已采用视频'}
          </button>
        </div>
      )}

      {draft && missingClipsWithUnselectedCandidates.length > 0 && onOpenVideo && (
        <div className="episode-timeline-candidate-hint" role="status">
          <span>
            <b>{missingClipsWithUnselectedCandidates.length} 个镜头已有候选视频，但尚未采用</b>
            <small>候选不会自动进入时间线；采用后会替换这一镜的素材。</small>
          </span>
          <button type="button" onClick={onOpenVideo}>去采用视频</button>
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
          <nav id="episode-timeline-sections" className="episode-timeline-sections" aria-label="时间线工具">
            <button
              type="button"
              aria-pressed={timelineSection === 'render'}
              onClick={() => openTimelineSection('render')}
            >
              <span>成片状态</span>
              <small>{renderSectionStatus}</small>
            </button>
            <button
              type="button"
              aria-pressed={timelineSection === 'clips'}
              onClick={() => openTimelineSection('clips')}
            >
              <span>镜头轨道</span>
              <small>{draft.payload.readyCount}/{draft.payload.clips.length}</small>
            </button>
            <button
              type="button"
              aria-pressed={timelineSection === 'audio'}
              onClick={() => openTimelineSection('audio')}
            >
              <span>声音配乐</span>
              <small>{selectedBgmName}</small>
            </button>
          </nav>

          {timelineSection === 'clips' && (
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
                  <span>
                    {clip.status === 'missing-video'
                      && videoCandidatesFor(clip, videos).some((video) => video.selectedAt !== null)
                      ? '已采用视频，待同步草稿'
                      : clip.status === 'missing-video'
                        && videoCandidatesFor(clip, videos).length > 0
                        ? `有 ${videoCandidatesFor(clip, videos).length} 条候选，尚未采用`
                      : clipStatus(clip)}
                  </span>
                  {clip.reason && (
                    <p>
                      {clip.status === 'missing-video'
                        && videoCandidatesFor(clip, videos).some((video) => video.selectedAt !== null)
                        ? '点击上方“同步已采用视频”更新当前草稿。'
                        : clip.status === 'missing-video'
                          && videoCandidatesFor(clip, videos).length > 0
                          ? '前往“镜头视频”采用一个版本后再渲染。'
                        : clip.reason}
                    </p>
                  )}
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
          )}

          {timelineSection === 'audio' && (
          <div className="episode-bgm-workbench">
            <header className="episode-bgm-workbench-head">
              <div>
                <b>本集配乐</b>
                <span>{selectedBgm ? `${selectedBgm.name} · ${selectedBgm.mood || '项目配乐'}` : '尚未选择曲目'}</span>
              </div>
              {selectedBgm && <BgmWaveform values={selectedBgm.waveform} />}
            </header>

            <nav className="episode-bgm-tabs" aria-label="配乐来源">
              <button
                type="button"
                aria-pressed={bgmMode === 'recommend'}
                onClick={() => setBgmMode('recommend')}
              >
                智能推荐
              </button>
              <button
                type="button"
                aria-pressed={bgmMode === 'library'}
                onClick={() => setBgmMode('library')}
              >
                系统曲库
              </button>
              <button
                type="button"
                aria-pressed={bgmMode === 'upload'}
                onClick={() => {
                  setBgmMode('upload')
                  setBgmUploadOpen(true)
                }}
              >
                我的上传
              </button>
            </nav>

            {bgmMode === 'recommend' && (
              <section className="episode-bgm-panel">
                <p>根据当前项目的人物、场景、冲突和情绪自动匹配。</p>
                <div className="episode-bgm-grid">
                  {recommendedBgmTracks.map((track) => (
                    <BgmTrackCard
                      key={track.id}
                      track={track}
                      selected={bgmAssetId === track.id}
                      favorite={bgmFavoriteIds.includes(track.id)}
                      previewing={bgmPreviewId === track.id}
                      onSelect={() => selectBgmTrack(track)}
                      onPreview={() => setBgmPreviewId((current) => current === track.id ? '' : track.id)}
                      onFavorite={() => void toggleBgmFavorite(track)}
                    />
                  ))}
                </div>
              </section>
            )}

            {bgmMode === 'library' && (
              <section className="episode-bgm-panel">
                <div className="episode-bgm-filters">
                  <input
                    type="search"
                    aria-label="搜索配乐"
                    placeholder="搜索曲名、情绪或标签"
                    value={bgmQuery}
                    onChange={(event) => setBgmQuery(event.target.value)}
                  />
                  <select
                    aria-label="配乐分类"
                    value={bgmCategory}
                    onChange={(event) => setBgmCategory(event.target.value)}
                  >
                    <option value="全部">全部情绪</option>
                    {bgmCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div className="episode-bgm-grid">
                  {filteredSystemBgmTracks.map((track) => (
                    <BgmTrackCard
                      key={track.id}
                      track={track}
                      selected={bgmAssetId === track.id}
                      favorite={bgmFavoriteIds.includes(track.id)}
                      previewing={bgmPreviewId === track.id}
                      onSelect={() => selectBgmTrack(track)}
                      onPreview={() => setBgmPreviewId((current) => current === track.id ? '' : track.id)}
                      onFavorite={() => void toggleBgmFavorite(track)}
                    />
                  ))}
                </div>
                {filteredSystemBgmTracks.length === 0 && (
                  <div className="episode-bgm-empty-result">没有匹配的曲目，请更换关键词或分类。</div>
                )}
              </section>
            )}

            {bgmMode === 'upload' && (
              <section className="episode-bgm-panel">
                <div className="episode-bgm-upload-list">
                  {bgmTracks.map((track) => (
                    <article key={track.id} className={bgmAssetId === track.id ? 'is-selected' : ''}>
                      <div>
                        <b>{track.name}</b>
                        <span>{track.durationMs ? durationLabel(track.durationMs) : '时长未知'} · 用户上传</span>
                      </div>
                      <div>
                        <button type="button" onClick={() => setBgmPreviewId((current) => current === track.id ? '' : track.id)}>
                          {bgmPreviewId === track.id ? '收起' : '试听'}
                        </button>
                        <button type="button" onClick={() => selectBgmTrack(track)}>选择</button>
                      </div>
                      {bgmPreviewId === track.id && track.previewUrl && (
                        <audio controls autoPlay preload="metadata" src={track.previewUrl} />
                      )}
                    </article>
                  ))}
                  {bgmTracks.length === 0 && (
                    <div className="episode-bgm-empty-result">还没有项目上传曲目。</div>
                  )}
                </div>
                <details
                  className="episode-timeline-bgm-upload"
                  open={bgmUploadOpen}
                  onToggle={(event) => setBgmUploadOpen(event.currentTarget.open)}
                >
                  <summary>上传授权 BGM</summary>
                  <div>
                    <p>支持 MP3 / WAV，单文件不超过 30MB。平台曲库优先，上传用于项目定制音乐。</p>
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
              </section>
            )}

            <section className="episode-bgm-selection">
              <div className="episode-bgm-selection-title">
                <div>
                  <b>{selectedBgm?.name ?? '未选择曲目'}</b>
                  <span>
                    {selectedBgm
                      ? [
                          selectedBgm.genre,
                          selectedBgm.bpm ? `${selectedBgm.bpm} BPM` : null,
                          selectedBgm.durationMs ? durationLabel(selectedBgm.durationMs) : null,
                          selectedBgm.licenseName,
                        ].filter(Boolean).join(' · ')
                      : '可以从智能推荐、系统曲库或项目上传中选择。'}
                  </span>
                </div>
                {selectedBgm && (
                  <button
                    type="button"
                    className="is-quiet"
                    onClick={() => {
                      setBgmAssetId('')
                      setBgmPreviewId('')
                      setBgmStatus({ kind: 'idle', message: '' })
                    }}
                  >
                    清除选择
                  </button>
                )}
              </div>
              <div className="episode-bgm-mix-controls">
                <label>
                  <span>音量</span>
                  <input
                    type="range"
                    aria-label="配乐音量"
                    min="0"
                    max="1"
                    step="0.05"
                    value={bgmVolume}
                    onChange={(event) => {
                      setBgmVolume(Number(event.target.value))
                      setBgmStatus({ kind: 'idle', message: '' })
                    }}
                  />
                  <em>{Math.round(bgmVolume * 100)}%</em>
                </label>
                <label>
                  <span>淡入</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={bgmFadeInSeconds}
                    onChange={(event) => setBgmFadeInSeconds(Number(event.target.value))}
                  />
                  <em>秒</em>
                </label>
                <label>
                  <span>淡出</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={bgmFadeOutSeconds}
                    onChange={(event) => setBgmFadeOutSeconds(Number(event.target.value))}
                  />
                  <em>秒</em>
                </label>
                <button type="button" disabled={!bgmCanApply} onClick={() => void saveBgm()}>
                  {bgmStatus.kind === 'working'
                    ? '保存中…'
                    : !bgmAssetId && !currentBgm
                      ? '未选择曲目'
                      : !bgmHasChanges
                        ? '已应用'
                        : bgmAssetId
                          ? '应用到本集'
                          : '移除配乐'}
                </button>
              </div>
              <p
                className={`episode-timeline-bgm-status is-${bgmStatus.kind}`}
                role={bgmStatus.kind === 'error' ? 'alert' : 'status'}
              >
                {bgmStatus.message
                  || (selectedBgm
                    ? `${selectedBgm.licenseNote} 应用后才会进入时间线混音。`
                    : '系统曲库为平台自制原创内测曲目，用户上传需自行确认授权。')}
              </p>
            </section>
          </div>
          )}

          {timelineSection === 'render' && (
          <section id="episode-render-workbench" className="episode-render-workbench" aria-label="成片渲染">
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
            {selectedVersionBlockedCount > 0 && (
              <div className="episode-render-version-warning" role="status">
                <div>
                  <b>当前所选版本仍有 {selectedVersionBlockedCount} 个镜头不可渲染</b>
                  <p>
                    视频页“已采用”只更新当前素材；已固化的时间线版本不会自动变化。
                    {selectedVersionStaleCount > 0 ? ` 当前有 ${selectedVersionStaleCount} 个已采用视频可以同步。` : ''}
                  </p>
                </div>
                {selectedVersionStaleCount > 0 && (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void syncAndFreezeLatestVideos()}
                  >
                    {working ? '处理中…' : '同步并固化新版本'}
                  </button>
                )}
              </div>
            )}
            <div className="episode-post-settings">
              <label>
                <span>镜头转场</span>
                <select
                  value={transitionType}
                  onChange={(event) => setTransitionType(event.target.value as 'cut' | 'fade')}
                >
                  <option value="cut">硬切</option>
                  <option value="fade">淡入淡出</option>
                </select>
              </label>
              <label>
                <span>转场时长</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={transitionDuration}
                  onChange={(event) => setTransitionDuration(Number(event.target.value))}
                />
                <em>秒</em>
              </label>
              <label>
                <span>字幕风格</span>
                <select
                  value={subtitleStyle}
                  onChange={(event) => setSubtitleStyle(event.target.value as 'clean' | 'cinematic' | 'bold')}
                >
                  <option value="clean">简洁</option>
                  <option value="cinematic">电影感</option>
                  <option value="bold">高对比</option>
                </select>
              </label>
              <label className="episode-post-toggle">
                <input
                  type="checkbox"
                  checked={bgmDucking}
                  onChange={(event) => setBgmDucking(event.target.checked)}
                />
                <span>对白时自动压低配乐</span>
              </label>
              <button
                type="button"
                disabled={!postSettingsDirty || working}
                onClick={() => void savePostSettings()}
              >
                {working ? '保存中…' : postSettingsDirty ? '保存后期设置' : '设置已保存'}
              </button>
            </div>
            <div className="episode-render-controls">
              <label>
                <span>平台画幅</span>
                <select
                  aria-label="平台画幅"
                  value={exportPreset}
                  disabled={working || enqueueingRender}
                  onChange={(event) => setExportPreset(event.target.value as RenderExportPreset)}
                >
                  <option value="vertical">抖音 / 快手 / 视频号 / Reels / Shorts · 竖屏</option>
                  <option value="landscape">B站 / YouTube · 横屏</option>
                  <option value="square">通用 · 方形</option>
                </select>
              </label>
              <label>
                <span>输出档位</span>
                <select
                  aria-label="输出档位"
                  value={renderQuality}
                  disabled={working || enqueueingRender}
                  onChange={(event) => setRenderQuality(event.target.value as RenderQualityProfile)}
                >
                  <option value="preview">预览版 · 480P 快速验证</option>
                  <option value="delivery">交付版 · 1080P 正式成片</option>
                </select>
              </label>
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
                className="is-secondary"
                disabled={!draft || working}
                onClick={() => void freeze()}
              >
                {working ? '处理中…' : '固化当前草稿'}
              </button>
              <button
                type="button"
                disabled={
                  !selectedVersion
                  || enqueueingRender
                  || selectedVersionBlockedCount > 0
                  || blockedClipCount > 0
                  || dialogueInspection.issues.length > 0
                }
                title={
                  selectedVersionBlockedCount > 0
                    ? '所选时间线版本仍有不可渲染镜头，请同步并固化新版本'
                    : blockedClipCount > 0
                    ? '仍有缺视频镜头，先同步或采用视频'
                    : dialogueInspection.issues[0]?.message
                }
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
                      <small>
                        {render.qualityProfile === 'delivery' ? '交付版' : '预览版'}
                        {' · '}
                        {render.exportPreset === 'landscape' ? '横屏' : render.exportPreset === 'square' ? '方形' : '竖屏'}
                      </small>
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
                        <a href={render.videoUrl ?? '#'} download>下载 MP4</a>
                        <a href={render.subtitleUrl ?? '#'} download>下载 SRT</a>
                        <a href={render.manifestUrl ?? '#'} download>下载 manifest</a>
                      </div>
                    )}
                    {render.status === 'succeeded' && (
                      <div className="episode-render-approval">
                        <span className={`is-${render.approvalStatus ?? 'draft'}`}>
                          {render.approvalStatus === 'approved'
                            ? '审核通过'
                            : render.approvalStatus === 'changes_requested'
                              ? '退回修改'
                              : render.approvalStatus === 'pending'
                                ? '待审核'
                                : '未提交审核'}
                        </span>
                        {(!render.approvalStatus || render.approvalStatus === 'changes_requested') && (
                          <button
                            type="button"
                            disabled={approvalWorkingId !== null}
                            onClick={() => void changeRenderApproval(render, 'request')}
                          >
                            提交审核
                          </button>
                        )}
                        {render.approvalStatus === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={approvalWorkingId !== null}
                              onClick={() => void changeRenderApproval(render, 'approve')}
                            >
                              审核通过
                            </button>
                            <button
                              type="button"
                              disabled={approvalWorkingId !== null}
                              onClick={() => void changeRenderApproval(render, 'request_changes')}
                            >
                              退回修改
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          )}

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
