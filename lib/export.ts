// 大纲导出：把三步结果拼成 Markdown，供「复制全部」和「导出 .md」使用。

import type { Act, Character, Episode } from './types'

/** 拼装完整大纲的 Markdown 文本 */
export function buildMarkdown(input: {
  idea: string
  characters: Character[]
  acts: Act[]
  episodes: Episode[]
}): string {
  const { idea, characters, acts, episodes } = input
  const lines: string[] = ['# 短剧大纲', '', `> 故事想法：${idea}`, '']

  if (characters.length > 0) {
    lines.push('## 一、核心人物', '')
    characters.forEach((c, i) => {
      lines.push(`### ${i + 1}. ${c.name}`, '')
      lines.push(`- **身份**：${c.identity}`)
      lines.push(`- **性格**：${c.personality}`)
      lines.push(`- **核心动机**：${c.motivation}`)
      lines.push(`- **人物弧光**：${c.arc}`, '')
    })
  }

  if (acts.length > 0) {
    lines.push('## 二、三幕大纲', '')
    acts.forEach((a) => {
      lines.push(`### ${a.title}`, '', a.summary, '')
      if (a.beats.length > 0) {
        lines.push('**关键情节点**', '')
        a.beats.forEach((b) => lines.push(`- ${b}`))
        lines.push('')
      }
    })
  }

  if (episodes.length > 0) {
    lines.push('## 三、分集剧情', '')
    episodes.forEach((e) => {
      lines.push(`### 第 ${e.number} 集 · ${e.title}`, '')
      lines.push(`**剧情梗概**：${e.synopsis}`, '')
      lines.push(`**结尾钩子**：${e.hook}`, '')
    })
  }

  return lines.join('\n').trimEnd() + '\n'
}

/** 复制到剪贴板。优先用 Clipboard API，失败时降级到 execCommand（兼容 http 环境） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续走降级方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const done = document.execCommand('copy')
    document.body.removeChild(textarea)
    return done
  } catch {
    return false
  }
}

/** 触发浏览器下载一个 .md 文件 */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
