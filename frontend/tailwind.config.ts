import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        sidebar: 'var(--bg-sidebar)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          hover: 'var(--bg-surface-hover)',
        },
        selected: 'var(--bg-selected)',
        content: {
          primary: 'var(--text-primary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          dashed: 'var(--border-dashed)',
        },
        state: {
          error: 'var(--state-error)',
          success: 'var(--state-success)',
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
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
