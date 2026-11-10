interface Props {
  className?: string
}

export default function VeyaBrandMark({ className }: Props) {
  return (
    <svg
      className={["veya-brand-mark", className].filter(Boolean).join(" ")}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {/* 使用已选定的 D「实心负形」原始几何，后续不得为了字形优化重新绘制。 */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 5h22v22H5zm4 4v14h4l3-9 3 9h4V9h-4l-3 8-3-8z"
      />
    </svg>
  )
}
