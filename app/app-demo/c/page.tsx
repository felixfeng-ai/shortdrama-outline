import type { Metadata } from 'next'
import AmbientDirectorApp from '@/components/AmbientDirectorApp'

export const metadata: Metadata = {
  title: '成剧 Agent App · Ambient Director',
  robots: { index: false, follow: false },
}

export default function AmbientDirectorDemoPage() {
  return <AmbientDirectorApp />
}
