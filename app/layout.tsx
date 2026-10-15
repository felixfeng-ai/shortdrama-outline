import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // 品牌名在前，描述性关键词留在后面——品牌要靠描述词才被搜到
  title: '成剧 · 短剧与漫剧的 AI 分镜台',
  description: '一句想法，到大纲、分集与能直接出图的提示词。六步工作流：核心人物 → 三幕大纲 → 分集剧情 → 视觉定妆 → 场景 → 分镜提示词。角色图存在本机，不上传。',
  // 分享到微信/推特要有图，否则只是一行光秃秃的链接
  metadataBase: new URL(process.env.CHENGJU_SITE_URL || 'https://chenju.work'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: '成剧',
    locale: 'zh_CN',
    url: '/',
    title: '成剧 · 短剧与漫剧的 AI 分镜台',
    description: '一句想法，到大纲、分集与能直接出图的提示词。图存在本机，不上传。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '成剧 —— 一句想法，到能直接出图的分镜提示词' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '成剧 · 短剧与漫剧的 AI 分镜台',
    description: '一句想法，到大纲、分集与能直接出图的提示词。图存在本机，不上传。',
    images: ['/og.png'],
  },
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
