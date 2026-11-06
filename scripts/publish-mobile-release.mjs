import fs from "node:fs"
import path from "node:path"

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : ""
}

function readNotes() {
  const inline = readOption("--notes")
  const repeated = process.argv
    .flatMap((value, index) => value === "--note" ? [process.argv[index + 1] ?? ""] : [])
  return [...inline.split("|"), ...repeated]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function validHttps(value) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const configuredFile = process.env.CHENGJU_APP_RELEASE_FILE?.trim()
const dataDir = process.env.CHENGJU_DATA_DIR?.trim() || path.join(process.cwd(), "data")
const target = configuredFile && configuredFile !== "undefined"
  ? path.resolve(configuredFile)
  : path.join(dataDir, "app-release.json")

let previous = {}
try {
  previous = JSON.parse(fs.readFileSync(target, "utf8"))
} catch {
  previous = {}
}
if (!previous || typeof previous !== "object" || Array.isArray(previous)) previous = {}

const version = readOption("--version") || previous.version || ""
const androidUrl = readOption("--android-url") || previous.androidUrl || ""
const iosUrl = readOption("--ios-url") || previous.iosUrl || ""
const releasedAt = readOption("--released-at") || new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.CHENGJU_TZ?.trim() || "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date())
const notes = readNotes()

if (!/^[0-9A-Za-z._-]{1,32}$/.test(version)) {
  throw new Error("缺少或非法的 --version")
}
if (!validHttps(androidUrl)) {
  throw new Error("--android-url 必须是 HTTPS 地址")
}
if (iosUrl && !validHttps(iosUrl)) {
  throw new Error("--ios-url 必须是 HTTPS 地址")
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(releasedAt)) {
  throw new Error("--released-at 必须是 YYYY-MM-DD")
}

const release = {
  version,
  releasedAt,
  androidUrl,
  ...(iosUrl ? { iosUrl } : {}),
  notes: notes.length > 0 ? notes : Array.isArray(previous.notes) ? previous.notes : [],
}

fs.mkdirSync(path.dirname(target), { recursive: true })
const temporary = `${target}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(release, null, 2)}\n`, "utf8")
fs.renameSync(temporary, target)
console.log(`App release updated: ${target}`)
console.log(JSON.stringify(release, null, 2))
