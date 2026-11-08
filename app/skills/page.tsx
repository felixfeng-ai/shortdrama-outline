import type { Metadata } from 'next'
import SkillCatalog from '@/components/SkillCatalog'
import './skills.css'

export const metadata: Metadata = {
  title: '创作技能库 · VeyaTV · 成剧',
  description: '从小说改编、故事审校到分镜连续性和成片交付，用可确认的创作技能启动短剧生产。',
}

export default function SkillsPage() {
  return <SkillCatalog />
}
