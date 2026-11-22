import type { Metadata } from "next"

import WorkspaceStart from "@/components/WorkspaceStart"
import "@/app/workspace-shell.css"

export const metadata: Metadata = {
  title: "VeyaTV · AI 短剧生产平台",
  robots: { index: false, follow: false },
}

export default function StartPage() {
  return <WorkspaceStart />
}
