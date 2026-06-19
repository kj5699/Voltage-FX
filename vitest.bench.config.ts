import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['scripts/run-benchmark.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@ws':         resolve(__dirname, 'src/ws'),
      '@store':      resolve(__dirname, 'src/store'),
      '@pipelines':  resolve(__dirname, 'src/pipelines'),
      '@hooks':      resolve(__dirname, 'src/hooks'),
      '@components': resolve(__dirname, 'src/components'),
      '@config':     resolve(__dirname, 'src/config'),
      '@utils':      resolve(__dirname, 'src/utils'),
      '@workers':    resolve(__dirname, 'src/workers'),
    },
  },
})
