import type { Metadata } from 'next'

import ProjectReview from '@/components/ProjectReview'

export const metadata: Metadata = {
  title: '项目审阅 · 成剧 VeyaFrame',
  robots: { index: false, follow: false },
}

export default function ProjectSharePage({ params }: { params: { token: string } }) {
  return <ProjectReview token={params.token} />
}
