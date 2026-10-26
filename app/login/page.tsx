import type { Metadata } from 'next'

import LoginPanel from '@/components/LoginPanel'

export const metadata: Metadata = {
  title: '登录 · 成剧 VeyaFrame',
  description: '登录成剧，把当前项目安全地同步到 Web、PWA 与 App。',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginPanel />
}
