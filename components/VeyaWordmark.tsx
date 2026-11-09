interface Props {
  className?: string
}

/**
 * 主品牌只显示 VeyaTV。
 * TV 使用更轻字重，和实心负形 V 一起构成完整的品牌锁定组。
 */
export default function VeyaWordmark({ className }: Props) {
  return (
    <b className={["veya-wordmark", className].filter(Boolean).join(" ")}>
      <span>Veya</span>
      <span className="veya-wordmark-tv">TV</span>
    </b>
  )
}
