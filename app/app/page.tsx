import type { Metadata } from "next"
import Link from "next/link"

import { resolveRuntimeMobileRelease } from "@/lib/mobile-release-store"

import "./app-download.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "成剧 App 内测 · VeyaFrame",
  description: "成剧 VeyaFrame 原生 App 小范围内测安装、测试路线与反馈入口。",
  robots: {
    index: false,
    follow: false,
  },
}

export default function AppDownloadPage() {
  const release = resolveRuntimeMobileRelease()

  return (
    <main className="app-download-page">
      <header className="app-download-topbar">
        <Link className="app-download-brand" href="/">
          <span>V</span>
          <b>成剧</b>
          <em>VEYAFRAME</em>
        </Link>
        <nav aria-label="内测页面导航">
          <Link href="/docs">使用教程</Link>
          <Link href="/app" aria-current="page">内测安装</Link>
          <Link href="/legal">隐私说明</Link>
        </nav>
        <span className="app-download-badge">INTERNAL PREVIEW</span>
      </header>

      <section className="app-download-hero">
        <div className="app-download-hero-copy">
          <p className="app-download-kicker">
            {release.releasedAt ? `更新于 ${release.releasedAt}` : "小范围分享内测"}
          </p>
          <h1>把最新的成剧，装进手机里。</h1>
          <p className="app-download-lede">
            当前版本用于验证 Agent、语音、图像与视频生成、视频审片和现场检查。
            Android 可直接安装 APK；iOS 需要 TestFlight 或已登记设备。
          </p>
          <div className="app-download-meta">
            <span>版本 {release.version}</span>
            <span>原生 Expo App</span>
            <span>账号与 Web 同步</span>
          </div>
          <div className="app-download-hero-actions">
            <a
              className="app-download-primary"
              href={release.android.url}
              rel="noreferrer"
              target="_blank"
            >
              {release.android.direct ? "下载 Android 内测包" : "打开 EAS Android 构建"}
              <span aria-hidden="true">↗</span>
            </a>
            <a
              className="app-download-secondary app-download-hero-ios"
              href={release.ios.url}
              rel="noreferrer"
              target="_blank"
            >
              {release.ios.direct ? "打开 iOS 内测邀请" : "查看 iOS 安装方式"}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <aside className="app-download-status" aria-label="内测版本状态">
          <span className="app-download-status-dot" />
          <div>
            <b>正在分发给测试者</b>
            <p>未经过应用商店审核，仅用于朋友、面试官和团队验证。</p>
          </div>
        </aside>
      </section>

      <section className="app-download-install" aria-labelledby="install-title">
        <div className="app-download-section-head">
          <span>01</span>
          <div>
            <h2 id="install-title">安装内测包</h2>
            <p>先确认手机系统，再选择对应入口。下载链接只接受 HTTPS。</p>
          </div>
        </div>

        <div className="app-download-platforms">
          <article className="app-download-platform">
            <div className="app-download-platform-head">
              <span>Android</span>
              <em>{release.android.direct ? "APK 可用" : "前往构建记录"}</em>
            </div>
            <h3>直接安装最新 APK</h3>
            <p>
              首次安装需要在系统浏览器中允许“安装未知应用”。
              华为、小米等机型请用浏览器打开本页，不要只依赖相机扫码预览。
            </p>
            <a
              className="app-download-primary"
              href={release.android.url}
              rel="noreferrer"
              target="_blank"
            >
              {release.android.direct ? "下载 Android 内测包" : "打开 EAS Android 构建"}
              <span aria-hidden="true">↗</span>
            </a>
          </article>

          <article className="app-download-platform">
            <div className="app-download-platform-head">
              <span>iOS</span>
              <em>{release.ios.direct ? "邀请可用" : "需登记设备"}</em>
            </div>
            <h3>TestFlight 或 Ad Hoc</h3>
            <p>
              iOS 不能直接安装 APK。TestFlight 使用邀请链接；Ad Hoc 需要先把设备
              UDID 加入签名，再用对应设备打开安装链接。
            </p>
            <a
              className="app-download-secondary"
              href={release.ios.url}
              rel="noreferrer"
              target="_blank"
            >
              {release.ios.direct ? "打开 iOS 内测邀请" : "查看 EAS iOS 构建"}
              <span aria-hidden="true">↗</span>
            </a>
          </article>
        </div>
      </section>

      <section className="app-download-route" aria-labelledby="route-title">
        <div className="app-download-section-head">
          <span>02</span>
          <div>
            <h2 id="route-title">第一轮测试路线</h2>
            <p>用同一个邮箱登录 Web 和 App，确认数据确实来自同一项目。</p>
          </div>
        </div>
        <ol>
          <li><b>邮箱登录</b><span>在 Web 与 App 使用同一个邮箱验证码。</span></li>
          <li><b>示例项目</b><span>首次进入选择示例项目，避免从空项目开始。</span></li>
          <li><b>问 Agent</b><span>询问当前待办，确认回答引用真实镜头和任务。</span></li>
          <li><b>生成与草片</b><span>检查预算卡、首帧阻断和整集草片状态。</span></li>
          <li><b>视频审片</b><span>播放、拖动、切换版本、采用并下载一次。</span></li>
          <li><b>内测反馈</b><span>从“我的”进入内测反馈，附上当前页面和问题描述。</span></li>
        </ol>
      </section>

      <section className="app-download-notes" aria-labelledby="notes-title">
        <div className="app-download-section-head">
          <span>03</span>
          <div>
            <h2 id="notes-title">这个版本重点验证</h2>
            <p>功能已经存在，但真机兼容性和完整闭环仍需测试者反馈。</p>
          </div>
        </div>
        <ul>
          {release.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>

      <footer className="app-download-footer">
        <div>
          <b>遇到问题？</b>
          <p>在 App 的“我的 → 内测反馈”提交问题，正文和项目内容不会被自动上报。</p>
        </div>
        <Link href="/docs">查看完整使用教程 <span aria-hidden="true">→</span></Link>
      </footer>
    </main>
  )
}
