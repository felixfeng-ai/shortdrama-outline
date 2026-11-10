import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/*
  西文/数字用 Inter，中文仍走系统栈。
  Inter 的字宽和标点更适合密集产品界面；中文不额外加载整包字体，
  避免几 MB 的首屏成本。两个字体文件都只保留 latin 子集并自托管。
*/
const latin = localFont({
  src: './fonts/inter-latin-variable.woff2',
  weight: '100 900',
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
  variable: '--font-code',
  display: 'swap',
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  // 品牌名在前，描述性关键词留在后面——品牌要靠描述词才被搜到
  title: 'VeyaTV · AI 短剧与漫剧生产平台',
  description:
    '从一句想法或已有剧本出发，完成人物、分集、场次、分镜、角色一致性、镜头视频、配音字幕与按集成片。外部导出和平台内成片并行，本地参考图默认不上传。',
  // 分享到微信/推特要有图，否则只是一行光秃秃的链接
  metadataBase: new URL(process.env.CHENGJU_SITE_URL || 'https://veyatv.com'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'VeyaTV',
    locale: 'zh_CN',
    url: '/',
    title: 'VeyaTV · AI 短剧与漫剧生产平台',
    description:
      '从想法或剧本到分镜、镜头视频与成片。角色、场景、首帧、TTS、BGM 和时间线在同一条项目链里，外部交付与平台内渲染并行。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'VeyaTV —— AI 短剧与漫剧生产平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VeyaTV · AI 短剧与漫剧生产平台',
    description:
      '从想法或剧本到分镜、镜头视频与成片。角色、场景、首帧、TTS、BGM 和时间线在同一条项目链里，外部交付与平台内渲染并行。',
    images: ['/og.png'],
  },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/veyatv-icon.svg', apple: '/veyatv-icon.svg' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VeyaTV',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0D0E0E',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      data-theme="h-deck"
      className={`${latin.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="signal-desk">{children}</body>
    </html>
  )
}
