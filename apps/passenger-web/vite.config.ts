import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// In development the API is proxied, so the app, REST and Socket.IO share one origin
// (the httpOnly refresh cookie then works without cross-site settings).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const target = env.API_PROXY_TARGET || 'http://localhost:4000';
  return {
    envDir: '../..',
    plugins: [react(), tailwindcss()],
    resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query', 'react-router', 'i18next', 'react-i18next', 'zustand'] },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, ws: true, changeOrigin: true },
      },
    },
    preview: { port: 5173 },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            map: ['leaflet'],
            vendor: ['@tanstack/react-query', 'framer-motion', 'socket.io-client', 'i18next', 'react-i18next', 'zod'],
          },
        },
      },
    },
  };
});
