import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const target = path.resolve("public/og.png")
const browser = await chromium.launch({
  executablePath: fs.existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
})

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
          body {
            background: #08090a;
            color: #f0f2ef;
            font-family: "Microsoft YaHei", "PingFang SC", -apple-system, sans-serif;
          }
          .canvas {
            position: relative;
            width: 1200px;
            height: 630px;
            padding: 62px 72px 54px;
            background:
              linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) 0 0 / 96px 96px,
              linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px) 0 0 / 96px 96px,
              #08090a;
          }
          .topline {
            position: absolute;
            top: 0;
            left: 0;
            width: 1200px;
            height: 4px;
            background: #8dc8dc;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 30px;
            font-weight: 650;
          }
          .brand svg { width: 44px; height: 44px; }
          .brand small {
            color: #8b969d;
            font-size: 16px;
            font-weight: 500;
          }
          .eyebrow {
            margin-top: 76px;
            color: #8dc8dc;
            font-family: ui-monospace, "Cascadia Mono", monospace;
            font-size: 15px;
            letter-spacing: .04em;
          }
          h1 {
            max-width: 920px;
            margin: 18px 0 0;
            font-size: 66px;
            font-weight: 620;
            line-height: 1.16;
            letter-spacing: 0;
          }
          .lede {
            max-width: 830px;
            margin: 24px 0 0;
            color: #b0b5b5;
            font-size: 22px;
            line-height: 1.65;
          }
          .rule {
            position: absolute;
            left: 72px;
            right: 72px;
            bottom: 92px;
            height: 1px;
            background: rgba(255,255,255,.14);
          }
          .footer {
            position: absolute;
            left: 72px;
            right: 72px;
            bottom: 42px;
            display: flex;
            justify-content: space-between;
            color: #868d90;
            font-size: 16px;
          }
          .footer b { color: #b0b5b5; font-weight: 500; }
        </style>
      </head>
      <body>
        <main class="canvas">
          <div class="topline"></div>
          <div class="brand">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#101214"/>
              <rect x=".75" y=".75" width="62.5" height="62.5" rx="13.25" fill="none" stroke="#394247" stroke-width="1.5"/>
              <path d="M15 17 32 49 49 17" fill="none" stroke="#F0F2EF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>VeyaTV</span>
            <small>成剧</small>
          </div>
          <p class="eyebrow">AI SHORT DRAMA PRODUCTION</p>
          <h1>AI 短剧与漫剧<br/>生产平台</h1>
          <p class="lede">从一句想法、原文或剧本，到人物、分镜、镜头视频与按集成片。</p>
          <div class="rule"></div>
          <div class="footer">
            <span>跨集一致性 · 版本可追踪 · 生产可控</span>
            <b>chenju.work</b>
          </div>
        </main>
      </body>
    </html>
  `)
  await page.screenshot({ path: target, type: "png", fullPage: false })
  console.log(JSON.stringify({ screenshot: target }, null, 2))
} finally {
  await browser.close()
}
