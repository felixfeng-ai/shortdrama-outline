import type { MetadataRoute } from 'next'

/** 站点地图：只有首页一个公开页面，但提交给搜索引擎的入口必须有 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.CHENGJU_SITE_URL || 'https://chenju.work'
  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
