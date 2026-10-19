// 三套底色的切换（见 globals.css 的 :root / [data-theme]）。
//
// 为什么要做成可切换而不是选一套写死：底色这种"整体气质"的决策，
// 光靠描述和截图争论没有结论——同一份界面、同一份数据，来回切着看，
// 几分钟就能定。定下来之后把另外两套删掉即可（只删 CSS 变量块）。

export type ThemeId = 'h-deck' | 'paper' | 'paper-light' | 'neutral' | 'paper-light-dark-ai'

export const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: 'h-deck', label: '双舱', hint: 'H 方向：暖白工作面 + 近墨产出舱（当前方案）' },
  { id: 'paper', label: '纸墨', hint: '暖米纸，气质最像稿纸（原始方案）' },
  { id: 'paper-light', label: '提白', hint: '保留暖感、压掉黄，接近 Notion / Linear 那种浅底' },
  { id: 'neutral', label: '冷白', hint: '中性偏冷的浅灰白，最像常见的线上产品' },
  { id: 'paper-light-dark-ai', label: '提白×浓墨', hint: '提白工作面 + 暖墨 AI 层：放映厅、场记、提问条、生成中' },
]

export const DEFAULT_THEME: ThemeId = 'h-deck'

// v2：H 双舱上线后，旧版存下来的纸墨/冷白不再自动生效，
// 否则老用户会以旧配色看到新骨架，像是样式没加载完。
const STORAGE_KEY = 'chengju:theme:v2'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

/**
 * 方向已定：双舱是唯一生效的主题。
 *
 * 这里刻意忽略 URL 参数与旧本地记录——H 上线后，旧链接里的 ?theme=paper
 * 或浏览器里存着的纸墨，会让新骨架套上旧配色（米色纸纹 + 朱砂按钮），
 * 看起来就像"样式没加载完"。要做对比请用 design-previews 里的样机。
 */
export function resolveTheme(_search: string | null, _stored: string | null): ThemeId {
  return DEFAULT_THEME
}

/** 把主题写到 <html data-theme>，并记住它、同步 URL 参数（方便直接甩三个链接对比） */
export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = id
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 隐私模式下写不了，忽略即可
  }
  const url = new URL(window.location.href)
  if (url.searchParams.get('theme') !== id) {
    url.searchParams.set('theme', id)
    window.history.replaceState(null, '', url.toString())
  }
}

/** 首屏在 React 起来之前用：从 URL 或本地记录取，避免先闪一下默认色 */
export const THEME_BOOTSTRAP = `(function(){try{
document.documentElement.dataset.theme='${DEFAULT_THEME}';
}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})()`
