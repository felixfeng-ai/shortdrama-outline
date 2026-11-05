import type { Metadata } from 'next'

import DocsGuide from '@/components/DocsGuide'
import './docs.css'

export const metadata: Metadata = {
  title: '成剧使用教程 · VeyaFrame',
  description:
    '从总览、创作、画布三种工作面，到六步创作、镜头视频、时间线成片、全屏画布和手机 App 跨端的完整教程。',
}

export default function DocsPage() {
  return <DocsGuide />
}
