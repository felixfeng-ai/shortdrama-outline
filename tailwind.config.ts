import type { Config } from 'tailwindcss'

/**
 * 纸墨（Paper & Ink）：暖米纸底 + 幕布红一个强调色。
 *
 * 方向来自 concept-reference.png（用户确认稿），三条不能动的规则：
 *   1. 底色是暖米纸（带颗粒/纸纹），禁止纯白，禁止深色铺满；
 *   2. 强调色只有幕布红/朱砂一个，绿色彻底退场（原 success 改名 done，走暖赭）；
 *   3. 标题/品牌走衬线，正文走无衬线；卡片圆角 12-16px，阴影极轻。
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /** 页面/卡片的米纸底：暖、带一点黄，不是冷白 */
        surface: {
          DEFAULT: '#efe5d7',
          deep: '#e7dbca',
          card: '#fcf8f2',
          soft: '#f7f0e6',
          line: '#e6d9c6',
          'line-2': '#d8c8b2',
        },
        /** 正文与骨架：暖褐灰，落在纸上不刺眼 */
        ink: {
          50: '#f6f0e5',
          100: '#e9dcc9',
          200: '#cdbda8',
          300: '#ab9c89',
          400: '#8f7f6f',
          500: '#7a695c',
          600: '#5f4d41',
          700: '#4a3a30',
          800: '#3b2f27',
          900: '#2f2620',
        },
        /** 幕布红 / 朱砂：全站唯一强调色（品牌、主按钮、选中态、AI 点缀） */
        accent: {
          50: '#fbeceb',
          100: '#f7dedb',
          200: '#efc6c5',
          300: '#e09a9c',
          400: '#cf4a52',
          500: '#c0303a',
          600: '#a3252a',
          700: '#8e1a20',
          800: '#7d1418',
          900: '#5e0f12',
        },
        /**
         * 完成态：原来的 success 是绿色，与「幕布红唯一强调色」冲突，
         * 改成暖赭（纸上的印章色），只用在「已完成/已出图」这类小徽标上。
         */
        done: {
          50: '#f7f1e7',
          100: '#efe4d2',
          200: '#dfcfb0',
          300: '#c9b48e',
          400: '#b49b6f',
          500: '#a98f63',
          600: '#8e7749',
          700: '#6f5d38',
          800: '#57482b',
          900: '#40351f',
        },
        /** 分镜视觉（放映厅）：深棕黑面板 + 浅金参数值 */
        cinema: {
          DEFAULT: '#2a1f19',
          top: '#3a2c22',
          line: 'rgba(226, 195, 138, 0.18)',
          text: '#a2907c',
        },
        gold: {
          DEFAULT: '#d9be8a',
          dim: '#a98f63',
        },
      },
      fontFamily: {
        /** 标题/品牌：衬线（参考图的「成剧」「第一幕 · 铺垫」都是衬线） */
        serif: ['Georgia', 'Songti SC', 'SimSun', 'Noto Serif SC', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        /** 参考图：卡片 14px、内嵌块 12px、徽标 8px、胶囊按钮走全圆 */
        card: '14px',
        panel: '16px',
        chip: '8px',
        pill: '999px',
      },
      boxShadow: {
        /** 卡片：极轻的一层贴地 + 一层柔光，不用大范围弥漫阴影 */
        surface: '0 1px 2px rgba(94, 72, 50, 0.05), 0 12px 30px -24px rgba(94, 72, 50, 0.35)',
        lift: '0 2px 4px rgba(94, 72, 50, 0.06), 0 18px 36px -24px rgba(94, 72, 50, 0.42)',
        /** 主按钮的极淡光晕 */
        glow: '0 0 26px -4px rgba(198, 50, 60, 0.42), 0 10px 22px -14px rgba(140, 20, 28, 0.75)',
        cinema: '0 22px 40px -26px rgba(28, 20, 16, 0.75)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        /** AI 生成中的流光：让状态条自己会动，不需要额外的加载图标 */
        sweep: {
          '0%': { backgroundPosition: '-150% 0, 0 0' },
          '100%': { backgroundPosition: '250% 0, 0 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
        blink: 'blink 1.2s ease-in-out infinite',
        sweep: 'sweep 3s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
