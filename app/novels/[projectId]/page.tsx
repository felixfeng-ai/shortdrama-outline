import type { Metadata } from "next"

import NovelWorkspace from "@/components/NovelWorkspace"

export const metadata: Metadata = {
  title: "小说工作台 · VeyaTV",
  description: "复用短剧项目的人物、分集、场次与 Canon，生成可编辑、可导出的长篇连载初稿。",
}

type PageProps = {
  params: { projectId: string } | Promise<{ projectId: string }>
}

export default async function NovelPage({ params }: PageProps) {
  const { projectId } = await params
  return <NovelWorkspace projectId={decodeURIComponent(projectId)} />
}
