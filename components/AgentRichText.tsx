'use client'

import { Fragment, type ReactNode } from 'react'
import { STEPS, type StepKey } from '@/lib/types'

interface Props {
  text: string
  onOpenStep?: (step: StepKey) => void
}

const DOC_HREF = (file: string, anchor: string) =>
  `https://github.com/felixfeng-ai/shortdrama-outline/blob/main/${file}#${encodeURIComponent(anchor)}`

const STEP_NAMES = new Set(STEPS.flatMap((step) => [step.nav, step.title]))
const TOKEN_RE = /((?:README|AGENT)\.md#[^\s，。；、）)]+|核心人物|三幕大纲|分集剧情|视觉定妆|场景|分镜)/g

export default function AgentRichText({ text, onOpenStep }: Props) {
  const nodes: ReactNode[] = []

  for (const [index, part] of text.split(TOKEN_RE).entries()) {
    if (!part) continue

    if (part.startsWith('README.md#') || part.startsWith('AGENT.md#')) {
      const [file, anchor] = part.split('#', 2)
      nodes.push(
        <a
          key={`${part}-${index}`}
          className="agent-doc-link"
          href={DOC_HREF(file, anchor ?? '')}
          target="_blank"
          rel="noreferrer"
          title={`打开 ${part}`}
        >
          {part}
        </a>,
      )
      continue
    }

    if (STEP_NAMES.has(part) && onOpenStep) {
      const step = STEPS.find((item) => item.nav === part || item.title === part)
      if (step) {
        nodes.push(
          <button
            key={`${part}-${index}`}
            type="button"
            className="agent-inline-jump"
            onClick={() => onOpenStep(step.key)}
            title={`前往${step.nav}`}
          >
            {part}
            <span aria-hidden="true">↗</span>
          </button>,
        )
        continue
      }
    }

    nodes.push(<Fragment key={`${part}-${index}`}>{part}</Fragment>)
  }

  return <>{nodes}</>
}
