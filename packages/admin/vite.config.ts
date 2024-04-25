/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import * as path from 'path'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: './dist/client',
  },
  define: {
    'process.env': {},
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
