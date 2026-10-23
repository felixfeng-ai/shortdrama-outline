import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { THEME_BOOTSTRAP } from '@/lib/theme'

/*
  西文/数字用 Albert Sans（即梦同款思路：展示体 + 系统中文），
  中文仍走系统栈——不引中文字体，避免几 MB 的首屏成本。
  两个文件都只含 latin 子集，各约 32KB，自托管不依赖 Google。
*/
const latin = localFont({
  src: './fonts/albert-sans-latin.woff2',
  weight: '400 700',
  variable: '--font-latin',
  display: 'swap',
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'PingFang SC',
    'HarmonyOS Sans SC',
    'MiSans',
    'Microsoft YaHei',
    'sans-serif',
  ],
})

const mono = localFont({
  src: './fonts/jetbrains-mono-latin.woff2',
  weight: '400 500',
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  // 品牌名在前，描述性关键词留在后面——品牌要靠描述词才被搜到
  title: '成剧 VeyaFrame · 短剧与漫剧的 AI 分镜台',
  description:
    '一句想法，到大纲、分集、定妆与能直接出图的分镜提示词。先定创作意图，再逐镜统一角色与风格；图存在本机，不上传。',
  // 分享到微信/推特要有图，否则只是一行光秃秃的链接
  metadataBase: new URL(process.env.CHENGJU_SITE_URL || 'https://chenju.work'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: '成剧',
    locale: 'zh_CN',
    url: '/',
    title: '成剧 VeyaFrame · 短剧与漫剧的 AI 分镜台',
    description:
      '一句想法，到大纲、分集、定妆与能直接出图的分镜提示词。先定创作意图，再逐镜统一角色与风格；图存在本机，不上传。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'VeyaFrame 成剧 —— 一句想法，到能出图的分镜' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '成剧 VeyaFrame · 短剧与漫剧的 AI 分镜台',
    description:
      '一句想法，到大纲、分集、定妆与能直接出图的分镜提示词。先定创作意图，再逐镜统一角色与风格；图存在本机，不上传。',
    images: ['/og.png'],
  },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '成剧',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#13171A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      data-theme="h-deck"
      className={`${latin.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* 首屏就定好底色：否则会先闪一下默认色再跳成选中的那套 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="signal-desk">{children}</body>
    </html>
  )
}
