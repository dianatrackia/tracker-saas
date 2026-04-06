import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
          './pages/**/*.{js,ts,jsx,tsx,mdx}',
          './components/**/*.{js,ts,jsx,tsx,mdx}',
          './app/**/*.{js,ts,jsx,tsx,mdx}',
        ],
    theme: {
          extend: {
                  colors: {
                            brand: {
                                        50:  '#fff1f1',
                                        100: '#ffe0e0',
                                        500: '#E53535',
                                        600: '#CC2020',
                                        700: '#AA1818',
                                        900: '#7A1010',
                            },
                            navy: {
                                        900: '#0D1B2A',
                                        800: '#122035',
                                        700: '#1A2D45',
                                        600: '#243D5A',
                            },
                  },
          },
    },
    plugins: [],
}
export default config
