import type { Metadata } from 'next'

import LoginPanel from '@/components/LoginPanel'
import '@/app/workspace-shell.css'

export const metadata: Metadata = {
  title: '登录 · VeyaFrame 成剧',
  description:
    '短剧创作工作台。人物、分集、场次、分镜和首帧都在同一个项目里，角色跨镜不走样，换设备也能继续。',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginPanel />
}
