import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/library/',
  build: {
    sourcemap: true,
    target: 'es2022',
  },
});
