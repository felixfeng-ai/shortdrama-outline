// 测试专用的 ESM 解析钩子。
//
// 为什么需要它：
//   1. 路由文件用的是 Next 的裸模块说明符 `next/server`（Next 14 的 package.json
//      没有 exports 映射，Node 原生解析找不到，只有 Next 打包器能解析）
//   2. 路由文件用 `@/lib/...` 路径别名（tsconfig 的 paths，Node 不认识）
//   3. TS 风格的「省略扩展名」导入（`@/lib/api` 实际指 api.ts）
//
// 这三条都只在 Next 运行时成立。为了让 `node --test` 能直接跑路由的导出函数，
// 这里在测试进程里补上解析规则，而不是去改业务代码——业务代码必须保持
// 对 Next 的标准写法。
import { pathToFileURL } from "node:url"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..")

/**
 * 测试进程固定把数据目录锚在仓库内的 data/。
 *
 * 为什么必须在这里兜底：db.ts 的 getDataDir() 读 CHENGJU_DATA_DIR，
 * 没设就退回 process.cwd()/data。而 `node --test` 在 Windows 上
 * 每个测试文件是一个独立子进程，既不一定继承到 shell 里临时设的变量，
 * process.cwd() 也不保证是仓库根，于是路径拼成 "undefined/xxx.db"——
 * 每跑一次测试就在仓库根建一个 undefined/ 目录、散落几十个临时库文件。
 *
 * 这里有两个兜底点：本文件顶层（钩子所在进程）+ resolve 钩子内（每个
 * 测试子进程加载模块时都会经过）。两处都写，才能覆盖 --test 的进程模型。
 */
function pinDataDir() {
  if (!process.env.CHENGJU_DATA_DIR) {
    process.env.CHENGJU_DATA_DIR = path.join(ROOT, "data")
  }
  return process.env.CHENGJU_DATA_DIR
}

pinDataDir()

/** 把无扩展名的路径解析成真实文件：a -> a.ts / a.tsx / a/index.ts ... */
function resolveFile(base) {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  for (const c of [`${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`]) {
    if (fs.existsSync(c)) return c
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  // 每个子进程加载任何模块前都会先经过这里，确保数据目录一定被钉住
  pinDataDir()

  if (specifier === "next/server") {
    return nextResolve(pathToFileURL(path.join(ROOT, "node_modules/next/server.js")).href, context)
  }
  if (specifier.startsWith("@/")) {
    const target = resolveFile(path.join(ROOT, specifier.slice(2)))
    if (target) return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}