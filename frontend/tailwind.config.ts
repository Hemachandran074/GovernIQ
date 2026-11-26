import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Notion Core System Tokens
        notion: {
          primary: 'var(--notion-primary)',
          'primary-active': 'var(--notion-primary-active)',
          secondary: 'var(--notion-secondary)',
          canvas: 'var(--notion-canvas)',
          'canvas-soft': 'var(--notion-canvas-soft)',
          surface: 'var(--notion-surface)',
          'surface-elevated': 'var(--notion-surface-elevated)',
          'surface-hover': 'var(--notion-surface-hover)',
          ink: 'var(--notion-ink)',
          'ink-secondary': 'var(--notion-ink-secondary)',
          'ink-muted': 'var(--notion-ink-muted)',
          'ink-faint': 'var(--notion-ink-faint)',
          hairline: 'var(--notion-hairline)',
          'hairline-subtle': 'var(--notion-hairline-subtle)',
          // Sticker Palette
          sky: 'var(--notion-accent-sky)',
          purple: 'var(--notion-accent-purple)',
          'purple-deep': 'var(--notion-accent-purple-deep)',
          pink: 'var(--notion-accent-pink)',
          orange: 'var(--notion-accent-orange)',
          'orange-deep': 'var(--notion-accent-orange-deep)',
          teal: 'var(--notion-accent-teal)',
          green: 'var(--notion-accent-green)',
          brown: 'var(--notion-accent-brown)',
        },
        base: 'var(--bg-base)',
        canvas: 'var(--bg-canvas)',
        sidebar: 'var(--bg-sidebar)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-surface-elevated)',
          hover: 'var(--bg-surface-hover)',
        },
        selected: 'var(--bg-selected)',
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          dashed: 'var(--border-dashed)',
          focus: 'var(--border-focus)',
        },
        state: {
          error: 'var(--state-error)',
          critical: 'var(--state-critical)',
          warning: 'var(--state-warning)',
          success: 'var(--state-success)',
          info: 'var(--state-info)',
        },
        node: {
          user: 'var(--node-user)',
          agent: 'var(--node-agent)',
          model: 'var(--node-model)',
          tool: 'var(--node-tool)',
          datasource: 'var(--node-datasource)',
          policy: 'var(--node-policy)',
        },
      },
      boxShadow: {
        float: 'var(--shadow-float)',
        glow: 'var(--shadow-glow)',
        'notion-level1': 'var(--shadow-notion-level1)',
        'notion-level2': 'var(--shadow-notion-level2)',
      },
      borderRadius: {
        'notion-xs': '4px',
        'notion-sm': '5px',
        'notion-md': '8px',
        'notion-lg': '12px',
        'notion-xl': '16px',
        'notion-full': '9999px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
