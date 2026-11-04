import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'))
const errors = []
const warnings = []

if (!app.name || !app.version) errors.push('缺少应用名称或版本号')
if (!app.ios?.bundleIdentifier) errors.push('缺少 iOS Bundle ID')
if (!app.android?.package) errors.push('缺少 Android Package')
if (!app.scheme) errors.push('缺少 URL Scheme')
if (!eas.build?.production) errors.push('缺少 EAS production build profile')
if (!eas.submit?.production) errors.push('缺少 EAS submit profile')
if (!fs.existsSync(path.join(root, '.env.production'))) errors.push('缺少 .env.production')
if (!fs.existsSync(path.join(root, '..', 'docs', 'APP-STORE-SUBMISSION.md'))) {
  errors.push('缺少 App Store / Play 提交清单')
}
if (!fs.existsSync(path.join(root, '..', 'docs', 'CHINA-COMPLIANCE.md'))) {
  errors.push('缺少中国区合规清单')
}

const productionEnv = fs.existsSync(path.join(root, '.env.production'))
  ? fs.readFileSync(path.join(root, '.env.production'), 'utf8')
  : ''
if (/127\.0\.0\.1|localhost/.test(productionEnv)) {
  errors.push('生产 API 不能指向 localhost')
}

warnings.push('真机安装、APNs/FCM、商店沙盒购买和签名必须在 Apple/Google 账号环境中验证')
warnings.push('App 备案号、ICP 备案号、算法与生成式 AI 材料不能由代码生成')

for (const warning of warnings) console.log(`WARN ${warning}`)
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`)
  process.exit(1)
}
console.log('Store config gate passed. External signing and store review remain manual.')
