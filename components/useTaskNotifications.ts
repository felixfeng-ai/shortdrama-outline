'use client'

import { useEffect, useState } from 'react'

import {
  advanceTaskNotices,
  clearTaskNotices,
  type TaskNoticeState,
} from '@/lib/generation/notifications'
import type { GenerationTask } from '@/lib/generation/types'

const STORAGE_PREFIX = 'chengju:task-notices:'

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`
}

function readState(projectId: string): TaskNoticeState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TaskNoticeState>
    if (!parsed || typeof parsed !== 'object' || !parsed.statuses || !Array.isArray(parsed.unread)) {
      return null
    }
    return {
      statuses: parsed.statuses,
      unread: parsed.unread.filter((id): id is string => typeof id === 'string'),
    }
  } catch {
    return null
  }
}

function writeState(projectId: string, state: TaskNoticeState): void {
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state))
  } catch {
    // 隐私模式下未能持久化时，本次会话内的未读仍然可用。
  }
}

function notificationCopy(task: GenerationTask): { title: string; body: string } {
  if (task.status === 'failed') {
    return { title: '成剧 · 生成失败', body: '关键帧任务未完成，打开任务页查看并重试。' }
  }
  if (task.status === 'canceled') {
    return { title: '成剧 · 任务已停止', body: '关键帧任务已停止，打开任务页查看状态。' }
  }
  return { title: '成剧 · 关键帧已生成', body: '任务已完成，可以进入审片区查看新版本。' }
}

async function notifyTask(task: GenerationTask): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const copy = notificationCopy(task)
    await registration.showNotification(copy.title, {
      body: copy.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: `chengju-task-${task.id}`,
      data: { url: '/?app=tasks' },
    })
  } catch {
    // 系统通知是增强能力，失败不能影响任务页和角标。
  }
}

export function useTaskNotifications(
  projectId: string | null,
  tasks: GenerationTask[],
  readingTasks: boolean,
): number {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    setUnread(0)
    if (!projectId || tasks.length === 0) return
    const previous = readState(projectId)
    const result = advanceTaskNotices(previous, tasks)
    writeState(projectId, result.state)
    setUnread(result.state.unread.length)
    if (!readingTasks) {
      for (const task of result.notices) void notifyTask(task)
    }
  }, [projectId, readingTasks, tasks])

  useEffect(() => {
    if (!projectId || !readingTasks) return
    const state = readState(projectId)
    if (!state || state.unread.length === 0) {
      setUnread(0)
      return
    }
    writeState(projectId, clearTaskNotices(state))
    setUnread(0)
  }, [projectId, readingTasks])

  return unread
}
