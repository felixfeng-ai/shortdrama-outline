import type { Metadata } from 'next'
import ArtifactCanvasApp from '@/components/ArtifactCanvasApp'

export const metadata: Metadata = {
  title: '成剧 Agent App · Artifact Canvas',
  robots: { index: false, follow: false },
}

export default function ArtifactCanvasDemoPage() {
  return <ArtifactCanvasApp />
}
