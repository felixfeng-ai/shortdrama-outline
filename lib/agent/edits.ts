export type EditTargetStatus = "current" | "drift" | "missing"

export interface TextEditApplyResult<T> {
  status: EditTargetStatus
  items: T[]
  message: string
}

export interface TextEditInput<T> {
  targetId: string
  field: string
  expectedText: string
  newText: string
  getId: (item: T) => string
  label: string
}

/** 只折叠换行和首尾空白；正文内部空格与标点变化都必须算漂移。 */
export function normalizeEditText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
}

/**
 * 判断确认时看到的目标是否仍是提案生成时看到的那一份。
 * undefined 表示目标或字段已不存在；不能把它和空字符串混为一谈。
 */
export function inspectEditTarget(
  currentText: string | null | undefined,
  expectedText: string,
): EditTargetStatus {
  if (currentText === undefined || currentText === null) return "missing"
  return normalizeEditText(currentText) === normalizeEditText(expectedText)
    ? "current"
    : "drift"
}

/**
 * 按稳定 ID 写回一个文本字段，并在写入前检查提案生成时的原文。
 * 漂移和缺失都返回原数组的拷贝，绝不静默覆盖用户后来的修改。
 */
export function applyTextFieldEdit<T>(
  items: readonly T[],
  input: TextEditInput<T>,
): TextEditApplyResult<T> {
  const index = items.findIndex((item) => input.getId(item) === input.targetId)
  if (index < 0) {
    return {
      status: "missing",
      items: items.slice(),
      message: `目标已不存在：${input.label}。本次没有写入。`,
    }
  }

  const record = items[index] as Record<string, unknown>
  const status = inspectEditTarget(
    typeof record[input.field] === "string" ? String(record[input.field]) : undefined,
    input.expectedText,
  )
  if (status === "missing") {
    return {
      status,
      items: items.slice(),
      message: `目标字段已不存在：${input.label}。本次没有写入。`,
    }
  }
  if (status === "drift") {
    return {
      status,
      items: items.slice(),
      message: `目标已改动：${input.label}。这条建议基于旧内容，未覆盖当前文本，请让场记重新读取。`,
    }
  }

  const next = items.map((item, itemIndex) =>
    itemIndex === index
      ? { ...(item as Record<string, unknown>), [input.field]: input.newText } as T
      : item
  )
  return {
    status,
    items: next,
    message: `已更新${input.label}。`,
  }
}
