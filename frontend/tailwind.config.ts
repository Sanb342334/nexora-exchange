import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#f7a600',
          50: '#fff8e6',
          100: '#ffedbf',
          400: '#f7a600',
          500: '#e69500',
          600: '#c27d00',
        },
        surface: {
          DEFAULT: '#0b0e11',
          50: '#151a1e',
          100: '#1e2329',
          200: '#2b3139',
          300: '#3a424c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
