import type { Metadata } from 'next'
import ToolConsoleApp from '@/components/ToolConsoleApp'

export const metadata: Metadata = {
  title: '成剧 Agent App · Tool Console',
  robots: { index: false, follow: false },
}

export default function ToolConsoleDemoPage() {
  return <ToolConsoleApp />
}
