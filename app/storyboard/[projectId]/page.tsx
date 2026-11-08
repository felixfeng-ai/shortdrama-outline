import type { Metadata } from "next"

import StoryboardPreview from "@/components/StoryboardPreview"
import "../storyboard.css"

export const metadata: Metadata = {
  title: "动态分镜 · VeyaTV",
  description: "按真实镜头顺序播放已采用的视频和首帧素材。",
  robots: { index: false, follow: false },
}

export default async function StoryboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <StoryboardPreview projectId={projectId} />
}
