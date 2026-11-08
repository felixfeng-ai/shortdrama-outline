import type { Metadata } from "next"

import ReviewRoom from "@/components/ReviewRoom"

export const metadata: Metadata = {
  title: "审片 · VeyaTV",
  robots: { index: false, follow: false },
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ReviewRoom token={token} />
}
