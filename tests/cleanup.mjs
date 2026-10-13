// 测试收尾钩子：把这次跑出来的临时库文件删掉。
//
// 为什么需要：assets/graph 两个测试要真实落盘（WAL + 外键这些行为必须用真库验），
// 于是每个用例产出一个 .db。库里全是随机测试数据，没有任何保留价值，
// 但它们会让 data/ 越跑越乱、也会混进「资产库备份」里。
//
// 关键点：这里**不能**只读 process.env.CHENGJU_DATA_DIR——测试子进程里
// 它可能是空的（正因为如此才会有 undefined/ 那个老问题）。所以目录自己算，
// 与 db.ts 的兜底口径保持一致：env 有值就用，否则用「本文件上一级目录」当仓库根。
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function resolveDataDir() {
  const configured = process.env.CHENGJU_DATA_DIR?.trim()
  if (configured && configured !== "undefined") return configured
  return path.join(repoRoot, "data")
}

function cleanup() {
  const tmp = path.join(resolveDataDir(), "tmp")
  try {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    // 清理失败不该影响测试结论
  }
}

// 两个时机都挂上：正常结束走 exit，被信号中断也尽量收干净
process.on("exit", cleanup)
process.on("SIGINT", () => { cleanup(); process.exit(130) })
process.on("SIGTERM", () => { cleanup(); process.exit(143) })