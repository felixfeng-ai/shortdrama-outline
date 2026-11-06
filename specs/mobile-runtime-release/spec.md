# App 运行时发布清单

## 目标

App 发布新版本时，只更新服务器运行时可读的发布清单，不修改 Web 代码、不重新构建、
不重新部署、不更换下载二维码。

## 需求

### MRR-1 稳定二维码

- 顶栏二维码固定指向 `https://chenju.work/app/download/android`。
- 扫码后直接重定向到最新 Android APK，不要求登录，也不先进入 Web 安装页。
- App 版本、APK 地址或更新说明变化时，二维码图片保持不变。

### MRR-2 运行时发布清单

- `/app` 每次请求读取服务器数据目录下的 `app-release.json`。
- 支持版本号、发布时间、Android URL、iOS URL 和更新说明。
- URL 只接受 HTTPS，非法值回退到环境变量或默认 EAS 构建页。
- JSON 缺失、损坏或部分字段不合法时，页面仍必须可访问。

### MRR-3 更新操作

- 运维使用 `npm run app:release -- ...` 原子更新清单。
- 更新后下一次请求立即生效，无需重启 PM2 或重新部署 Web。
- 发布数据放在 `CHENGJU_DATA_DIR`，不会被 Web 的 `git reset --hard` 覆盖。

### MRR-4 前端提示

- 二维码弹层展示当前 App 版本。
- 提供稳定直接下载地址 `/app/download/android`，系统浏览器打开后也直接下载 APK。

## 验收

- 修改发布清单后，扫码下载地址立即跳到新 APK，二维码图片保持不变。
- 静态二维码文件与 Web 构建产物不变。
- 损坏 JSON 不影响 `/app`、首页和健康接口。
- 发布脚本失败时不覆盖上一份有效清单。
