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
if (eas.build?.preview?.distribution !== 'internal') {
  errors.push('preview profile 必须使用 internal distribution')
}
if (eas.build?.preview?.android?.buildType !== 'apk') {
  errors.push('preview profile 必须为 Android 产出 APK')
}
if (eas.build?.preview?.android?.image !== 'latest' || eas.build?.preview?.ios?.image !== 'latest') {
  errors.push('preview profile 必须配置 GitHub 构建镜像 latest')
}
if (eas.build?.production?.android?.image !== 'latest' || eas.build?.production?.ios?.image !== 'latest') {
  errors.push('production profile 必须配置 GitHub 构建镜像 latest')
}
if (eas.build?.preview?.env?.EXPO_PUBLIC_API_URL !== 'https://chenju.work') {
  errors.push('preview profile 必须连接 https://chenju.work')
}
if (!fs.existsSync(path.join(root, '.env.production'))) errors.push('缺少 .env.production')
if (!fs.existsSync(path.join(root, '..', 'docs', 'APP-STORE-SUBMISSION.md'))) {
  errors.push('缺少 App Store / Play 提交清单')
}
if (!fs.existsSync(path.join(root, '..', 'docs', 'IOS-TESTFLIGHT-ANDROID-APK.md'))) {
  errors.push('缺少 iOS / Android 内测构建说明')
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
const productionApi = productionEnv.match(/^EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m)?.[1] ?? ''
if (!productionApi.startsWith('https://')) {
  errors.push('.env.production 必须配置 HTTPS API')
}
if (!app.extra?.eas?.projectId) {
  warnings.push('尚未配置 EAS Project ID：首次构建前必须由 eas init 生成，不要手填假 ID')
}

warnings.push('真机安装、APNs/FCM、商店沙盒购买和签名必须在 Apple/Google 账号环境中验证')
warnings.push('App 备案号、ICP 备案号、算法与生成式 AI 材料不能由代码生成')

for (const warning of warnings) console.log(`WARN ${warning}`)
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`)
  process.exit(1)
}
console.log('Store config gate passed. External signing and store review remain manual.')
