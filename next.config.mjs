/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node:sqlite 是 Node 内置模块，必须交给运行时而不是被打包器处理，
  // 否则 Next 在构建期会把 `node:sqlite` 当普通依赖去解析而报错。
  experimental: {
    serverComponentsExternalPackages: ["node:sqlite"],
  },
}

export default nextConfig
