export const metadata = {
  title: "内容举报 · 成剧",
  description: "向成剧内测团队举报侵权、违法或不当内容。",
}

export default function ReportPage() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-2xl px-6 py-12 text-ink-800">
      <a href="/" className="text-sm text-ink-500 hover:text-ink-800">← 返回工作台</a>
      <p className="mt-10 font-mono text-xs tracking-wide text-accent-700">TRUST / REPORT</p>
      <h1 className="mt-3 text-3xl font-semibold">举报侵权或不当内容</h1>
      <p className="mt-5 text-sm leading-7 text-ink-600">
        请说明项目名称或链接、涉及的文字或图片、问题类型和你的联系方式。内测团队会人工核查并处置。
      </p>
      <a
        className="mt-8 inline-flex min-h-11 items-center rounded-pill border border-accent-300 px-5 text-sm font-medium text-accent-800"
        href="mailto:support@chenju.work?subject=成剧内测内容举报"
      >
        发送举报邮件
      </a>
      <p className="mt-4 text-xs text-ink-400">举报邮箱：support@chenju.work</p>
    </main>
  )
}
