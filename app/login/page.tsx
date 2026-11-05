import type { Metadata } from 'next'

import LoginPanel from '@/components/LoginPanel'
import '@/app/workspace-shell.css'

export const metadata: Metadata = {
  title: '登录 · VeyaFrame 成剧',
  description:
    'AI 负责拆解和执行，人的判断负责 Canon、情绪与审美。角色跨镜一致，确认后写入新版本，换设备也能继续同一个项目。',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginPanel />
}
