import type { Metadata } from "next"

import DeliveryCenter from "@/components/DeliveryCenter"

export const metadata: Metadata = {
  title: "交付中心 · VeyaTV",
  robots: { index: false, follow: false },
}

export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <DeliveryCenter projectId={projectId} />
}
