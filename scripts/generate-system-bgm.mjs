import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(path.join(process.cwd(), "package.json"))
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path
const outputDir = path.join(process.cwd(), "public", "audio", "bgm", "system")
const force = process.argv.includes("--force")

const tracks = [
  ["rain-mystery", 55, 82.41, "minor", 72],
  ["iron-gate", 61.74, 92.5, "minor", 78],
  ["silent-deal", 65.41, 98, "minor", 92],
  ["countdown-pulse", 73.42, 110, "minor", 112],
  ["old-building-echo", 49, 73.42, "minor", 68],
  ["emotional-crack", 58.27, 87.31, "minor", 64],
  ["warm-memory", 65.41, 98, "major", 70],
  ["home-light", 69.3, 103.83, "major", 76],
  ["reunion", 73.42, 110, "major", 82],
  ["quiet-approach", 77.78, 116.54, "major", 88],
  ["before-farewell", 55, 82.41, "minor", 60],
  ["empty-room", 46.25, 69.3, "minor", 56],
  ["reversal-moment", 82.41, 123.47, "minor", 104],
  ["against-wind", 87.31, 130.81, "major", 118],
  ["evidence", 69.3, 103.83, "minor", 96],
  ["city-drive", 73.42, 110, "minor", 126],
  ["light-comedy", 92.5, 138.59, "major", 110],
  ["awkward-moment", 98, 146.83, "major", 116],
  ["hope-rises", 77.78, 116.54, "major", 90],
  ["ending-afterglow", 61.74, 92.5, "major", 74],
]

function chord(root, mode) {
  const third = mode === "major" ? 1.26 : 1.19
  return [root, root * third, root * 1.5]
}

function render([name, root, melody, mode, bpm]) {
  const output = path.join(outputDir, `${name}.mp3`)
  if (!force && fs.existsSync(output) && fs.statSync(output).size > 10_000) {
    console.log(`skip ${name}`)
    return
  }
  const [a, b, c] = chord(root, mode)
  const beat = 60 / bpm
  const pulse = `if(lt(mod(t\\,${beat.toFixed(4)})\\,0.11)\\,0.07*sin(2*PI*${melody.toFixed(2)}*t)\\,0)`
  const expression = [
    `0.055*sin(2*PI*${a.toFixed(2)}*t)`,
    `0.038*sin(2*PI*${b.toFixed(2)}*t)`,
    `0.032*sin(2*PI*${c.toFixed(2)}*t)`,
    `0.018*sin(2*PI*${(root / 2).toFixed(2)}*t)`,
    pulse,
  ].join("+")
  const args = [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=${expression}:s=44100:d=45`,
    "-af",
    "lowpass=f=5200,loudnorm=I=-12:TP=-2:LRA=7,aecho=0.78:0.55:90|180:0.22|0.12,afade=t=in:st=0:d=2.5,afade=t=out:st=41.5:d=3.5",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "96k",
    output,
  ]
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", windowsHide: true })
  if (result.status !== 0) {
    throw new Error(`generate ${name} failed: ${result.stderr}`)
  }
  console.log(`generated ${name}`)
}

fs.mkdirSync(outputDir, { recursive: true })
for (const track of tracks) render(track)
