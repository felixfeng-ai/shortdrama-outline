import type { Metadata } from 'next'

import LoginPanel from '@/components/LoginPanel'

export const metadata: Metadata = {
  title: '登录 · 成剧 VeyaFrame',
  description: '继续当前短剧项目。角色、场景、分镜、镜头视频和时间线在同一条项目链里，换设备也能接着做。',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginPanel />
}
