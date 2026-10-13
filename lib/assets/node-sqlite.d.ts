// node:sqlite 的最小类型声明。
//
// 为什么需要它：@types/node 停留在 v20，而 node:sqlite 是 Node 22+/24 才有的
// 内置模块，v20 的类型里还没有。运行时（Node 24）是有的，只是类型缺失。
//
// 这里只声明本项目实际用到的 API，保持最小面。等 @types/node 升到 v22+ 后
// 可以直接删掉本文件，改用官方类型。
declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }

  const constants: Record<string, unknown>
  export { constants }
}
