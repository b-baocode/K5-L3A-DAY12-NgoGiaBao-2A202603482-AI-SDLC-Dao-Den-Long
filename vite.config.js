import { defineConfig } from 'vite';
// base './' so `dist/` works as a static folder from any path (GitHub Release zip, file server).
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 800 } });
