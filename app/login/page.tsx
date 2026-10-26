import type { Metadata } from 'next'

import LoginPanel from '@/components/LoginPanel'

export const metadata: Metadata = {
  title: '登录 · 成剧 VeyaFrame',
  description: '继续当前短剧项目。角色、场次、分镜和创作意图在同一条项目链里，换设备也能接着写。',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginPanel />
}
