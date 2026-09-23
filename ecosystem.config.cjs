// PM2 进程配置 —— 参照 interview-coach 的写法
//
// 与 interview-coach 的一处改进：这个文件**入库**（不再 gitignore）。
// 它只负责把 .env 读进来，自身不含任何秘密；入库后 CI 的
// `git reset --hard origin/main` 能正常同步它，不会出现「服务器上改了配置但仓库里没有」的漂移。
// 真正的秘密只在 .env / .env.local，那两个仍然不入库。
const fs = require("fs")
const path = require("path")
const dotenv = require("dotenv")

// 服务器放 .env（与 interview-coach 一致），本地开发用 .env.local。
// 两个都读，.env.local 优先（沿用 Next.js 的优先级约定）。
//
// 注意不能简单写 dotenv.config()：它默认只读 .env，
// 服务器上若只放了 .env.local 就会一个变量都读不到，
// 应用会带着「未配置 DEEPSEEK_API_KEY」静默启动。
// 路径按 __dirname 解析，避免 pm2 从别的目录被调用时找不到文件。
const env = {}
for (const file of [".env", ".env.local"]) {
  const filePath = path.join(__dirname, file)
  if (fs.existsSync(filePath)) {
    Object.assign(env, dotenv.parse(fs.readFileSync(filePath)))
  }
}

module.exports = {
  apps: [{
    name: "chengju",
    script: "node_modules/next/dist/bin/next",
    // 3000 被同机的 interview-coach 占用，这里用 3001
    args: "start -p 3001",
    cwd: __dirname,
    env: {
      ...env,
      NODE_ENV: "production",
    },
    instances: 1,
    exec_mode: "fork",
    watch: false,
    max_memory_restart: "500M",
    error_file: "logs/error.log",
    out_file: "logs/output.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
  }]
}
