import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
