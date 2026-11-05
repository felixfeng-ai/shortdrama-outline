interface Props {
  className?: string
}

export default function VeyaBrandMark({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 30 30" aria-hidden="true">
      <path d="M5 9 15 3l10 6v12l-10 6-10-6z" />
      <path d="m10 11 5 9 5-9" />
    </svg>
  )
}
