#!/bin/bash
# ============================================================
# 成剧 —— 生产部署脚本（在服务器上运行，不是本地）
#
# 用法：bash /opt/chengju/deploy/cicd-deploy.sh
# 由 GitHub Actions 调用（见 .github/workflows/deploy.yml），
# 也可以 ssh 上去手动跑，用于排查。
#
# 设计参照 interview-coach 的 cicd-deploy.sh，保留了它踩过的坑，
# 去掉了本项目不需要的部分（没有数据库、没有 prisma、没有小程序）。
# ============================================================

# ---- 自我复制后再执行 ----------------------------------------
# 不能省这一步。下面的 `git reset --hard` 会覆盖本文件，
# 而 bash 是「边读边执行」的——脚本正在被覆盖时，执行指针会落到新内容的
# 中间，行为不可预期。先把自己复制到 /tmp 再 exec，git 之后怎么改仓库里的
# 文件都与本次执行无关。
#
# interview-coach 的做法是把 cicd-deploy.sh 完全放在仓库外（只存在服务器上），
# 代价是那个脚本没有版本管理。这样写可以两者兼得。
if [ "$0" != "/tmp/chengju-deploy.sh" ]; then
    cp -f "$0" /tmp/chengju-deploy.sh || { echo "❌ 无法复制脚本到 /tmp"; exit 1; }
    exec bash /tmp/chengju-deploy.sh "$@"
fi
# -------------------------------------------------------------

set -euo pipefail

APP="chengju"
DIR="/opt/chengju"
PORT=3001

cd "$DIR"

# 资产链的 SQLite 库放在项目目录之外：git reset --hard 与 .next 构建都碰不到它
export CHENGJU_DATA_DIR="${CHENGJU_DATA_DIR:-/opt/chengju/data}"

echo "=== 1/6 备份 .env 与资产库 ==="
mkdir -p "$CHENGJU_DATA_DIR"
# SQLite 用 WAL 模式，备份前必须把 WAL 合并回主库，
# 否则直接拷 .db 会丢掉最近一次写入。
if [ -f "$CHENGJU_DATA_DIR/chengju.db" ]; then
    command -v sqlite3 >/dev/null 2>&1 && sqlite3 "$CHENGJU_DATA_DIR/chengju.db" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
    cp "$CHENGJU_DATA_DIR/chengju.db" "$CHENGJU_DATA_DIR/chengju.db.bak.$(date +%Y%m%d%H%M)"
    ls -1t "$CHENGJU_DATA_DIR"/chengju.db.bak.* 2>/dev/null | tail -n +6 | xargs -r rm -f
    echo "资产库已备份"
else
    echo "资产库还不存在（首次部署正常）"
fi
if [ -f .env ]; then
    cp .env ".env.bak.$(date +%Y%m%d%H%M)"
    # 只保留最近 5 份，避免堆一堆
    ls -1t .env.bak.* 2>/dev/null | tail -n +6 | xargs -r rm -f
    echo "已备份"
else
    echo "❌ 找不到 .env —— 首次部署需要先在服务器上创建它（内容见 README「部署」一节）"
    exit 1
fi

# App 下载二维码只指向稳定路由，真实 APK 地址保存在运行时清单。
# 首次部署写入引导清单；后续 App 发版通过 npm run app:release 原子更新，
# Web 重新部署时绝不能用仓库里的旧地址覆盖服务器上的最新值。
APP_RELEASE_FILE="$CHENGJU_DATA_DIR/app-release.json"
if [ ! -f "$APP_RELEASE_FILE" ]; then
    install -m 600 deploy/app-release.bootstrap.json "$APP_RELEASE_FILE"
    echo "已写入初始 App 发布清单"
else
    echo "保留现有 App 发布清单"
fi

echo "=== 2/6 同步代码 ==="
# 服务器是 GitHub main 的镜像：服务器上的未提交改动会被这里清掉。
# 要上线的任何改动都必须先 commit + push。
git fetch origin main --quiet
git reset --hard origin/main --quiet
echo "当前版本: $(git log -1 --format='%h %s')"

echo "=== 3/6 校验 .env 仍在 ==="
# .env 是未跟踪文件，reset --hard 不会动它。这里只是防御性断言，
# 防止哪天有人手滑把 .env 提交进仓库又被 reset 掉。
[ -f .env ] || { echo "❌ .env 在代码同步后丢失，中止部署"; exit 1; }
echo "=== 3/6 校验生产账号与关键配置 ==="
node scripts/apply-deploy-env.mjs
npm run check:prod

# 新版部署脚本在构建前做完整备份：数据库用一致性快照，generated/ 图片连同
# SHA-256 manifest 一起保存。备份失败时中止部署，避免无保护地覆盖生产。
echo "=== 3/6 完整备份数据库与生成图片 ==="
CHENGJU_APP_VERSION="$(git rev-parse --short HEAD)" \
CHENGJU_BACKUP_KEEP="${CHENGJU_BACKUP_KEEP:-7}" \
node scripts/backup-data.mjs

echo "=== 4/6 停服 ==="
# 🔴 关键：npm run build 会覆盖 .next 目录。若进程还在跑，
# 它会读到写了一半的构建产物，直接 500。必须「先停 → 再构建 → 再启动」。
# 写成幂等：进程表可能已丢失，stop/delete 失败不中断脚本。
pm2 stop "$APP" 2>/dev/null || true
pm2 delete "$APP" 2>/dev/null || true

echo "=== 5/6 安装依赖 + 构建 ==="
# logs/ 是 PM2 的输出目录，首次部署时还不存在
mkdir -p logs
# 用 npm ci 而不是 npm install：严格按 package-lock 安装，
# 避免国内镜像偶尔解压出残缺包导致的诡异运行时错误。
rm -rf node_modules
npm cache verify >/tmp/chengju-npm-cache.log 2>&1 || true
if ! npm ci --no-audit --no-fund --prefer-online >/tmp/chengju-npm-ci.log 2>&1; then
    echo "❌ npm ci 失败，完整日志："
    tail -n 100 /tmp/chengju-npm-ci.log
    exit 1
fi
tail -n 4 /tmp/chengju-npm-ci.log
# npm ci 在某些镜像下可能返回成功但解压残缺。构建前直接检查 Next 的
# 命令入口和本次构建依赖的内置页面，缺失时立即失败并保留完整日志。
test -f node_modules/next/dist/bin/next || {
    echo "❌ Next 命令入口缺失，node_modules 未完整安装"
    exit 1
}
test -f node_modules/next/dist/client/components/builtin/global-not-found.js || {
    echo "❌ Next 内置页面缺失，node_modules 未完整安装"
    exit 1
}
if ! npm run build >/tmp/chengju-build.log 2>&1; then
    echo "❌ 生产构建失败，完整日志："
    tail -n 120 /tmp/chengju-build.log
    exit 1
fi
tail -n 8 /tmp/chengju-build.log

echo "=== 6/6 启动 ==="
# 用 ecosystem 配置文件启动，不依赖 PM2 遗留的进程表
pm2 start ecosystem.config.cjs
pm2 save

sleep 5
curl -s -o /dev/null -w "应用自检 http://127.0.0.1:$PORT/ → %{http_code}\n" \
    --max-time 20 "http://127.0.0.1:$PORT/" \
    || echo "⚠️  本地自检失败，执行 pm2 logs $APP 排查"

echo "✅ 部署完成"
