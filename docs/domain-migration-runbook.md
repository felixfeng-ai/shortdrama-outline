# veyatv.com 域名切换操作单

## 当前状态

- 正式域名：`veyatv.com`
- 旧域名：`chenju.work`、`www.chenju.work`
- DNS 服务商：阿里云 HiChina（`dns3.hichina.com` / `dns4.hichina.com`）
- 生产源站：`43.129.23.197`
- 80/443 端口已验证可达
- 公共 DNS 已确认 `veyatv.com` / `www.veyatv.com` 指向 `43.129.23.197`

## 1. 添加 DNS

在阿里云云解析 DNS 中添加：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---|---|---|---|
| A | `@` | `43.129.23.197` | 600 |
| A | `www` | `43.129.23.197` | 600 |

保留 `chenju.work` 与 `www.chenju.work` 的现有记录，不要提前删除。

验证：

```powershell
Resolve-DnsName veyatv.com -Type A
Resolve-DnsName www.veyatv.com -Type A
```

两条都应返回 `43.129.23.197`。

## 2. 部署代码

代码部署后，生产环境会获得：

- `CHENGJU_SITE_URL=https://veyatv.com`
- 新旧域 CORS allowlist
- 旧域到新域的加密会话交接

正式切换时将 GitHub Actions 中设置为
`CHENGJU_DOMAIN_MIGRATION_ENABLED=1`：

- 部署脚本会在停服前先签发证书并安装 Nginx
- 证书失败时立即中止，旧站继续运行
- 证书成功后才启动新版本并启用旧域交接

## 3. 签发新域证书

DNS 生效后，在服务器仓库目录执行：

```bash
cd /opt/chengju
sudo bash deploy/bootstrap-veyatv-domain.sh
```

脚本会：

1. 安装临时 HTTP challenge 配置
2. 为 `veyatv.com` 和 `www.veyatv.com` 签发证书
3. 安装正式 Nginx 配置
4. 启用 `www.veyatv.com → veyatv.com`
5. 保留旧域入口，由应用层迁移 Cookie

## 4. 开启后的行为

此版本会启用：

- `chenju.work → veyatv.com` 会话交接
- 旧域 API `308` 到新域
- `www.veyatv.com → veyatv.com`

## 5. 验证

```bash
curl -I https://veyatv.com
curl -I https://www.veyatv.com
curl -I https://chenju.work
```

期望：

- `veyatv.com` 返回 200
- `www.veyatv.com` 返回 301 到 `https://veyatv.com`
- `chenju.work` 完成交接后进入 `veyatv.com`
- 未登录项目、已登录账号在跳转后仍能看到原项目

## 6. 邮件域

邮件发件域暂时继续使用 `chenju.work`，直到：

- Resend 添加并验证 `veyatv.com`
- SPF、DKIM、MX 记录验证通过
- 实际测试 `login@veyatv.com` 可以送达

完成后再修改 `AUTH_EMAIL_FROM` 和支持邮箱，避免验证码登录中断。
