# 生产邮箱登录配置

当前域名：`chenju.work`  
DNS 服务商：阿里云 HiChina  
应用发件人：`VeyaTV · 成剧 <login@chenju.work>`

## 1. AUTH_ALLOW_DEV_CODE

这个值不需要申请。

- 本地 `localhost` 联调可设为 `1`，接口只会在 localhost 返回开发验证码。
- 生产服务器必须设为 `0`。

已在本机 `.env.production.local` 中设为 `0`。

## 2. AUTH_SECRET

这是应用自己的验证码哈希密钥，不是 Resend 密钥。

已生成 32 字节强随机值并写入本机 `.env.production.local`。部署时把同一个值写入服务器 `/opt/chengju/.env`。

重新生成方式：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

更换该值会使已经签发但尚未验证的登录验证码失效，并影响现有会话签名；上线后不要频繁更换。

## 3. RESEND_API_KEY

必须在 Resend 账号内创建：

1. 打开 <https://resend.com>。
2. 注册或登录账号。
3. 进入 `Domains`，添加 `chenju.work`。
4. 按 Resend 页面显示的记录到阿里云 DNS 添加域名验证、SPF、DKIM，建议同时添加 DMARC。
5. 等 Resend 显示域名已验证。
6. 进入 `API Keys`，创建只允许发送邮件的 Key。
7. 将 Key 写入服务器 `.env`：

```dotenv
RESEND_API_KEY="re_..."
```

不要把 Key 写入 Git、聊天记录、前端代码或 `NEXT_PUBLIC_*` 变量。

## 4. 阿里云 DNS 记录

在阿里云域名控制台选择 `chenju.work`，进入“云解析 DNS”。

Resend 会给出该账号专属记录，名称通常包括：

- 域名验证记录（TXT）
- 发信子域 SPF（TXT）
- 发信子域 MX（服务地址和优先级）
- `resend._domainkey` DKIM（TXT）
- 可选 `_dmarc`（TXT）

必须复制 Resend 页面上的**实际值**，不要使用其他账号示例值。当前 `chenju.work` 已经解析到 `43.129.23.197`，但尚未检测到这些邮件记录。

## 5. AUTH_EMAIL_FROM

域名通过 Resend 验证后设置：

```dotenv
AUTH_EMAIL_FROM="VeyaTV · 成剧 <login@chenju.work>"
```

发件地址必须属于已验证域名。不要填写 Gmail、QQ 邮箱等外部地址，否则 Resend 会拒绝发送。

## 6. 部署验收

把上述配置写入服务器 `/opt/chengju/.env` 后执行：

```bash
npm run check:prod
```

必须无阻断项。然后测试：

1. QQ 邮箱接收验证码。
2. 163 邮箱接收验证码。
3. Gmail 接收验证码。
4. 检查垃圾箱和 SPF/DKIM/DMARC 结果。
5. 验证错误验证码、过期验证码、重新发送冷却和退出登录。
6. 验证同一账号在 Web/PWA 打开同一个项目。
