module.exports = {
  darkMode: 'class',
  content: [
    './src/web/index.html'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Microsoft JhengHei', 'PingFang TC', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#FFD54A',
          100: '#FFD54A',
          500: '#F5B400',
          600: '#ca8a04',
          700: '#a16207',
          900: '#713f12'
        },
        c3: {
          black: '#0A0A0A',
          dark: '#141414',
          gold: '#F5B400',
          goldLight: '#FFD54A',
          gray: '#BDBDBD'
        }
      }
    }
  }
};
