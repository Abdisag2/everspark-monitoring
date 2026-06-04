/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Ever Spark brand teal (from the infinity logo)
        brand: {
          50:  '#effdfb',
          100: '#cdfaf3',
          200: '#9bf3e8',
          300: '#61e6d9',
          400: '#30cdc1',
          500: '#15b1a6',
          600: '#0d8e87',
          700: '#10726d',
          800: '#125b58',
          900: '#134c4a',
          950: '#042f2e',
        },
        // Deep teal-green used in the wordmark / ink
        ink: {
          DEFAULT: '#0f2e2b',
          soft: '#1c3f3b',
        },
        // Secondary slate-blue accent (per spec #0284c7)
        accent: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 46, 43, 0.04), 0 1px 3px 0 rgba(15, 46, 43, 0.06)',
        'card-hover': '0 4px 12px -2px rgba(15, 46, 43, 0.10), 0 2px 6px -2px rgba(15, 46, 43, 0.08)',
        glow: '0 0 0 4px rgba(21, 177, 166, 0.12)',
      },
      keyframes: {
        'slide-in':   { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in':    { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in':   { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'pulse-dot':  { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.55', transform: 'scale(1.35)' } },
        shimmer:      { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'slide-in':  'slide-in 0.3s ease-out',
        'fade-in':   'fade-in 0.4s ease-out',
        'scale-in':  'scale-in 0.2s ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
