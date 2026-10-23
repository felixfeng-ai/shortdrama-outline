export const PWA_MANIFEST = {
  name: "成剧 VeyaFrame",
  short_name: "成剧",
  description: "短剧与漫剧的 AI 分镜台",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#13171A",
  theme_color: "#13171A",
  lang: "zh-CN",
  categories: ["productivity", "entertainment"],
  shortcuts: [
    { name: "核心人物", short_name: "人物", url: "/?step=characters" },
    { name: "视觉定妆", short_name: "定妆", url: "/?step=visuals" },
    { name: "分镜", short_name: "分镜", url: "/?step=shots" },
  ],
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
} as const
