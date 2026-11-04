import type { Metadata } from "next"

import "../legal/legal.css"

export const metadata: Metadata = {
  title: "内容举报 · 成剧 VeyaFrame",
  description: "向成剧 VeyaFrame 内测团队举报侵权、违法或不当内容。",
}

export default function ReportPage() {
  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <a className="legal-brand" href="/" aria-label="返回成剧 VeyaFrame 工作台">
          <span aria-hidden="true">V</span>
          <b>VeyaFrame</b>
          <em>内容举报</em>
        </a>
        <a className="legal-back" href="/legal">
          <span aria-hidden="true">←</span>
          法务与隐私
        </a>
      </header>

      <section className="legal-hero">
        <div>
          <p className="legal-kicker">TRUST / REPORT</p>
          <h1>举报侵权或不当内容</h1>
          <p className="legal-lede">
            如果你发现项目、文字、图片或生成结果侵犯权利或违反内容规则，
            请提供足够的信息，让内测团队可以定位并人工核查。
          </p>
        </div>
        <dl className="legal-facts" aria-label="举报处理说明">
          <div><dt>处理方式</dt><dd>人工核查</dd></div>
          <div><dt>反馈路径</dt><dd>联系邮箱</dd></div>
          <div><dt>举报渠道</dt><dd>support@chenju.work</dd></div>
        </dl>
      </section>

      <div className="legal-layout">
        <nav className="legal-nav" aria-label="举报页导航">
          <p>REPORT GUIDE</p>
          <a href="/legal"><span>←</span>完整说明</a>
          <a href="#submit"><span>01</span>提交举报</a>
        </nav>

        <article className="legal-document">
          <section>
            <header>
              <span>01</span>
              <h2>请尽量包含以下信息</h2>
            </header>
            <div>
              <p>项目名称、项目链接或可访问的分享链接。</p>
              <p>涉及的文字、图片、场次或镜头所在位置。</p>
              <p>问题类型、权利依据或违规原因，以及你的联系方式。</p>
              <p>
                内测团队会进行人工核查，并在核实后通过你提供的联系方式反馈处理结果。
                请勿在举报邮件中提交与服务无关的敏感个人信息。
              </p>
            </div>
          </section>

          <section id="submit">
            <header>
              <span>02</span>
              <h2>发送举报</h2>
            </header>
            <div>
              <p>
                你可以直接发送邮件，也可以在站内项目页面使用现有举报入口。
                为便于跟进，请在邮件主题中写明项目名称和问题类型。
              </p>
              <a
                className="legal-report-action"
                href="mailto:support@chenju.work?subject=成剧内测内容举报"
              >
                发送举报邮件
              </a>
              <p>
                联系邮箱：<a href="mailto:support@chenju.work">support@chenju.work</a>
              </p>
            </div>
          </section>
        </article>
      </div>

      <footer className="legal-page-footer">
        <span>© 2026 VeyaFrame</span>
        <a href="/legal#privacy">隐私政策</a>
        <a href="/legal#rules">内容规则</a>
        <a href="/">返回工作台</a>
      </footer>
    </main>
  )
}
