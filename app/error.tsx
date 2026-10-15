'use client'

// 运行期出错时的兜底页。默认页会把整站样式丢掉，用户看到的是「这站崩了」；
// 这里保留纸墨外观，并且给一个能继续用的出口（同时把错误打到控制台，方便排查）。
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ui] 未捕获的界面错误', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-4xl font-bold text-accent-700">出错了</p>
      <h1 className="font-serif text-xl font-semibold text-ink-900">这一步没能跑完</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-500">
        {error.message || '界面遇到了意外情况。已经生成的内容不会丢，可以重试这一步继续。'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn-primary px-5 py-2 text-sm"
        >
          重试
        </button>
        <a
          href="/"
          className="rounded-pill border border-surface-line px-5 py-2 text-sm text-ink-700
            transition-colors hover:border-accent-300 hover:text-accent-700"
        >
          回到工作台
        </a>
      </div>
    </main>
  )
}
