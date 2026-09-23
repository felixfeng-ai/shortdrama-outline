#!/bin/bash
# ============================================================
# 成剧 —— 生产部署脚本（在服务器上运行，不是本地）
#
# 位置：/opt/chengju/cicd-deploy.sh
# 用法：bash /opt/chengju/cicd-deploy.sh
#
# 由 GitHub Actions 调用（见 .github/workflows/deploy.yml），
# 也可以 ssh 上去手动跑，用于排查。
#
# 设计参照 interview-coach 的 cicd-deploy.sh，保留了它踩过的坑，
# 去掉了本项目不需要的部分（没有数据库、没有 prisma、没有小程序）。
# ============================================================
set -e

APP="chengju"
DIR="/opt/chengju"
PORT=3001

cd "$DIR"

echo "=== 1/6 备份 .env ==="
if [ -f .env ]; then
    cp .env ".env.bak.$(date +%Y%m%d%H%M)"
    # 只保留最近 5 份，避免堆一堆
    ls -1t .env.bak.* 2>/dev/null | tail -n +6 | xargs -r rm -f
    echo "已备份"
else
    echo "❌ 找不到 .env —— 首次部署需要先在服务器上创建它（内容见 README「部署」一节）"
    exit 1
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

echo "=== 4/6 停服 ==="
# 🔴 关键：npm run build 会覆盖 .next 目录。若进程还在跑，
# 它会读到写了一半的构建产物，直接 500。必须「先停 → 再构建 → 再启动」。
# 写成幂等：进程表可能已丢失，stop/delete 失败不中断脚本。
pm2 stop "$APP" 2>/dev/null || true
pm2 delete "$APP" 2>/dev/null || true

echo "=== 5/6 安装依赖 + 构建 ==="
# 用 npm ci 而不是 npm install：严格按 package-lock 安装，
# 避免国内镜像偶尔解压出残缺包导致的诡异运行时错误。
npm ci --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | tail -6

echo "=== 6/6 启动 ==="
# 用 ecosystem 配置文件启动，不依赖 PM2 遗留的进程表
pm2 start ecosystem.config.cjs
pm2 save

sleep 5
curl -s -o /dev/null -w "应用自检 http://127.0.0.1:$PORT/ → %{http_code}\n" \
    --max-time 20 "http://127.0.0.1:$PORT/" \
    || echo "⚠️  本地自检失败，执行 pm2 logs $APP 排查"

echo "✅ 部署完成"
