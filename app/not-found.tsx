import Link from 'next/link'

// 品牌化的 404：框架默认页一出现，用户就知道「这站还没做完」。
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-5xl font-bold text-accent-700">404</p>
      <h1 className="font-serif text-xl font-semibold text-ink-900">这一页不在剧本里</h1>
      <p className="text-sm leading-relaxed text-ink-500">
        地址可能过期了，或者被合并进了别的页面。
      </p>
      <Link
        href="/"
        className="rounded-pill border border-surface-line px-5 py-2 text-sm text-ink-700
          transition-colors hover:border-accent-300 hover:text-accent-700"
      >
        回到工作台
      </Link>
    </main>
  )
}
