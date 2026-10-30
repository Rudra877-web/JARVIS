/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#02040a',
          900: '#040814',
          800: '#070e1f',
          700: '#0c162e',
          600: '#142245',
        },
        line: '#0f2744',
        accent: {
          DEFAULT: '#00f2fe',
          soft: 'rgba(0, 242, 254, 0.12)',
        },
        violet: {
          DEFAULT: '#8b5cf6',
          soft: 'rgba(139, 92, 246, 0.15)',
        },
        hud: {
          cyan: '#00f2fe',
          blue: '#0284c7',
          sky: '#38bdf8',
          dark: '#020612',
          panel: 'rgba(4, 10, 26, 0.85)',
          border: 'rgba(0, 242, 254, 0.28)',
          glow: 'rgba(0, 242, 254, 0.45)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        orbitron: ['Orbitron', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
      boxShadow: {
        card: '0 0 0 1px rgba(0,242,254,0.15), 0 8px 32px -8px rgba(0,0,0,0.8)',
        hud: '0 0 20px rgba(0,242,254,0.25), inset 0 0 15px rgba(0,242,254,0.05)',
        reactor: '0 0 50px rgba(0,242,254,0.4)',
      },
      animation: {
        'spin-slow': 'spin-cw 20s linear infinite',
        'spin-reverse': 'spin-ccw 15s linear infinite',
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
};
