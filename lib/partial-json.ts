// 从「可能还没接收完」的 JSON 文本里，尽量多地抠出已经闭合的数组元素。
//
// 为什么需要它：流式生成时模型吐的是 {"episodes":[{...},{...}]} 的字节流。
// 直接把这串字节显示给用户没有意义——用户看到的是 JSON 语法而不是剧情。
// 所以每收到一块就在缓冲区里找出「已经写完整的对象」，交给前端渲染成卡片，
// 真正做到一集一集地出现。
//
// 约定：元素必须已经闭合（括号配平）且能通过 JSON.parse，才认为可用。
// 半截的对象一律丢弃，等下一块数据补齐。

/**
 * 定位承载元素的数组起点。
 * 优先找 "<key>" 后面的 [；key 还没出现时退化成找第一个 [——
 * 模型偶尔会把数组包在别的外层结构里，这里不做严格假设。
 */
function findArrayStart(text: string, key: string): number {
  const keyIndex = text.indexOf(`"${key}"`)
  if (keyIndex !== -1) {
    const bracket = text.indexOf('[', keyIndex + key.length + 2)
    // key 出现了但 [ 还没流过来：先不猜，等下一块数据
    return bracket
  }
  return text.indexOf('[')
}

/**
 * 扫描 text，返回其中已经闭合、且解析成功的数组元素。
 *
 * 每次都基于完整缓冲区重新扫描：分集总量只有几 KB，重扫的开销可以忽略，
 * 换来的是不用维护「上次扫到哪、字符串有没有闭合」这类跨调用的状态——
 * 那种状态一旦算错就会静默漏元素，而重扫天然是幂等的。
 */
export function extractCompleteItems(
  text: string,
  key = 'episodes',
): { items: unknown[]; arrayFound: boolean } {
  const start = findArrayStart(text, key)
  if (start === -1) return { items: [], arrayFound: false }

  const items: unknown[] = []
  let depth = 0 // 当前嵌套深度
  let inString = false // 是否在字符串字面量里（字符串里的括号不算数）
  let escaped = false // 上一个字符是否是反斜杠转义
  let itemStart = -1 // 当前元素的起始下标

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{' || ch === '[') {
      if (depth === 0) itemStart = i
      depth++
      continue
    }

    if (ch === '}' || ch === ']') {
      // 深度为 0 时遇到的收尾括号就是数组自己，说明元素已经全部流完
      if (depth === 0) break
      depth--
      if (depth === 0 && itemStart !== -1) {
        try {
          items.push(JSON.parse(text.slice(itemStart, i + 1)))
        } catch {
          // 闭合了却解析不了，说明这块内容本身有问题。
          // 不在这里报错——流结束时路由还会用完整缓冲区整体解析一次兜底
        }
        itemStart = -1
      }
    }
  }

  return { items, arrayFound: true }
}
