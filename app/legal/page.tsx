import type { Metadata } from "next"

import VeyaBrandMark from "@/components/VeyaBrandMark"
import VeyaWordmark from "@/components/VeyaWordmark"

import "./legal.css"

export const metadata: Metadata = {
  title: "内测条款与隐私说明 · VeyaTV",
  description: "VeyaTV 内测版的数据处理、AI 内容规则、用户权利与举报说明。",
}

const NAV_ITEMS = [
  { id: "terms", label: "适用范围" },
  { id: "privacy", label: "数据处理" },
  { id: "ai", label: "AI 生成" },
  { id: "rules", label: "禁止内容" },
  { id: "rights", label: "用户权利" },
  { id: "report", label: "举报与联系" },
]

export default function LegalPage() {
  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <a className="legal-brand" href="/" aria-label="返回 VeyaTV 工作台">
          <span aria-hidden="true"><VeyaBrandMark /></span>
          <VeyaWordmark />
          <em>法务与隐私</em>
        </a>
        <a className="legal-back" href="/">
          <span aria-hidden="true">←</span>
          返回工作台
        </a>
      </header>

      <section className="legal-hero">
        <div>
          <p className="legal-kicker">BETA / LEGAL BASELINE</p>
          <h1>内测条款与隐私说明</h1>
          <p className="legal-lede">
            本说明适用于 VeyaTV 内测服务，解释项目数据如何处理、AI 产物如何使用，
            以及你可以如何管理、导出、删除数据和提交举报。
          </p>
        </div>
        <dl className="legal-facts" aria-label="版本信息">
          <div><dt>版本</dt><dd>内测 v1.0</dd></div>
          <div><dt>生效日期</dt><dd><time dateTime="2026-11-04">2026 年 11 月 4 日</time></dd></div>
          <div><dt>服务端部署</dt><dd>香港特别行政区</dd></div>
        </dl>
      </section>

      <div className="legal-layout">
        <nav className="legal-nav" aria-label="法务内容目录">
          <p>CONTENTS</p>
          {NAV_ITEMS.map((item, index) => (
            <a key={item.id} href={`#${item.id}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <article className="legal-document">
          <section id="terms">
            <header>
              <span>01</span>
              <h2>适用范围与用户协议</h2>
            </header>
            <div>
              <p>
                当你登录或使用 VeyaTV 内测版，即表示你已阅读并同意本说明。
                内测功能可能调整、暂停或删除，重要项目请通过项目导出功能自行保留备份。
              </p>
              <p>
                账号用于识别项目归属和同步创作内容，不得转让、出租或用于绕过平台限制。
                如果不同意本说明，请停止使用内测服务。
              </p>
            </div>
          </section>

          <section id="privacy">
            <header>
              <span>02</span>
              <h2>数据处理与隐私政策</h2>
            </header>
            <div>
              <p>
                平台会处理完成服务所必需的账号信息、项目标题、故事原文、创作意图、人物与分镜等结构化数据、
                AI 提示词、生成结果、项目快照、必要的运行状态和有限的分析事件。
              </p>
              <p>
                本地参考图默认只保存在当前设备，不会作为图片文件自动上传。
                服务端项目数据目前部署于香港特别行政区；为完成文本或图像生成、邮件发送和安全运行，
                必要内容可能由相应基础设施或模型服务商处理。平台不会出售你的项目内容，也不会将其公开展示。
              </p>
              <p>
                数据通常在账号存续期间保存，并在完成删除请求所需的合理期限内保留。
                你可以使用项目导出和账号管理功能，或通过 support@chenju.work 申请查询、更正、导出或删除数据。
              </p>
            </div>
          </section>

          <section id="ai">
            <header>
              <span>03</span>
              <h2>AI 生成与标识</h2>
            </header>
            <div>
              <p>
                人物定妆、场景图和关键帧等内容由 AI 模型生成，界面会显示“AI 生成”状态，
                项目导出可附带 ai-provenance.json，记录模型、服务来源和提示词信息。
              </p>
              <p>
                AI 输出可能不准确、不完整或不符合预期，发布前必须人工复核事实、版权、肖像权和目标平台规则。
                将内容发布到外部平台时，你应遵守该平台的 AI 内容标识要求。
              </p>
            </div>
          </section>

          <section id="rules">
            <header>
              <span>04</span>
              <h2>禁止内容与使用边界</h2>
            </header>
            <div>
              <p>
                不得使用本服务制作或传播违法、侵权、仇恨、骚扰、诈骗、色情、未成年人不当内容，
                也不得未经授权使用他人肖像、隐私信息、小说、剧本或其他受保护作品。
              </p>
              <p>
                你应确认对输入素材拥有必要权利，并对生成内容的使用后果负责。
                平台可结合模型服务商审核、人工抽查和用户举报，限制或移除明显违规内容。
              </p>
            </div>
          </section>

          <section id="rights">
            <header>
              <span>05</span>
              <h2>用户权利与数据控制</h2>
            </header>
            <div>
              <p>
                你可以在工作台查看和修改项目内容、导出项目包，并在账号管理中退出设备会话或删除账号数据。
                如需获取数据处理说明、提出异议或请求人工协助，请使用下方联系邮箱。
              </p>
              <p>
                请避免在故事、提示词或公开项目中填写身份证号、银行卡号、医疗信息等与服务无关的敏感个人信息。
              </p>
            </div>
          </section>

          <section id="report">
            <header>
              <span>06</span>
              <h2>举报、反馈与说明更新</h2>
            </header>
            <div>
              <p>
                发现侵权或不当内容时，请通过 <a href="/report">举报页面</a> 提交项目名称或链接、
                内容所在位置、问题类型和联系方式。内测团队会进行人工核查，并在核实后按你提供的联系方式反馈处理结果。
              </p>
              <p>
                本说明更新时会在本页更新版本和生效日期；重大变化会通过产品内提示或其他合理方式告知。
                联系邮箱：<a href="mailto:support@chenju.work">support@chenju.work</a>。
              </p>
            </div>
          </section>
        </article>
      </div>

      <footer className="legal-page-footer">
        <span>© 2026 VeyaTV</span>
        <a href="/report">内容举报</a>
        <a href="mailto:support@chenju.work">support@chenju.work</a>
      </footer>
    </main>
  )
}
