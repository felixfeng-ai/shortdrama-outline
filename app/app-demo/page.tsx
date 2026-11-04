import type { Metadata } from 'next'
import DoubaoStyleAgentApp from '@/components/DoubaoStyleAgentApp'

export const metadata: Metadata = {
  title: '成剧 Agent App · Visual Demo',
  robots: { index: false, follow: false },
}

export default function AppDemoPage() {
  return <DoubaoStyleAgentApp />
}
