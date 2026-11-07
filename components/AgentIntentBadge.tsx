"use client"

import { useMemo } from "react"

import { detectAgentIntent } from "@/lib/agent/intent"

interface Props {
  text: string
}

export default function AgentIntentBadge({ text }: Props) {
  const intent = useMemo(() => detectAgentIntent(text), [text])
  if (!text.trim()) return null

  return (
    <span className={`agent-intent-badge is-${intent.intent}`} title={intent.recommendedAction}>
      <i />
      {intent.label}
    </span>
  )
}
