import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    esbuild: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'recharts'],
    },
    plugins: [react(), tailwindcss()],
  },
})
