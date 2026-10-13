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

const ROOT = process.cwd()

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
  if (specifier === "next/server") {
    return nextResolve(pathToFileURL(path.join(ROOT, "node_modules/next/server.js")).href, context)
  }
  if (specifier.startsWith("@/")) {
    const target = resolveFile(path.join(ROOT, specifier.slice(2)))
    if (target) return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
