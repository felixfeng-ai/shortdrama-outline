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
      {/* 实心方块挖出负形 V，保证 16px favicon 到侧栏尺寸都只保留一个识别层。 */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 5h22v22H5zm3 4h5l3 9 3-9h5l-5.5 14h-5z"
      />
    </svg>
  )
}
