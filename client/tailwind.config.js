/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1F4E79',
        'navy-light': '#2E75B6',
        'navy-dark': '#163a5c',
      },
    },
  },
  plugins: [],
};
