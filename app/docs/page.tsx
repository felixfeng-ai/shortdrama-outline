import type { Metadata } from 'next'

import DocsGuide from '@/components/DocsGuide'
import './docs.css'

export const metadata: Metadata = {
  title: '成剧使用教程 · VeyaFrame',
  description: '从项目创建、六步创作、首帧、镜头视频、TTS、BGM 到时间线成片和外部导出的完整教程。',
}

export default function DocsPage() {
  return <DocsGuide />
}
