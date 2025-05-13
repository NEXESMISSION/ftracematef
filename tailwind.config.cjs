/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#e6f1ff',
          100: '#cce3ff',
          200: '#99c8ff',
          300: '#66acff',
          400: '#3391ff',
          500: '#0075ff',
          600: '#005ecc',
          700: '#004699',
          800: '#002f66',
          900: '#001733',
        },
        orange: {
          50: '#fff3e6',
          100: '#ffe8cc',
          200: '#ffd199',
          300: '#ffba66',
          400: '#ffa333',
          500: '#ff8c00',
          600: '#cc7000',
          700: '#995400',
          800: '#663800',
          900: '#331c00',
        },
        dark: {
          100: '#1a1b25',
          200: '#16171f',
          300: '#121319',
          400: '#0e0f13',
          500: '#0a0a0d',
          900: '#050507',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'blue-orange-gradient': 'linear-gradient(135deg, var(--tw-gradient-stops))',
        'dark-gradient': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
      },
      animation: {
        'gradient-x': 'gradient-x 10s ease infinite',
        'gradient-y': 'gradient-y 10s ease infinite',
        'gradient-xy': 'gradient-xy 10s ease infinite',
      },
      keyframes: {
        'gradient-y': {
          '0%, 100%': {
            'background-size': '400% 400%',
            'background-position': 'center top'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'center center'
          }
        },
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          }
        },
        'gradient-xy': {
          '0%, 100%': {
            'background-size': '400% 400%',
            'background-position': 'left top'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right bottom'
          }
        }
      },
    },
  },
  plugins: [],
}
