export const PWA_MANIFEST = {
  name: "VeyaTV",
  short_name: "VeyaTV",
  description: "AI 短剧与漫剧生产平台",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#08090A",
  theme_color: "#08090A",
  lang: "zh-CN",
  categories: ["productivity", "entertainment"],
  shortcuts: [
    { name: "核心人物", short_name: "人物", url: "/?step=characters" },
    { name: "视觉定妆", short_name: "定妆", url: "/?step=visuals" },
    { name: "分镜", short_name: "分镜", url: "/?step=shots" },
  ],
  icons: [
    {
      src: "/veyatv-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "/veyatv-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
} as const
