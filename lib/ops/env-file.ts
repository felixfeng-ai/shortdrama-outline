export function applyEnvValues(
  content: string,
  values: Record<string, string | undefined>,
): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n"
  const lines = content.split(/\r?\n/)
  const keys = Object.keys(values).filter((key) => {
    const value = values[key]?.trim()
    return Boolean(value)
  })
  const remaining = new Set(keys)

  const updated = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)\s*=/)
    if (!match || !remaining.has(match[1])) return line
    remaining.delete(match[1])
    return `${match[1]}=${JSON.stringify(values[match[1]]!.trim())}`
  })

  for (const key of keys) {
    if (remaining.has(key)) updated.push(`${key}=${JSON.stringify(values[key]!.trim())}`)
  }
  return `${updated.join(newline).replace(/(?:\r?\n)+$/, "")}${newline}`
}
