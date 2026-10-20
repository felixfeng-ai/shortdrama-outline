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
        /**
         * 颜色全部走 CSS 变量（见 globals.css 的 :root / [data-theme]）。
         *
         * 为什么要这样：同一份界面要能出三套底色（原味纸墨 / 提白 / 冷白）互相对照，
         * 写死十六进制就只能在构建时定一套。变量用「通道三元组」写法，
         * 这样 bg-surface/70 这类透明度修饰符还能正常工作。
         */
        /** 页面/卡片的底 */
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          deep: 'rgb(var(--c-surface-deep) / <alpha-value>)',
          card: 'rgb(var(--c-surface-card) / <alpha-value>)',
          soft: 'rgb(var(--c-surface-soft) / <alpha-value>)',
          line: 'rgb(var(--c-surface-line) / <alpha-value>)',
          'line-2': 'rgb(var(--c-surface-line-2) / <alpha-value>)',
        },
        /** 正文与骨架 */
        ink: {
          50: 'rgb(var(--c-ink-50) / <alpha-value>)',
          100: 'rgb(var(--c-ink-100) / <alpha-value>)',
          200: 'rgb(var(--c-ink-200) / <alpha-value>)',
          300: 'rgb(var(--c-ink-300) / <alpha-value>)',
          400: 'rgb(var(--c-ink-400) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
        },
        /** 幕布红 / 朱砂：全站唯一强调色（品牌、主按钮、选中态、AI 点缀） */
        accent: {
          50: 'rgb(var(--c-accent-50) / <alpha-value>)',
          100: 'rgb(var(--c-accent-100) / <alpha-value>)',
          200: 'rgb(var(--c-accent-200) / <alpha-value>)',
          300: 'rgb(var(--c-accent-300) / <alpha-value>)',
          400: 'rgb(var(--c-accent-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent-600) / <alpha-value>)',
          700: 'rgb(var(--c-accent-700) / <alpha-value>)',
          800: 'rgb(var(--c-accent-800) / <alpha-value>)',
          900: 'rgb(var(--c-accent-900) / <alpha-value>)',
        },
        /**
         * 完成态：原来的 success 是绿色，与「幕布红唯一强调色」冲突，
         * 改成暖赭（纸上的印章色），只用在「已完成/已出图」这类小徽标上。
         */
        done: {
          50: 'rgb(var(--c-done-50) / <alpha-value>)',
          100: 'rgb(var(--c-done-100) / <alpha-value>)',
          200: 'rgb(var(--c-done-200) / <alpha-value>)',
          300: 'rgb(var(--c-done-300) / <alpha-value>)',
          400: 'rgb(var(--c-done-400) / <alpha-value>)',
          500: 'rgb(var(--c-done-500) / <alpha-value>)',
          600: 'rgb(var(--c-done-600) / <alpha-value>)',
          700: 'rgb(var(--c-done-700) / <alpha-value>)',
          800: 'rgb(var(--c-done-800) / <alpha-value>)',
          900: 'rgb(var(--c-done-900) / <alpha-value>)',
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
        /**
         * 西文/数字：Albert Sans（自托管 latin 子集，约 32KB）。
         * 中文：系统栈，优先苹方，其次鸿蒙/MiSans，最后微软雅黑。
         * 不引中文字体——主流的即梦/可灵/豆包也都是这个策略。
         */
        serif: ['Georgia', 'Songti SC', 'SimSun', 'Noto Serif SC', 'serif'],
        sans: [
          'var(--font-latin)',
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'HarmonyOS Sans SC',
          'MiSans',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans SC',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
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
