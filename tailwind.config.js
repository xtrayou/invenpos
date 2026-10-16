/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#102a43', teal: { 50: '#eaf0f8', 100: '#d8e3f1', 500: '#315d91', 600: '#1f4e85', 700: '#173d6b' } },
      boxShadow: { soft: '0 8px 30px rgba(23,43,77,.06)' }
    }
  },
  plugins: []
}
