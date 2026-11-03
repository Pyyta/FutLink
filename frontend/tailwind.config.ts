import type { Config } from 'tailwindcss';

/**
 * Tokens del prototipo FutLink.
 *
 * - Fondo de pantallas: blanco y superficies menta.
 * - Primario: esmeralda; destructivo: rojo.
 * - Identidad del logo: azul marino profundo con degradado lima → turquesa → cian.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#001C39',
          900: '#052A4A',
          800: '#0A3B60',
          700: '#0F4C78',
        },
        primary: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#0E9F6E',
          700: '#0B7F58',
          800: '#086347',
          900: '#064E3B',
        },
        accent: {
          lime: '#C8FF4D',
          turquoise: '#2FE0C0',
          cyan: '#22D3EE',
        },
        mint: {
          DEFAULT: '#E8F8F1',
          strong: '#D2F2E4',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          sunken: '#F2F7F5',
          muted: '#F8FBF9',
        },
        ink: {
          DEFAULT: '#0B1F2A',
          soft: '#54666F',
          faint: '#7C8C93',
        },
        line: {
          DEFAULT: '#DCE7E2',
          strong: '#C6D6CF',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          600: '#0E9F6E',
          700: '#0B7F58',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Inter',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        display: [
          '1.75rem',
          { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '800' },
        ],
        title: [
          '1.375rem',
          { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' },
        ],
        heading: ['1.125rem', { lineHeight: '1.3', fontWeight: '700' }],
        body: ['0.9375rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.35', letterSpacing: '0.01em' }],
      },
      borderRadius: {
        card: '20px',
        sheet: '28px',
        pill: '999px',
        control: '14px',
      },
      boxShadow: {
        card: '0 10px 30px -18px rgba(0, 28, 57, 0.35)',
        nav: '0 -10px 30px -24px rgba(0, 28, 57, 0.45)',
        glow: '0 0 28px rgba(47, 224, 192, 0.35)',
        frame: '0 30px 80px -40px rgba(0, 28, 57, 0.45)',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(120deg, #C8FF4D 0%, #2FE0C0 52%, #22D3EE 100%)',
        'brand-glow':
          'radial-gradient(circle at 20% 20%, rgba(200, 255, 77, 0.25), transparent 45%), radial-gradient(circle at 85% 70%, rgba(34, 211, 238, 0.22), transparent 50%)',
      },
      maxWidth: {
        app: '430px',
      },
      keyframes: {
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'sheet-up': 'sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'toast-in': 'toast-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
