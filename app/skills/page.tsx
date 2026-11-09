import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { withWorkspaceModeQuery } from '@/lib/app-nav'

export const metadata: Metadata = {
  title: '创作技能库 · VeyaTV',
  description: '从小说改编、故事审校到分镜连续性和成片交付，用可确认的创作技能启动短剧生产。',
}

type SkillsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const values = await searchParams
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }

  const query = params.toString()
  redirect(`/${withWorkspaceModeQuery(query ? `?${query}` : '', 'create')}`)
}
