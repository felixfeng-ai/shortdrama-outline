// 画布详情的搜索、待补筛选与分页。
// 纯函数独立出来，长项目行为不依赖浏览器环境，也能直接做回归测试。

export interface CanvasSearchItem {
  title: string
  meta?: string
  note?: string
  missing?: boolean
}

export function filterCanvasItems<T extends CanvasSearchItem>(
  items: readonly T[],
  query: string,
  issuesOnly: boolean,
): T[] {
  const needle = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (issuesOnly && !item.missing) return false
    if (!needle) return true
    return [item.title, item.meta, item.note]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle)
  })
}

export function paginateCanvasItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number; total: number } {
  const size = Math.max(1, Math.floor(pageSize))
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage)))
  return {
    items: items.slice(page * size, page * size + size),
    page,
    pageCount,
    total,
  }
}
