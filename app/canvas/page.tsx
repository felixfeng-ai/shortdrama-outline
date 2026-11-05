import type { Metadata } from 'next'

import FullscreenCanvas from '@/components/FullscreenCanvas'
import '@/app/workspace-shell.css'

export const metadata: Metadata = {
  title: '全屏编排画布 · VeyaFrame',
  description: '在独立窗口中拖拽、缩放、连线并编辑当前项目的编排画布。',
  robots: { index: false, follow: false },
}

export default function CanvasPage() {
  return <FullscreenCanvas />
}
