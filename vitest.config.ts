import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('shared')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'shared/**/*.{test,spec}.ts']
  }
})
