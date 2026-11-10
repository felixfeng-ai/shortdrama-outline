import type { Metadata } from "next"

import DeliveryOverview from "@/components/DeliveryOverview"

export const metadata: Metadata = {
  title: "交付中心 · VeyaTV",
  robots: { index: false, follow: false },
}

export default function DeliveryOverviewPage() {
  return <DeliveryOverview />
}
