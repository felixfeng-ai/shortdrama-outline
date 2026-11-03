export const metadata = {
  title: "隐私、条款与内容规则 · 成剧",
  description: "成剧内测版的隐私、使用条款、AI 内容标识和内容规则说明。",
}

export default function LegalPage() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-6 py-12 text-ink-800">
      <a href="/" className="text-sm text-ink-500 hover:text-ink-800">← 返回工作台</a>
      <p className="mt-10 font-mono text-xs tracking-wide text-accent-700">BETA / LEGAL BASELINE</p>
      <h1 className="mt-3 text-3xl font-semibold">内测版隐私、条款与内容规则</h1>
      <p className="mt-4 text-sm leading-7 text-ink-500">
        这是首批内测的最低限度说明，不替代正式法律审定的服务协议与隐私政策。
      </p>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">隐私与数据保存</h2>
        <p className="text-sm leading-7">
          账号、项目快照、创作意图、结构化决策、Canon 和项目原文保存在服务端项目空间。本地参考图默认只存在当前设备，
          不会作为图片文件上传；项目导出包可由用户自行带走。
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">AI 生成与标识</h2>
        <p className="text-sm leading-7">
          定妆图、场景图和关键帧由 AI 模型生成，界面会标记“AI 生成”，项目导出会附带
          <code className="mx-1 rounded bg-black/5 px-1">ai-provenance.json</code>
          记录模型、Provider 和提示词来源。用户将产物发布到外部平台时，应遵守目标平台的 AI 内容标识要求。
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">内容规则</h2>
        <p className="text-sm leading-7">
          不得使用本服务制作违法、侵权、仇恨、骚扰、诈骗、未经同意的他人肖像或隐私内容，也不得提交无权改编的小说和剧本。
          内测阶段仍需结合供应商审核、人工抽查和用户举报持续处置异常内容。
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">用户权利与举报</h2>
        <p className="text-sm leading-7">
          用户应确认自己拥有输入素材的使用权。发现侵权或不当内容时，请通过
          <a className="mx-1 underline" href="/report">举报页面</a>
          提交项目链接、内容和原因。
        </p>
      </section>
    </main>
  )
}
