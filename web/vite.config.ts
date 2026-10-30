import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.VITE_API_TARGET ?? 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
});
