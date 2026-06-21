import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    // Ensures react-dom picks the dev build in dev mode (enables React DevTools Profiler)
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  resolve: {
    alias: {
      '@ws': resolve(__dirname, 'src/ws'),
      '@store': resolve(__dirname, 'src/store'),
      '@pipelines': resolve(__dirname, 'src/pipelines'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@components': resolve(__dirname, 'src/components'),
      '@config': resolve(__dirname, 'src/config'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@workers': resolve(__dirname, 'src/workers'),
    },
  },
}))
