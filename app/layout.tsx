import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // 品牌名在前，描述性关键词留在后面——品牌要靠描述词才被搜到
  title: '成剧 · AI 短剧大纲与分镜生成器',
  description: '一句话成剧。输入一个想法，生成核心人物 → 三幕大纲 → 分集剧情 → 视觉定妆 → 场次剧本 → 分镜提示词。角色图存在本机，不上传。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
