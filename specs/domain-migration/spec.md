# veyatv.com 域名迁移

## 目标

- 将 `https://veyatv.com` 设为唯一 canonical 站点。
- 保证旧站 `https://chenju.work` 与 `https://www.chenju.work` 的现有链接继续可用。
- 用户从旧域进入新域时，保留匿名项目会话和登录会话，不因跨域 Cookie 丢失项目。

## 域名规则

- `veyatv.com`：正式站点，所有页面、API、sitemap、robots 和分享链接使用该域名。
- `www.veyatv.com`：永久重定向到 `https://veyatv.com`。
- `chenju.work`、`www.chenju.work`：保留 HTTPS，浏览器导航通过一次性 handoff 迁移到新域。
- 旧域的 API 和非导航请求直接以 `308` 指向新域同路径。

## 会话迁移

1. 旧域收到浏览器导航请求。
2. 旧域 `/api/domain-migration/start` 读取匿名会话 Cookie 与登录 Cookie。
3. 服务端使用 `AUTH_SECRET` 派生密钥，通过 AES-256-GCM 生成最长 5 分钟有效的一次性 token。
4. 浏览器进入新域 `/api/domain-migration/complete?token=...`。
5. 新域验证 token、写入相同 Cookie，并重定向到原路径。
6. token 不允许跨站开放重定向；目标路径必须是站内绝对路径。

## 邮件

- 邮件发件域暂时保留 `chenju.work`。
- 在 `veyatv.com` 的 Resend/MX/DKIM/SPF 记录验证完成前，不修改 `AUTH_EMAIL_FROM`，避免登录验证码中断。

## 部署

- Nginx 配置文件改为 `deploy/nginx-veyatv.com.conf`。
- `veyatv.com` 与 `www.veyatv.com` 使用新证书。
- `chenju.work` 与 `www.chenju.work` 使用旧证书并继续代理到同一应用。
- 新证书签发前不得重载 Nginx。
- DNS 未指向服务器前不得执行域名切换。
