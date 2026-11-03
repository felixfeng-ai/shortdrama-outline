import type { Metadata } from 'next'
import SkillCatalog from '@/components/SkillCatalog'
import './skills.css'

export const metadata: Metadata = {
  title: 'Skill 创作入口 · 成剧',
  description: '从小说改编、故事审校到分镜连续性和平台交付，用专业 Skill 启动短剧创作。',
}

export default function SkillsPage() {
  return <SkillCatalog />
}
