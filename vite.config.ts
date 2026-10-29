import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    port: 5173,
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:5000',
    },
  },
});
