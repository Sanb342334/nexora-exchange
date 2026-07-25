import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexora: {
          bg: 'var(--nexora-bg)',
          surface: 'var(--nexora-surface)',
          sidebar: 'var(--nexora-sidebar)',
          header: 'var(--nexora-header)',
          card: 'var(--nexora-card)',
          cardHover: 'var(--nexora-card-hover)',
          border: 'var(--nexora-border)',
          borderStrong: 'var(--nexora-border-strong)',
          hover: 'var(--nexora-hover)',
          accent: '#7B5CFF',
          accent2: '#9D50FF',
          neon: 'rgb(14 203 129 / <alpha-value>)',
          success: 'rgb(14 203 129 / <alpha-value>)',
          error: 'rgb(255 77 109 / <alpha-value>)',
          muted: 'var(--nexora-muted)',
          text: 'var(--nexora-text)',
        },
      },
      borderRadius: {
        nexora: '16px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space)', 'var(--font-inter)', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(123, 92, 255, 0.35)',
        'glow-sm': '0 0 24px rgba(123, 92, 255, 0.2)',
        card: '0 8px 32px rgba(0,0,0,0.5)',
        neon: '0 0 24px rgba(14, 203, 129, 0.35)',
        'neon-sm': '0 0 16px rgba(14, 203, 129, 0.25)',
      },
      backgroundImage: {
        'nexora-gradient': 'linear-gradient(135deg, #7B5CFF 0%, #6F3DFF 100%)',
        'nexora-hero': 'radial-gradient(ellipse at 70% 50%, rgba(123,92,255,0.18) 0%, transparent 60%)',
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-nexora-neon',
    'text-nexora-neon',
    'border-nexora-neon',
    'shadow-neon',
    'shadow-neon-sm',
  ],
};

export default config;
