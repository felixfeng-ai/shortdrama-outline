import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI 短剧大纲生成器',
  description: '输入一个想法，三步生成完整短剧大纲：核心人物 → 三幕大纲 → 分集剧情',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
