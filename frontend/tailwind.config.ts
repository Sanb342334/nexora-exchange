import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nexora: {
          bg: '#0B0E14',
          sidebar: '#0E1118',
          card: 'rgb(16 19 28 / <alpha-value>)',
          cardHover: '#161B26',
          border: 'rgba(255,255,255,0.06)',
          accent: 'rgb(123 97 255 / <alpha-value>)',
          accent2: '#9D50FF',
          neon: 'rgb(14 203 129 / <alpha-value>)',
          success: 'rgb(14 203 129 / <alpha-value>)',
          error: 'rgb(255 77 109 / <alpha-value>)',
          muted: '#848E9C',
          text: '#EAECEF',
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
        glow: '0 0 40px rgba(123, 97, 255, 0.35)',
        'glow-sm': '0 0 24px rgba(123, 97, 255, 0.2)',
        card: '0 8px 32px rgba(0,0,0,0.5)',
        neon: '0 0 24px rgba(14, 203, 129, 0.35)',
        'neon-sm': '0 0 16px rgba(14, 203, 129, 0.25)',
      },
      backgroundImage: {
        'nexora-gradient': 'linear-gradient(135deg, #7B61FF 0%, #6F3DFF 100%)',
        'nexora-hero': 'radial-gradient(ellipse at 70% 50%, rgba(123,97,255,0.18) 0%, transparent 60%)',
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
