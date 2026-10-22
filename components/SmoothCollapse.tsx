'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  children: ReactNode
  className?: string
  id?: string
  labelledBy?: string
}

export default function SmoothCollapse({ open, children, className = '', id, labelledBy }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (open) node.removeAttribute('inert')
    else node.setAttribute('inert', '')
  }, [open])

  return (
    <div
      ref={ref}
      id={id}
      role={labelledBy ? 'region' : undefined}
      aria-labelledby={labelledBy}
      aria-hidden={!open}
      data-state={open ? 'open' : 'closed'}
      className={`smooth-collapse ${open ? 'is-open' : ''} ${className}`.trim()}
    >
      <div className="smooth-collapse-clip">
        <div className="smooth-collapse-content">{children}</div>
      </div>
    </div>
  )
}
