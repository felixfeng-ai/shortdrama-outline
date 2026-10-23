import type { MetadataRoute } from 'next'
import { PWA_MANIFEST } from '@/lib/pwa'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PWA_MANIFEST.name,
    short_name: PWA_MANIFEST.short_name,
    description: PWA_MANIFEST.description,
    start_url: PWA_MANIFEST.start_url,
    scope: PWA_MANIFEST.scope,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: PWA_MANIFEST.background_color,
    theme_color: PWA_MANIFEST.theme_color,
    lang: PWA_MANIFEST.lang,
    categories: [...PWA_MANIFEST.categories],
    shortcuts: PWA_MANIFEST.shortcuts.map((shortcut) => ({ ...shortcut })),
    icons: PWA_MANIFEST.icons.map((icon) => ({
      src: icon.src,
      sizes: icon.sizes,
      type: icon.type,
      purpose: icon.purpose,
    })),
  }
}
