/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7B00E0',
          blue:   '#1565C0',
          yellow: '#FFC107',
          green: {
            dark: '#1B4332',
            mid:  '#2E7D32',
          },
          red:    '#D32F2F',
          pink:   '#FCE4EC',
          grey: {
            light:  '#F5F5F5',
            border: '#E0E0E0',
            dark:   '#424242',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif']
      },
      borderRadius: {
        pill: '9999px',
        card: '8px',
      }
    }
  },
  plugins: []
}
