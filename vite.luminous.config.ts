import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-luminous', rollupOptions: { input: ['luminous.html', 'comparison.html', 'flow-compare.html'] } },
});
